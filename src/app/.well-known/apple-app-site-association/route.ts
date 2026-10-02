// iOS Universal Links. Set APPLE_TEAM_ID (developer.apple.com → Membership).
// Dynamic: the fingerprint / Team ID come from env at request time, not frozen at build.
export const dynamic = "force-dynamic";

export function GET() {
  const appID = `${process.env.APPLE_TEAM_ID ?? "TEAMID"}.com.ridhzo.app`;
  return Response.json({ applinks: { details: [{ appIDs: [appID], components: [{ "/": "/leads/*" }, { "/": "/follow-ups" }, { "/": "/meetings" }, { "/": "/calls" }] }] } });
}
