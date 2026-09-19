import { createRemoteJWKSet, jwtVerify } from "jose";

// Official Google JWK endpoint for Firebase Auth ID tokens.
const GOOGLE_JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
);
const jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);

export interface VerifiedFirebaseToken {
  uid: string;
  phoneNumber?: string;
  email?: string;
}

/**
 * Verifies a Firebase ID token generated after client-side SMS OTP confirmation.
 * Confirms cryptographic signature against Google's public JWK certs, matching
 * the project ID and issuer.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  expectedProjectId?: string
): Promise<VerifiedFirebaseToken> {
  const projectId =
    expectedProjectId ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    // In dev/test mode when Firebase keys are not yet configured, allow a safe test bypass
    if (
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
      idToken.startsWith("dev-mock-token-")
    ) {
      const phone = idToken.replace("dev-mock-token-", "");
      return { uid: `dev-uid-${phone}`, phoneNumber: phone };
    }
    throw new Error(
      "Firebase project ID not configured (set NEXT_PUBLIC_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID)"
    );
  }

  // Allow dev/test mock token
  if (
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
    idToken.startsWith("dev-mock-token-")
  ) {
    const phone = idToken.replace("dev-mock-token-", "");
    return { uid: `dev-uid-${phone}`, phoneNumber: phone };
  }

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  return {
    uid: payload.sub as string,
    phoneNumber: (payload.phone_number as string) || undefined,
    email: (payload.email as string) || undefined,
  };
}
