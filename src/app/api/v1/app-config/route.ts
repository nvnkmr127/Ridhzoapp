import { NextRequest, NextResponse } from "next/server";
import { PlatformConfigService } from "@/domains/platform/configService";

type Platform = "android" | "ios";
type MinVersions = Partial<Record<Platform, string>>;

// Public, no auth: the app asks at launch whether this build is still supported. Set
// platform_configs key "mobile.minVersion" to {"android":"1.0.3","ios":"1.0.3"} to force an update;
// unset = every version works.
export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") === "ios" ? "ios" : "android";
  const min = await PlatformConfigService.get<MinVersions>("mobile.minVersion", {});
  const storeUrl =
    platform === "ios" ? process.env.IOS_STORE_URL : "https://play.google.com/store/apps/details?id=com.ridhzo.app";
  return NextResponse.json(
    { minVersion: min?.[platform] ?? null, storeUrl: storeUrl ?? null },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
