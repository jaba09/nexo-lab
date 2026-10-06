import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../../lib/auth";
import { publishDataChange } from "../../../../lib/dataEvents";
import { getDatabase } from "../../../../lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const authenticatedTeacher = await getAuthenticatedTeacher();
  if (!authenticatedTeacher) return unauthorizedResponse();

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "La incidencia no es válida." }, { status: 400 });
  }

  const installationId = Number(payload.installationId);
  const subject = cleanText(payload.subject);
  const message = cleanText(payload.message);
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return Response.json({ error: "Selecciona una instalación." }, { status: 400 });
  }
  if (!subject || subject.length > 160) {
    return Response.json({ error: "El asunto es obligatorio y no puede superar 160 caracteres." }, { status: 400 });
  }
  if (!message || message.length > 20_000) {
    return Response.json({ error: "El mensaje es obligatorio y no puede superar 20.000 caracteres." }, { status: 400 });
  }

  const database = getDatabase();
  const installation = database.prepare("SELECT id FROM installations WHERE id = ?").get(installationId);
  if (!installation) {
    return Response.json({ error: "La instalación seleccionada ya no existe." }, { status: 404 });
  }

  const result = database.prepare(`INSERT INTO installation_incidents
    (installation_id, reported_by_teacher_id, subject, message)
    VALUES (?, ?, ?, ?)`
  ).run(installationId, authenticatedTeacher.id, subject, message);
  publishDataChange();
  return Response.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}
