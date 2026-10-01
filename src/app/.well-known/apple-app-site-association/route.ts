// iOS Universal Links. Set APPLE_TEAM_ID (developer.apple.com → Membership).
export const dynamic = "force-static";

export function GET() {
  const appID = `${process.env.APPLE_TEAM_ID ?? "TEAMID"}.com.ridhzo.app`;
  return Response.json({ applinks: { details: [{ appIDs: [appID], components: [{ "/": "/leads/*" }] }] } });
}
