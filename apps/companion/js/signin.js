/* The sign-in screens (index.html #login, #notClient) and the address in the account menu.
   The auth calls themselves are in auth.js; once one succeeds, auth.js hears SIGNED_IN and
   the shell renders the app.

   Four steps, one visible at a time, each a <form> so Return submits:
     password  email + password, the main path (as in the Vela app)
     email     "Email me a code instead": the email to send a six-digit code to
     code      the six digits; signs in as the sixth lands
     newpw     a reset link brought her here: choose a new password */

// Supabase's own errors, sorted into the few cases she can act on. Pure, so it can be
// tested without a browser.
function signinErrorKind(e) {
  if (!e) return "";
  const m = String(e.message || "") + " " + String(e.code || ""), s = e.status;
  if (e.name === "AuthRetryableFetchError" || s === 0 || /failed to fetch|networkerror|load failed|network request failed/i.test(m)) return "network";
  if (s === 429 || /rate.?limit|security purposes|too many/i.test(m)) return "rate";
  if (/signups? not allowed|otp_disabled|user.?not.?found/i.test(m)) return "notfound";
  if (/same_password|should be different/i.test(m)) return "same";
  if (/weak_password|password should|at least \d+ char/i.test(m)) return "weak";
  if (/session.?missing|session_not_found|no.?session/i.test(m)) return "nosession";
  if (/expired|invalid/i.test(m)) return "invalid";
  return "other";
}
// "For security purposes, you can only request this after 37 seconds." → 37.
function signinWaitSeconds(e) {
  const m = /(\d+)\s*seconds?/i.exec(String((e && e.message) || ""));
  return m ? Math.min(+m[1], 3600) : 0;
}
// An address that wraps at the @ and the dots instead of mid-word.
const signinBreakable = (email) => esc(email).replace(/([@.])/g, "<wbr>$1");

