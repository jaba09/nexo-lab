import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../lib/auth";
import { getDatabase } from "../../../lib/database";
import { saveAppPreferences, validateAppPreferences } from "../../../lib/preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const authenticatedTeacher = await getAuthenticatedTeacher();
  if (!authenticatedTeacher) return unauthorizedResponse();
  if (!authenticatedTeacher.isAdmin) {
    return Response.json({ error: "Solo un administrador puede cambiar las preferencias." }, { status: 403 });
  }

  try {
    const preferences = validateAppPreferences(await request.json());
    if (!preferences) {
      return Response.json({ error: "Elige horas completas y asegúrate de que la hora final sea posterior a la inicial." }, { status: 400 });
    }
    saveAppPreferences(getDatabase(), preferences);
    return Response.json({ ok: true, preferences });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar las preferencias." }, { status: 500 });
  }
}
