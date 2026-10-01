// Android App Links: proves app.ridhzo.com belongs to com.ridhzo.app. Set ANDROID_CERT_SHA256 to the
// Play App Signing SHA-256 (Play Console → Setup → App signing); comma-separate to add the upload key.
export const dynamic = "force-static";

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.ridhzo.app", sha256_cert_fingerprints: fingerprints },
    },
  ]);
}