(function () {
  if (!$("login") || !$("pwForm")) return;
  const RESEND_S = 45, CODE_LIFE_MS = 3600e3, PENDING = "vela-otp-pending";
  const NET = "Couldn't reach Vela. Check your signal and try again.";
  const forms = { password: $("pwForm"), email: $("otpEmailForm"), code: $("otpCodeForm"), newpw: $("newPwForm") };
  const msg = $("loginMsg");
  let busy = false, codeEmail = "", sentAt = 0, lastTried = "", countdown = null, sayT = null;

  // A reset link lands here as #access_token=…&type=recovery, or #error_code=otp_expired
  // when it was stale. Read now: supabase-js clears the URL only after a network round trip.
  const h = location.hash + "&" + location.search.replace(/^\?/, "");
  let recovering = /(^|[#&])type=recovery(&|$)/.test(h);
  let linkError = !/access_token=/.test(h) && /(^|[#&])error(_code|_description)?=/.test(h);
  if (linkError) history.replaceState(null, "", location.pathname);

  const norm = (s) => String(s || "").trim().toLowerCase();
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const focus = (el, select) => setTimeout(() => { el.focus(); if (select && el.select) el.select(); }, 0);

  // Every result goes through the live region. Cleared first, so the same words said twice
  // (a second wrong code) are read twice.
  function say(text, o) {
    o = o || {};
    clearTimeout(sayT);
    msg.textContent = "";
    msg.className = "login-msg" + (o.err ? " err" : "");
    if (!text) return;
    sayT = setTimeout(() => { msg.innerHTML = o.html ? text : esc(text); }, 50);
  }

  function show(step, focusEl) {
    Object.keys(forms).forEach((k) => { forms[k].hidden = k !== step; });
    if (focusEl) focus(focusEl);
  }

  // aria-disabled rather than disabled: a disabled button drops the keyboard focus.
  function busyOn(btn, label) {
    busy = true;
    if (!btn.dataset.idle) btn.dataset.idle = btn.textContent;
    btn.textContent = label; btn.setAttribute("aria-disabled", "true");
  }
  function busyOff(btn) {
    busy = false;
    if (btn.dataset.idle) btn.textContent = btn.dataset.idle;
    btn.removeAttribute("aria-disabled");
  }
  function resetBusy() { $$("[data-idle]", $("login")).forEach(busyOff); }

  // The code step survives the phone killing the page while she is in her mail app.
  function savePending() { try { localStorage.setItem(PENDING, JSON.stringify({ email: codeEmail, at: sentAt })); } catch (e) {} }
  function clearPending() { try { localStorage.removeItem(PENDING); } catch (e) {} }
  function readPending() {
    try { const p = JSON.parse(localStorage.getItem(PENDING)); return p && p.email && Date.now() - p.at < CODE_LIFE_MS ? p : null; } catch (e) { return null; }
  }

  // "Resend in 0:45", counted against the clock so a throttled background tab stays right.
  function startCountdown(seconds) {
    clearInterval(countdown);
    const b = $("otpResend"), end = Date.now() + seconds * 1000;
    const tick = () => {
      const left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) { clearInterval(countdown); b.disabled = false; b.textContent = "Resend code"; return; }
      b.disabled = true;
      b.textContent = "Resend in " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    };
    tick(); countdown = setInterval(tick, 1000);
  }
  function stopCountdown() { startCountdown(0); }

  function toCodeStep(focusIt) {
    $("sentTo").innerHTML = signinBreakable(codeEmail);
    $("code").value = ""; lastTried = "";
    show("code", focusIt ? $("code") : null);
  }

  /* ---------- password ---------- */
  $("pwShow").addEventListener("click", () => {
    const i = $("pwPass"), b = $("pwShow"), on = i.type === "password";
    i.type = on ? "text" : "password";
    // The name changes with the state ("Hide password") rather than aria-pressed under a
    // fixed name, so what a screen reader says matches what is on the button.
    b.firstChild.textContent = on ? "Hide" : "Show";
  });

  forms.password.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const email = norm($("pwEmail").value), pw = $("pwPass").value, btn = $("pwSubmit");
    if (!validEmail(email)) { say("Enter the email your invitation went to.", { err: true }); focus($("pwEmail")); return; }
    // Return in the email field just moves on to the password.
    if (!pw) {
      if (document.activeElement === $("pwEmail")) { focus($("pwPass")); return; }
      say("Enter your password.", { err: true }); focus($("pwPass")); return;
    }
    // Back to dots before the browser offers to save it.
    if ($("pwPass").type !== "password") $("pwShow").click();
    busyOn(btn, "Signing in…"); say("");
    let r;
    try { r = await signInWithPasswordEmail(email, pw); } catch (e) { r = { error: e }; }
    if (r && r.error) {
      busyOff(btn);
      const k = signinErrorKind(r.error);
      say(k === "network" ? NET
        : k === "rate" ? "Too many tries. Wait a few minutes, then try again."
        : "That email and password don't match. Check them, or tap Forgot password.", { err: true });
      if (k !== "network" && k !== "rate") focus($("pwPass"), true);
      return;
    }
    // Stays busy: the app replaces this screen once the session lands.
    clearPending();
    say("Signing in…");
  });

  $("pwForgot").addEventListener("click", async () => {
    if (busy) return;
    const email = norm($("pwEmail").value), btn = $("pwForgot");
    if (!validEmail(email)) { say("Enter your email above, then tap Forgot password.", { err: true }); focus($("pwEmail")); return; }
    busyOn(btn, "Sending…"); say("");
    let r;
    try { r = await sendResetLink(email); } catch (e) { r = { error: e }; }
    busyOff(btn);
    const k = r && r.error ? signinErrorKind(r.error) : "";
    if (k === "network") say(NET, { err: true });
    else if (k === "rate") say("Wait a minute before asking for another link.", { err: true });
    else if (k) say("Couldn't send the link just now. Try again in a minute.", { err: true });
    // Supabase answers the same for an address it doesn't know, so this can't say more.
    else say("If " + email + " is on file, Vela has emailed it a link to choose a new password. The link lasts an hour.");
  });

  $("toCode").addEventListener("click", () => {
    if (busy) return;
    $("otpEmail").value = $("pwEmail").value.trim();
    say(""); show("email", $("otpEmail"));
  });

  /* ---------- emailed code ---------- */
  function toPassword() {
    if (busy) return;
    $("pwEmail").value = codeEmail && !forms.code.hidden ? codeEmail : $("otpEmail").value.trim();
    say(""); show("password", $("pwEmail").value ? $("pwPass") : $("pwEmail"));
  }
  $("toPassword").addEventListener("click", toPassword);
  $("toPassword2").addEventListener("click", toPassword);

  async function sendCode(email, resend) {
    if (busy) return;
    const btn = resend ? $("otpResend") : $("otpSend");
    busyOn(btn, "Sending…"); if (!resend) say("");
    let r;
    try { r = await sendMagicLink(email); } catch (e) { r = { error: e }; }
    busyOff(btn);
    const e = r && r.error;
    if (!e) {
      codeEmail = email; sentAt = Date.now(); savePending();
      if (!resend) toCodeStep(true); else { $("code").value = ""; lastTried = ""; focus($("code")); }
      startCountdown(RESEND_S);
      say(resend ? "New code sent. Use the one in the newest email." : "Code sent. Check your email.");
      return;
    }
    const k = signinErrorKind(e);
    if (k === "notfound") {
      say("That email isn't on file. Use the one your invitation went to, or ask " + coachName() + " to resend your invite.", { err: true });
      focus($("otpEmail"), true);
    } else if (k === "rate") {
      const wait = signinWaitSeconds(e);
      if (wait) {
        // Asked again within the minute: the code already sent still works, so she
        // belongs on the code step, not stuck on this one.
        if (codeEmail !== email) { codeEmail = email; sentAt = Date.now() - (60 - wait) * 1000; savePending(); }
        if (forms.code.hidden) toCodeStep(true);
        startCountdown(wait);
        say("Wait a minute before asking for another code.", { err: true });
      } else {
        say("Vela has sent a lot of emails just now. Wait a few minutes, or sign in with your password.", { err: true });
      }
    } else if (k === "network") say(NET, { err: true });
    else say("Couldn't send a code just now. Try again in a minute.", { err: true });
  }

  forms.email.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const email = norm($("otpEmail").value);
    if (!validEmail(email)) { say("Enter the email your invitation went to.", { err: true }); focus($("otpEmail")); return; }
    sendCode(email, false);
  });
  $("otpResend").addEventListener("click", () => { if (codeEmail) sendCode(codeEmail, true); });
  $("otpChange").addEventListener("click", () => {
    if (busy) return;
    clearPending(); stopCountdown();
    $("otpEmail").value = codeEmail;
    say(""); show("email"); focus($("otpEmail"), true);
  });

  async function verify() {
    if (busy) return;
    const d = $("code").value.replace(/\D/g, ""), btn = $("otpVerify");
    if (d.length !== 6) { say("Enter the six digits from the email.", { err: true }); focus($("code")); return; }
    lastTried = d;
    busyOn(btn, "Checking…"); say("");
    let r;
    try { r = await verifyCode(codeEmail, d); } catch (e) { r = { error: e }; }
    if (r && !r.error) { clearPending(); stopCountdown(); say("Signing in…"); return; }
    busyOff(btn);
    const k = signinErrorKind(r && r.error);
    if (k === "network") { say(NET, { err: true }); lastTried = ""; return; }
    if (k === "rate") { say("Too many tries. Wait a few minutes, then try again.", { err: true }); return; }
    // Supabase says "expired or invalid" for both, so the clock decides which it was.
    if (Date.now() - sentAt > CODE_LIFE_MS) {
      stopCountdown();
      say("That code has expired. Codes last an hour, so tap Resend code for a new one.", { err: true });
    } else {
      say("That code doesn't match. Check the newest email from Vela and try again.", { err: true });
    }
    focus($("code"), true);
  }
  forms.code.addEventListener("submit", (ev) => { ev.preventDefault(); verify(); });
  // Keeps only digits, so a pasted "123 456" or "123-456" is six; signs in as the sixth
  // lands, but not twice on the same wrong code.
  $("code").addEventListener("input", () => {
    const el = $("code"), d = el.value.replace(/\D/g, "").slice(0, 6);
    if (el.value !== d) el.value = d;
    if (d.length === 6 && d !== lastTried && !busy) verify();
  });

  /* ---------- new password, after a reset link ---------- */
  function showRecovery(user) {
    if (typeof showScreen === "function") showScreen("login");
    const acct = $("acct"); if (acct) acct.hidden = true;
    $("newPwWho").innerHTML = signinBreakable(user.email || "");
    $("newPwUser").value = user.email || "";
    $("loginH").textContent = "New password";
    say(""); show("newpw", $("newPw"));
  }
  function endRecovery() { recovering = false; window.velaRecovery = false; $("loginH").textContent = "Sign in"; }

  forms.newpw.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const p1 = $("newPw").value, p2 = $("newPw2").value, btn = $("newPwSave");
    if (p1.length < 8) { say("Use at least 8 characters.", { err: true }); focus($("newPw")); return; }
    if (p1 !== p2) { say("The two passwords don't match.", { err: true }); focus($("newPw2"), true); return; }
    busyOn(btn, "Saving…"); say("");
    let r;
    try { r = await setNewPassword(p1); } catch (e) { r = { error: e }; }
    busyOff(btn);
    const k = r && r.error ? signinErrorKind(r.error) : "";
    if (k === "nosession") {
      endRecovery(); show("password", $("pwEmail"));
      say("That reset link has stopped working. Enter your email and tap Forgot password for a new one.", { err: true });
      return;
    }
    if (k) {
      say(k === "network" ? NET
        : k === "same" ? "That's already your password. Choose a different one."
        : k === "weak" ? "Choose a stronger password: at least 8 characters, and not a common one."
        : "Couldn't save your password. Try again.", { err: true });
      if (k === "same" || k === "weak") focus($("newPw"), true);
      return;
    }
    endRecovery();
    announce("Password saved. Use it next time you sign in to Vela.");
    await coreRender({ force: true });
    afterRender();
  });

  /* ---------- around the shell's render ---------- */
  // Fills in who is signed in (account menu, "not an athlete") and puts the sign-in screen
  // in the right state each time the shell decides what to show.
  function afterRender() {
    const who = $("acctWho"), email = who ? who.textContent : "";
    if (who && email && !who.querySelector("wbr")) who.innerHTML = signinBreakable(email);
    if ($("notClientWho")) $("notClientWho").innerHTML = signinBreakable(email);
    if ($("login").hidden) return;
    resetBusy();
    if (linkError) {
      linkError = false;
      show("password", $("pwEmail"));
      say("That reset link has expired or was already used. Enter your email and tap Forgot password for a new one.", { err: true });
      return;
    }
    let fresh = false;
    try { fresh = !!sessionStorage.getItem("vela-signin-fresh"); sessionStorage.removeItem("vela-signin-fresh"); } catch (e) {}
    if (fresh) show("password", $("pwEmail"));
  }

  // A recovery session must choose a password before the app opens; everything else goes
  // to the shell as before.
  const coreRender = window.renderApp;
  window.renderApp = async function (o) {
    o = o || {};
    if (recovering || window.velaRecovery) {
      const user = o.user !== undefined ? o.user : await currentUser();
      if (user) { showRecovery(user); return; }
      endRecovery(); linkError = true;
    }
    const r = await coreRender(o);
    afterRender();
    return r;
  };

  // Back on the code step if a code went out in the last hour (she switched to her mail
  // and the phone reloaded the page).
  const p = readPending();
  if (p) {
    codeEmail = p.email; sentAt = p.at;
    toCodeStep(false);
    const left = RESEND_S - (Date.now() - p.at) / 1000;
    if (left > 0) startCountdown(left);
  }
})();
