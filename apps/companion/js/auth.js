// Passwordless sign-in with the athlete's existing Vela account + a simple session guard.
async function currentUser() {
  const { data } = await window.db.auth.getUser();
  return data.user || null;
}

// shouldCreateUser: false — a mistyped address must never mint a stray account. Every
// athlete already has one: the account she signs into the Vela app with.
async function sendMagicLink(email) {
  return window.db.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
      shouldCreateUser: false
    }
  });
}

// The email carries a six-digit code as well as the link. On a phone the code is the
// reliable path: a tapped link opens the browser, not the app installed on the home screen.
async function verifyCode(email, token) {
  return window.db.auth.verifyOtp({ email, token, type: "email" });
}

async function signOut() {
  await window.db.auth.signOut();
  location.reload();
}

// Re-render when auth state changes (link clicked, code entered, sign-out). Token
// refreshes change nothing on screen, so they don't rebuild every tab.
window.db && window.db.auth.onAuthStateChange((event) => {
  if (event === "TOKEN_REFRESHED") return;
  if (window.renderApp) window.renderApp();
});
