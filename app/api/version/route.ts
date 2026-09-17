import { appVersion } from "../../../lib/app-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: appVersion() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
