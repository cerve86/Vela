// Sign-in with the athlete's existing Vela account + a simple session guard. The form
// itself is js/signin.js; every auth call it makes is a named function here, so the demo
// build can swap this file for mocks.

// The local session decides who is signed in, not a network round trip: on a weak signal
// a getUser() call fails and she would be shown the sign-in screen. getSession() reads the
// phone; it only goes to the network to refresh an expired token, and if that refresh
// can't get through, the session still saved on the phone says who she is.
const AUTH_KEY = "vela-companion-auth";
async function currentUser() {
  try {
    const { data, error } = await window.db.auth.getSession();
    if (data && data.session) return data.session.user;
    if (!error) return null;
  } catch (e) {}
  try { const s = JSON.parse(localStorage.getItem(AUTH_KEY)); return (s && s.user) || null; } catch (e) { return null; }
}

// The main path, as in the Vela app: the email and password she chose from her invitation.
// Nothing here can create an account; an unknown email is just a failed sign-in.
async function signInWithPasswordEmail(email, password) {
  return window.db.auth.signInWithPassword({ email, password });
}

// "Forgot password?": the link comes back to the companion (an allow-listed redirect),
// where supabase-js picks the recovery session out of the URL and signin.js asks for the
// new password. Supabase answers the same for an unknown email, so nothing leaks.
async function sendResetLink(email) {
  return window.db.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/companion" });
}

// Saves the new password on the recovery session the reset link opened.
async function setNewPassword(password) {
  return window.db.auth.updateUser({ password });
}

// shouldCreateUser: false — a mistyped address must never mint a stray account. Every
// athlete already has one: the account she signs into the Vela app with.
async function sendMagicLink(email) {
  return window.db.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + "/companion",
      shouldCreateUser: false
    }
  });
}

// The email carries a six-digit code as well as the link. On a phone the code is the
// reliable path: a tapped link opens the browser, not the app installed on the home screen.
async function verifyCode(email, token) {
  return window.db.auth.verifyOtp({ email, token, type: "email" });
}

// Signing out also wipes what this phone kept for her: the offline copies (vela-cache-*),
// drafts and on-device answers (vela-*, rb-*: fuel, the estimate, the nutrition check),
// because a family iPad is passed to the next person. Offline, Supabase can't revoke the
// session, so the saved one is dropped by hand.
//   o.fresh  back on the sign-in screen with the cursor in the email field ("Use a
//            different email"); sessionStorage, because localStorage is what we just cleared.
async function signOut(o) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.indexOf("rb-") === 0 || (k.indexOf("vela-") === 0 && k !== AUTH_KEY))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
  try { if (o && o.fresh) sessionStorage.setItem("vela-signin-fresh", "1"); } catch (e) {}
  try {
    // Local scope: the library's default ends every session she has, which would sign her
    // out of the Vela app on her phone too.
    const { error } = await window.db.auth.signOut({ scope: "local" });
    if (error) localStorage.removeItem(AUTH_KEY);
  } catch (e) { try { localStorage.removeItem(AUTH_KEY); } catch (_) {} }
  location.replace(location.pathname);
}

// Re-render when the signed-in person changes (code entered, link clicked, sign-out).
// renderApp ignores a SIGNED_IN for the same user, which the library sends every time the
// app comes back to the screen. Deferred, because calling back into auth from inside its
// own callback can deadlock supabase-js.
window.db && window.db.auth.onAuthStateChange((event, session) => {
  // INITIAL_SESSION fires on registration, and the shell already renders once on load.
  if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
  // A reset link signs her in on a recovery session: signin.js asks for the new password
  // before the app opens.
  if (event === "PASSWORD_RECOVERY") window.velaRecovery = true;
  const user = session && session.user ? session.user : null;
  setTimeout(() => { if (window.renderApp) window.renderApp({ user }); }, 0);
});
