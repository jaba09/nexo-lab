import { getAuthenticatedTeacher, readOnlyResponse, unauthorizedResponse } from "../../../../lib/auth";
import { getDatabase } from "../../../../lib/database";
import { sendTeacherGroupEmail } from "../../../../lib/email";
import { messageAudienceTeacherIds, type MessageAudienceSession } from "../../../../lib/messageAudience";
import { semesterDefinition, semesterFromDate } from "../../../../lib/semesters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessageAudience = "subject" | "semester";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function smtpErrorResponse(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "EAUTH") {
    return Response.json({ error: "No se pudo autenticar en el correo de Unizar. Revisa la contraseña.", code: "SMTP_AUTH_FAILED" }, { status: 401 });
  }
  return Response.json({ error: "No se pudo enviar el correo mediante el SMTP de Unizar. Inténtalo de nuevo." }, { status: 502 });
}

export async function POST(request: Request) {
  const authenticatedTeacher = await getAuthenticatedTeacher();
  if (!authenticatedTeacher) return unauthorizedResponse();
  if (!authenticatedTeacher.isAdmin) return readOnlyResponse();

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "La solicitud de envío no es válida." }, { status: 400 });
  }

  const audience = payload.audience as MessageAudience;
  const semesterId = cleanText(payload.semesterId);
  const subject = cleanText(payload.subject);
  const body = cleanText(payload.body);
  const smtpPassword = typeof payload.smtpPassword === "string" ? payload.smtpPassword : "";
  const subjectId = audience === "subject" ? Number(payload.subjectId) : null;

  if (audience !== "subject" && audience !== "semester") {
    return Response.json({ error: "Selecciona un grupo de destinatarios válido." }, { status: 400 });
  }
  try {
    semesterDefinition(semesterId);
  } catch {
    return Response.json({ error: "Selecciona un semestre válido." }, { status: 400 });
  }
  if (audience === "subject" && (!Number.isInteger(subjectId) || Number(subjectId) <= 0)) {
    return Response.json({ error: "Selecciona una asignatura." }, { status: 400 });
  }
  if (!subject || subject.length > 160) {
    return Response.json({ error: "El asunto es obligatorio y no puede superar 160 caracteres." }, { status: 400 });
  }
  if (!body || body.length > 20_000) {
    return Response.json({ error: "El mensaje es obligatorio y no puede superar 20.000 caracteres." }, { status: 400 });
  }
  if (!smtpPassword || smtpPassword.length > 256) {
    return Response.json({ error: "Introduce una contraseña de correo válida." }, { status: 400 });
  }
  if (!validEmail(authenticatedTeacher.email)) {
    return Response.json({ error: "Tu ficha de profesor necesita un correo electrónico válido para enviar mensajes." }, { status: 400 });
  }

  const database = getDatabase();
  if (subjectId !== null && !database.prepare("SELECT 1 FROM subjects WHERE id = ?").get(subjectId)) {
    return Response.json({ error: "La asignatura seleccionada ya no existe." }, { status: 404 });
  }
  const sessions = database.prepare(`SELECT
    session_date AS sessionDate, subject_id AS subjectId, teacher_id AS teacherId
    FROM sessions
    WHERE teacher_id IS NOT NULL`).all() as MessageAudienceSession[];
  const teacherIds = messageAudienceTeacherIds(sessions, semesterId, subjectId, semesterFromDate);
  if (!teacherIds.length) {
    return Response.json({ error: "El grupo seleccionado no tiene profesores con docencia." }, { status: 400 });
  }
  const placeholders = teacherIds.map(() => "?").join(", ");
  const teachers = database.prepare(`SELECT id, name, email FROM teachers WHERE id IN (${placeholders})`)
    .all(...teacherIds) as { id: number; name: string; email: string }[];
  const recipients = [...new Set(teachers.map((teacher) => teacher.email.trim().toLowerCase()).filter(validEmail))];
  if (!recipients.length) {
    return Response.json({ error: "Ningún profesor del grupo tiene correo electrónico válido." }, { status: 400 });
  }
  if (recipients.length > 200) {
    return Response.json({ error: "El grupo supera el límite de 200 destinatarios por envío." }, { status: 400 });
  }

  try {
    await sendTeacherGroupEmail({
      smtpUser: authenticatedTeacher.email,
      smtpPassword,
      senderName: authenticatedTeacher.name,
      recipients,
      subject,
      body,
    });
    return Response.json({ recipientCount: recipients.length });
  } catch (error) {
    return smtpErrorResponse(error);
  }
}
