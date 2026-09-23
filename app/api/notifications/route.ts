import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../lib/auth";
import { publishDataChange } from "../../../lib/dataEvents";
import { getDatabase } from "../../../lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export async function PATCH(request: Request) {
  const authenticatedTeacher = await getAuthenticatedTeacher();
  if (!authenticatedTeacher) return unauthorizedResponse();
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
  }

  const database = getDatabase();
  let changes = 0;
  if (payload.action === "read-all") {
    changes = Number(database.prepare(`UPDATE notifications SET read_at = CURRENT_TIMESTAMP
      WHERE recipient_teacher_id = ? AND read_at IS NULL`).run(authenticatedTeacher.id).changes);
  } else if (payload.action === "read") {
    const id = positiveInteger(payload.id);
    if (!id) return Response.json({ error: "La notificación no es válida." }, { status: 400 });
    changes = Number(database.prepare(`UPDATE notifications SET read_at = CURRENT_TIMESTAMP
      WHERE id = ? AND recipient_teacher_id = ? AND read_at IS NULL`).run(id, authenticatedTeacher.id).changes);
  } else {
    return Response.json({ error: "Acción de notificación no válida." }, { status: 400 });
  }

  if (changes) publishDataChange();
  return Response.json({ ok: true, updatedCount: changes });
}
