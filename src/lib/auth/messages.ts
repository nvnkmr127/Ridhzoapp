// User-facing text for NextAuth sign-in failures. `code` is either result.error from signIn() (our own
// codes thrown in authorize(), or "CredentialsSignin") or the ?error= NextAuth puts on /login after a
// failed Google sign-in. Anything unrecognised falls back to the caller's context-specific message.
export function authErrorMessage(code: string | null | undefined, fallback: string): string {
  switch (code) {
    case "OTP_LOCKED":
      return "Too many wrong attempts. Tap Resend to get a new code.";
    case "RATE_LIMITED":
      return "Too many login attempts. Please wait 15 minutes, or reset your password.";
    case "ACCOUNT_DISABLED":
      return "Your account has been deactivated. Ask your workspace admin to reactivate it.";
    case "ACCOUNT_SUSPENDED":
      return "This workspace is suspended. Contact the workspace owner or Ridhzo support.";
    case "AccessDenied":
      return "Google sign-in was refused. Make sure you picked a Google account with an email address, then try again.";
    case "OAuthSignin":
    case "OAuthCallback":
    case "OAuthCreateAccount":
    case "Callback":
      return "Google sign-in didn't finish. Please try again.";
    case "SessionRequired":
      return "Please log in to continue.";
    default:
      return fallback;
  }
}

// Success banners shown on /login after flows that end there (?notice=).
export const LOGIN_NOTICES: Record<string, string> = {
  "invite-accepted": "Your account is ready. Log in with your email and the password you just chose.",
  "password-reset": "Password updated. Log in with your new password.",
  "account-created": "Your workspace is ready. Log in to get started.",
};
