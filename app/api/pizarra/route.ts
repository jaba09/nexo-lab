import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../lib/auth";
import calendar from "../../../data/pizarra.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!await getAuthenticatedTeacher()) return unauthorizedResponse();
  return Response.json(calendar, { headers: { "Cache-Control": "private, no-store" } });
}
