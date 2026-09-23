import type { DatabaseSync } from "node:sqlite";

export type SessionNotificationEvent = "session-created" | "session-updated";

type SessionNotificationInput = {
  eventType: SessionNotificationEvent;
  sessionIds: number[];
  actorTeacherId: number;
  actorName: string;
};

type SessionNotificationSnapshot = {
  id: number;
  sessionDate: string;
  startTime: string;
  duration: number;
  subjectCode: string;
  subjectName: string;
  practiceName: string | null;
  installationNames: string | null;
};

function endTime(startTime: string, duration: number) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const total = (hours * 60) + minutes + duration;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function spanishDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function sessionSnapshot(database: DatabaseSync, id: number) {
  return database.prepare(`SELECT
    se.id, se.session_date AS sessionDate, se.start_time AS startTime, se.duration,
    s.code AS subjectCode, s.name AS subjectName, p.name AS practiceName,
    (SELECT GROUP_CONCAT(i.name, ' · ')
      FROM practice_installations pi
      JOIN installations i ON i.id = pi.installation_id
      WHERE pi.practice_id = se.practice_id) AS installationNames
    FROM sessions se
    JOIN subjects s ON s.id = se.subject_id
    LEFT JOIN practices p ON p.id = se.practice_id
    WHERE se.id = ?`).get(id) as SessionNotificationSnapshot | undefined;
}

export function createSessionNotifications(database: DatabaseSync, input: SessionNotificationInput) {
  const sessionIds = [...new Set(input.sessionIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!sessionIds.length) return 0;
  const recipients = database.prepare("SELECT id FROM teachers WHERE is_lab_staff = 1 ORDER BY id")
    .all() as { id: number }[];
  if (!recipients.length) return 0;

  const created = input.eventType === "session-created";
  let title: string;
  let message: string;
  let linkedSessionId: number | null = null;
  if (sessionIds.length === 1) {
    const session = sessionSnapshot(database, sessionIds[0]);
    if (!session) return 0;
    linkedSessionId = session.id;
    title = created ? "Nueva sesión de laboratorio" : "Sesión de laboratorio modificada";
    const details = [
      `${session.subjectCode} · ${session.subjectName}`,
      `${spanishDate(session.sessionDate)} · ${session.startTime}–${endTime(session.startTime, Number(session.duration))}`,
      session.practiceName || "Sin práctica asignada",
      session.installationNames || "Sin instalación determinada",
    ];
    message = `${details.join(" · ")}. ${created ? "Creada" : "Modificada"} por ${input.actorName}.`;
  } else {
    title = created
      ? `${sessionIds.length} sesiones de laboratorio creadas`
      : `${sessionIds.length} sesiones de laboratorio modificadas`;
    message = `${input.actorName} ha ${created ? "creado" : "modificado"} ${sessionIds.length} sesiones de laboratorio.`;
  }

  const insert = database.prepare(`INSERT INTO notifications
    (recipient_teacher_id, actor_teacher_id, session_id, event_type, title, message)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for (const recipient of recipients) {
    insert.run(recipient.id, input.actorTeacherId, linkedSessionId, input.eventType, title, message);
  }
  return recipients.length;
}
