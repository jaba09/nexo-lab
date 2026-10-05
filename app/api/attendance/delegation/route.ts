import type { DatabaseSync } from "node:sqlite";
import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../../lib/auth";
import { publishDataChange } from "../../../../lib/dataEvents";
import { getDatabase } from "../../../../lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DelegationSession = {
  id: number;
  sessionDate: string;
  startTime: string;
  subjectCode: string;
  groupCode: string | null;
  responsibleTeacherId: number;
  responsibleTeacherName: string;
};

type Delegation = {
  substituteTeacherId: number;
  substituteTeacherName: string;
};

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function manageableSession(database: DatabaseSync, sessionId: number, teacherId: number, isAdmin: boolean) {
  return database.prepare(`SELECT se.id, se.session_date AS sessionDate, se.start_time AS startTime,
    s.code AS subjectCode, se.group_code AS groupCode,
    responsible.id AS responsibleTeacherId, responsible.name AS responsibleTeacherName
    FROM sessions se
    JOIN subjects s ON s.id = se.subject_id
    JOIN teachers responsible ON responsible.id = se.teacher_id
    WHERE se.id = ? AND (se.teacher_id = ? OR ? = 1)`)
    .get(sessionId, teacherId, isAdmin ? 1 : 0) as DelegationSession | undefined;
}

function currentDelegation(database: DatabaseSync, sessionId: number) {
  return database.prepare(`SELECT delegation.substitute_teacher_id AS substituteTeacherId,
    substitute.name AS substituteTeacherName
    FROM session_attendance_delegations delegation
    JOIN teachers substitute ON substitute.id = delegation.substitute_teacher_id
    WHERE delegation.session_id = ?`).get(sessionId) as Delegation | undefined;
}

function sessionDescription(session: DelegationSession) {
  const [year, month, day] = session.sessionDate.split("-");
  return `${session.subjectCode}${session.groupCode ? ` · G${session.groupCode.replace(/^G/i, "")}` : ""} · ${day}/${month}/${year} · ${session.startTime}`;
}

function notify(database: DatabaseSync, input: {
  recipientTeacherId: number;
  actorTeacherId: number;
  sessionId: number;
  title: string;
  message: string;
}) {
  database.prepare(`INSERT INTO notifications
    (recipient_teacher_id, actor_teacher_id, session_id, event_type, title, message)
    VALUES (?, ?, ?, 'session-updated', ?, ?)`)
    .run(input.recipientTeacherId, input.actorTeacherId, input.sessionId, input.title, input.message);
}

export async function PUT(request: Request) {
  const teacher = await getAuthenticatedTeacher();
  if (!teacher) return unauthorizedResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const sessionId = positiveInteger(payload.sessionId);
    const substituteTeacherId = positiveInteger(payload.substituteTeacherId);
    if (!sessionId || !substituteTeacherId) {
      return Response.json({ error: "La sesión o el profesor sustituto no son válidos." }, { status: 400 });
    }

    const database = getDatabase();
    const session = manageableSession(database, sessionId, teacher.id, teacher.isAdmin);
    if (!session) {
      return Response.json({ error: "Solo el profesor responsable o un administrador puede nombrar al sustituto." }, { status: 403 });
    }
    if (session.responsibleTeacherId === substituteTeacherId) {
      return Response.json({ error: "El profesor responsable no puede nombrarse como sustituto." }, { status: 400 });
    }
    const substitute = database.prepare("SELECT id, name FROM teachers WHERE id = ?")
      .get(substituteTeacherId) as { id: number; name: string } | undefined;
    if (!substitute) return Response.json({ error: "El profesor sustituto ya no existe." }, { status: 404 });

    const previous = currentDelegation(database, sessionId);
    if (previous?.substituteTeacherId === substituteTeacherId) {
      return Response.json({ delegation: previous });
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`INSERT INTO session_attendance_delegations
        (session_id, substitute_teacher_id, appointed_by_teacher_id, appointed_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(session_id) DO UPDATE SET
          substitute_teacher_id = excluded.substitute_teacher_id,
          appointed_by_teacher_id = excluded.appointed_by_teacher_id,
          appointed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP`)
        .run(sessionId, substituteTeacherId, teacher.id);
      if (previous && previous.substituteTeacherId !== substituteTeacherId) {
        notify(database, {
          recipientTeacherId: previous.substituteTeacherId,
          actorTeacherId: teacher.id,
          sessionId,
          title: "Sustitución de asistencia modificada",
          message: `${teacher.name} ha retirado tu acceso como sustituto en ${sessionDescription(session)}.`,
        });
      }
      notify(database, {
        recipientTeacherId: substituteTeacherId,
        actorTeacherId: teacher.id,
        sessionId,
        title: "Nueva sustitución de asistencia",
        message: `${teacher.name} te ha nombrado sustituto para pasar lista en ${sessionDescription(session)}.`,
      });
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    publishDataChange();
    return Response.json({ delegation: { substituteTeacherId, substituteTeacherName: substitute.name } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la sustitución." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const teacher = await getAuthenticatedTeacher();
  if (!teacher) return unauthorizedResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const sessionId = positiveInteger(payload.sessionId);
    if (!sessionId) return Response.json({ error: "La sesión no es válida." }, { status: 400 });

    const database = getDatabase();
    const session = manageableSession(database, sessionId, teacher.id, teacher.isAdmin);
    if (!session) {
      return Response.json({ error: "Solo el profesor responsable o un administrador puede retirar al sustituto." }, { status: 403 });
    }
    const previous = currentDelegation(database, sessionId);
    if (!previous) return Response.json({ delegation: null });

    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("DELETE FROM session_attendance_delegations WHERE session_id = ?").run(sessionId);
      notify(database, {
        recipientTeacherId: previous.substituteTeacherId,
        actorTeacherId: teacher.id,
        sessionId,
        title: "Sustitución de asistencia retirada",
        message: `${teacher.name} ha retirado tu acceso como sustituto en ${sessionDescription(session)}.`,
      });
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    publishDataChange();
    return Response.json({ delegation: null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo retirar la sustitución." }, { status: 500 });
  }
}
