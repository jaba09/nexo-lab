import type { DatabaseSync } from "node:sqlite";
import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../lib/auth";
import { publishDataChange } from "../../../lib/dataEvents";
import { getDatabase } from "../../../lib/database";
import { semesterFromDate } from "../../../lib/semesters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttendanceSession = {
  id: number;
  sessionDate: string;
  startTime: string;
  duration: number;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  practiceCode: string | null;
  practiceName: string | null;
  groupCode: string | null;
};

type AttendanceStudent = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  attended: number;
};

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function normalizedGroupCode(value: string | null) {
  const normalized = String(value ?? "").trim().replace(/^G/i, "").replace(/^0+(?=\d)/, "");
  return /^\d{1,6}$/.test(normalized) ? normalized : "";
}

function madridDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ownedSession(database: DatabaseSync, teacherId: number, sessionId: number) {
  return database.prepare(`SELECT
    se.id, se.session_date AS sessionDate, se.start_time AS startTime, se.duration,
    se.subject_id AS subjectId, s.code AS subjectCode, s.name AS subjectName,
    p.code AS practiceCode, p.name AS practiceName, se.group_code AS groupCode
    FROM sessions se
    JOIN subjects s ON s.id = se.subject_id
    LEFT JOIN practices p ON p.id = se.practice_id
    WHERE se.id = ? AND se.teacher_id = ?`)
    .get(sessionId, teacherId) as AttendanceSession | undefined;
}

function sessionStudents(database: DatabaseSync, session: AttendanceSession) {
  const semesterId = semesterFromDate(session.sessionDate);
  const groupCode = normalizedGroupCode(session.groupCode);
  return database.prepare(`SELECT DISTINCT
    ss.id, ss.first_name AS firstName, ss.last_name AS lastName, ss.email,
    COALESCE(sa.attended, 0) AS attended
    FROM subject_students ss
    LEFT JOIN session_attendance sa ON sa.student_id = ss.id AND sa.session_id = ?
    WHERE ss.subject_id = ? AND ss.semester_id = ?
      AND (? = '' OR EXISTS (
        SELECT 1 FROM student_subgroups sg
        WHERE sg.student_id = ss.id AND sg.group_code = ?
      ))
    ORDER BY ss.last_name COLLATE NOCASE, ss.first_name COLLATE NOCASE, ss.email COLLATE NOCASE`)
    .all(session.id, session.subjectId, semesterId, groupCode, groupCode) as AttendanceStudent[];
}

function attendanceDetail(database: DatabaseSync, session: AttendanceSession) {
  const students = sessionStudents(database, session).map((student) => ({
    ...student,
    attended: Boolean(student.attended),
  }));
  const status = database.prepare(`SELECT COUNT(*) AS markedCount, MAX(updated_at) AS updatedAt
    FROM session_attendance WHERE session_id = ?`).get(session.id) as { markedCount: number; updatedAt: string | null };
  return {
    session,
    semesterId: semesterFromDate(session.sessionDate),
    students,
    attendanceTaken: students.length > 0 && Number(status.markedCount) >= students.length,
    attendedCount: students.filter((student) => student.attended).length,
    updatedAt: status.updatedAt,
  };
}

export async function GET(request: Request) {
  const teacher = await getAuthenticatedTeacher();
  if (!teacher) return unauthorizedResponse();
  try {
    const database = getDatabase();
    const sessionId = positiveInteger(new URL(request.url).searchParams.get("sessionId"));
    if (sessionId) {
      const session = ownedSession(database, teacher.id, sessionId);
      if (!session) return Response.json({ error: "La sesión no existe o no está asignada a tu usuario." }, { status: 404 });
      return Response.json(attendanceDetail(database, session), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const today = madridDate();
    const sessions = database.prepare(`SELECT
      se.id, se.session_date AS sessionDate, se.start_time AS startTime, se.duration,
      se.subject_id AS subjectId, s.code AS subjectCode, s.name AS subjectName,
      p.code AS practiceCode, p.name AS practiceName, se.group_code AS groupCode
      FROM sessions se
      JOIN subjects s ON s.id = se.subject_id
      LEFT JOIN practices p ON p.id = se.practice_id
      WHERE se.teacher_id = ? AND se.session_date >= ?
      ORDER BY se.session_date, se.start_time, se.id`)
      .all(teacher.id, today) as AttendanceSession[];
    const summaries = sessions.map((session) => {
      const detail = attendanceDetail(database, session);
      return {
        ...session,
        semesterId: detail.semesterId,
        studentCount: detail.students.length,
        attendedCount: detail.attendedCount,
        attendanceTaken: detail.attendanceTaken,
        updatedAt: detail.updatedAt,
      };
    });
    return Response.json({ sessions: summaries, today }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cargar la asistencia." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const teacher = await getAuthenticatedTeacher();
  if (!teacher) return unauthorizedResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const sessionId = positiveInteger(payload.sessionId);
    const attendedStudentIds = Array.isArray(payload.attendedStudentIds)
      ? [...new Set(payload.attendedStudentIds.map(positiveInteger).filter(Boolean))]
      : [];
    const rosterStudentIds = Array.isArray(payload.studentIds)
      ? [...new Set(payload.studentIds.map(positiveInteger).filter(Boolean))]
      : [];
    if (!sessionId) return Response.json({ error: "La sesión no es válida." }, { status: 400 });

    const database = getDatabase();
    const session = ownedSession(database, teacher.id, sessionId);
    if (!session) return Response.json({ error: "La sesión no existe o no está asignada a tu usuario." }, { status: 404 });
    const students = sessionStudents(database, session);
    if (!students.length) {
      return Response.json({ error: "Esta sesión no tiene alumnado cargado para su asignatura y subgrupo." }, { status: 400 });
    }
    const currentIds = students.map((student) => Number(student.id)).sort((left, right) => left - right);
    const submittedIds = rosterStudentIds.sort((left, right) => left - right);
    if (currentIds.length !== submittedIds.length || currentIds.some((id, index) => id !== submittedIds[index])) {
      return Response.json({ error: "La lista de alumnos ha cambiado. Recárgala antes de guardar la asistencia." }, { status: 409 });
    }
    const allowedIds = new Set(currentIds);
    if (attendedStudentIds.some((id) => !allowedIds.has(id))) {
      return Response.json({ error: "La selección contiene un alumno que no pertenece a esta sesión." }, { status: 400 });
    }

    const attendedIds = new Set(attendedStudentIds);
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("DELETE FROM session_attendance WHERE session_id = ?").run(sessionId);
      const insert = database.prepare(`INSERT INTO session_attendance
        (session_id, student_id, attended, marked_by_teacher_id, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`);
      for (const studentId of currentIds) {
        insert.run(sessionId, studentId, attendedIds.has(studentId) ? 1 : 0, teacher.id);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    publishDataChange();
    return Response.json(attendanceDetail(database, session));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la asistencia." }, { status: 500 });
  }
}
