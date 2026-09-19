"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type Auth,
} from "firebase/auth";

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

export function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

export function isFirebaseConfigured(): boolean {
  const cfg = getFirebaseConfig();
  return Boolean(cfg.apiKey && cfg.projectId);
}

export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  const cfg = getFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId) return null;

  if (!firebaseApp) {
    const existing = getApps();
    firebaseApp = existing.length > 0 ? existing[0] : initializeApp(cfg);
  }
  if (!firebaseAuth) {
    firebaseAuth = getAuth(firebaseApp);
  }
  return firebaseAuth;
}

/**
 * Initiates Phone SMS OTP sending via Firebase reCAPTCHA.
 */
export async function sendFirebasePhoneOtp(
  phoneNumber: string,
  containerId = "recaptcha-container"
): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error(
      "Firebase Phone Authentication is not configured. Please set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID."
    );
  }

  // Clear existing reCAPTCHA if any
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = "";

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
  });

  return await signInWithPhoneNumber(auth, phoneNumber, verifier);
}

/**
 * Confirms the SMS OTP entered by user, returning the verified ID token.
 */
export async function confirmFirebasePhoneOtp(
  confirmationResult: ConfirmationResult,
  otpCode: string
): Promise<{ idToken: string; phoneNumber?: string }> {
  const credential = await confirmationResult.confirm(otpCode);
  const idToken = await credential.user.getIdToken();
  return {
    idToken,
    phoneNumber: credential.user.phoneNumber || undefined,
  };
}
