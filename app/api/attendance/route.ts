import type { DatabaseSync } from "node:sqlite";
import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../lib/auth";
import { publishDataChange } from "../../../lib/dataEvents";
import { getDatabase } from "../../../lib/database";
import {
  academicYearFromSemester,
  createLabRulesAcceptancePdf,
  laboratoryRules,
} from "../../../lib/labRules";
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
  rulesAccepted: number;
  rulesAcceptedAt: string | null;
};

type RulesAcceptance = {
  signaturePng: Uint8Array;
  signedAt: string;
  teacherName: string;
};

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function normalizedGroupCode(value: string | null) {
  const normalized = String(value ?? "").trim().replace(/^G/i, "").replace(/^0+(?=\d)/, "");
  return /^\d{1,6}$/.test(normalized) ? normalized : "";
}

function signaturePng(value: unknown) {
  if (typeof value !== "string") throw new Error("La firma no es válida.");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("La firma debe enviarse en formato PNG.");
  const signature = Buffer.from(match[1], "base64");
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (signature.length < 64 || signature.length > 750_000 || !signature.subarray(0, 8).equals(pngHeader)) {
    throw new Error("La firma PNG no es válida o supera el tamaño permitido.");
  }
  return signature;
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

function sessionRules(session: AttendanceSession) {
  const semesterId = semesterFromDate(session.sessionDate);
  return laboratoryRules(academicYearFromSemester(semesterId));
}

function sessionStudents(database: DatabaseSync, session: AttendanceSession) {
  const semesterId = semesterFromDate(session.sessionDate);
  const rules = sessionRules(session);
  const groupCode = normalizedGroupCode(session.groupCode);
  return database.prepare(`SELECT DISTINCT
    ss.id, ss.first_name AS firstName, ss.last_name AS lastName, ss.email,
    COALESCE(sa.attended, 0) AS attended,
    CASE WHEN lra.id IS NULL THEN 0 ELSE 1 END AS rulesAccepted,
    lra.signed_at AS rulesAcceptedAt
    FROM subject_students ss
    LEFT JOIN session_attendance sa ON sa.student_id = ss.id AND sa.session_id = ?
    LEFT JOIN student_lab_rule_acceptances lra
      ON lra.student_email = ss.email COLLATE NOCASE
      AND lra.academic_year = ?
      AND lra.rules_version = ?
    WHERE ss.subject_id = ? AND ss.semester_id = ?
      AND (? = '' OR EXISTS (
        SELECT 1 FROM student_subgroups sg
        WHERE sg.student_id = ss.id AND sg.group_code = ?
    ))
    ORDER BY CASE WHEN lra.id IS NULL THEN 0 ELSE 1 END,
      ss.last_name COLLATE NOCASE, ss.first_name COLLATE NOCASE, ss.email COLLATE NOCASE`)
    .all(session.id, rules.academicYear, rules.version, session.subjectId, semesterId, groupCode, groupCode) as AttendanceStudent[];
}

function attendanceDetail(database: DatabaseSync, session: AttendanceSession) {
  const students = sessionStudents(database, session).map((student) => ({
    ...student,
    attended: Boolean(student.attended),
    rulesAccepted: Boolean(student.rulesAccepted),
  }));
  const status = database.prepare(`SELECT COUNT(*) AS markedCount, MAX(updated_at) AS updatedAt
    FROM session_attendance WHERE session_id = ?`).get(session.id) as { markedCount: number; updatedAt: string | null };
  return {
    session,
    semesterId: semesterFromDate(session.sessionDate),
    students,
    rules: sessionRules(session),
    attendanceTaken: students.length > 0 && Number(status.markedCount) >= students.length,
    attendedCount: students.filter((student) => student.attended).length,
    rulesAcceptedCount: students.filter((student) => student.rulesAccepted).length,
    rulesPendingCount: students.filter((student) => !student.rulesAccepted).length,
    updatedAt: status.updatedAt,
  };
}

function acceptedRules(database: DatabaseSync, studentEmail: string, session: AttendanceSession) {
  const rules = sessionRules(session);
  return database.prepare(`SELECT
    a.signature_png AS signaturePng, a.signed_at AS signedAt, t.name AS teacherName
    FROM student_lab_rule_acceptances a
    JOIN teachers t ON t.id = a.captured_by_teacher_id
    WHERE a.student_email = ? COLLATE NOCASE
      AND a.academic_year = ?
      AND a.rules_version = ?`)
    .get(studentEmail, rules.academicYear, rules.version) as RulesAcceptance | undefined;
}

export async function GET(request: Request) {
  const teacher = await getAuthenticatedTeacher();
  if (!teacher) return unauthorizedResponse();
  try {
    const database = getDatabase();
    const url = new URL(request.url);
    const sessionId = positiveInteger(url.searchParams.get("sessionId"));
    if (sessionId) {
      const session = ownedSession(database, teacher.id, sessionId);
      if (!session) return Response.json({ error: "La sesión no existe o no está asignada a tu usuario." }, { status: 404 });
      const studentId = positiveInteger(url.searchParams.get("studentId"));
      const signatureFormat = url.searchParams.get("signature");
      if (studentId && signatureFormat) {
        const student = sessionStudents(database, session).find((item) => item.id === studentId);
        if (!student) return Response.json({ error: "El alumno no pertenece a esta sesión." }, { status: 404 });
        const acceptance = acceptedRules(database, student.email, session);
        if (!acceptance) return Response.json({ error: "El alumno todavía no ha aceptado las normas." }, { status: 404 });
        const filename = `normas-laboratorio-${student.email.replace(/[^a-z0-9._-]+/gi, "-")}`;
        if (signatureFormat === "pdf") {
          const rules = sessionRules(session);
          const content = await createLabRulesAcceptancePdf({
            studentName: `${student.firstName} ${student.lastName}`,
            studentEmail: student.email,
            signedAt: acceptance.signedAt,
            teacherName: acceptance.teacherName,
            sessionDate: session.sessionDate,
            sessionTime: session.startTime,
            subjectCode: session.subjectCode,
            groupCode: session.groupCode,
            signaturePng: acceptance.signaturePng,
            rules,
          });
          return new Response(content, {
            headers: {
              "Cache-Control": "private, no-store",
              "Content-Disposition": `attachment; filename="${filename}.pdf"`,
              "Content-Type": "application/pdf",
            },
          });
        }
        if (signatureFormat !== "image") {
          return Response.json({ error: "El formato de firma solicitado no es válido." }, { status: 400 });
        }
        return new Response(new Uint8Array(acceptance.signaturePng), {
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Disposition": `inline; filename="${filename}.png"`,
            "Content-Type": "image/png",
          },
        });
      }
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
        rulesAcceptedCount: detail.rulesAcceptedCount,
        rulesPendingCount: detail.rulesPendingCount,
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

export async function POST(request: Request) {
  const teacher = await getAuthenticatedTeacher();
  if (!teacher) return unauthorizedResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const sessionId = positiveInteger(payload.sessionId);
    const studentId = positiveInteger(payload.studentId);
    if (!sessionId || !studentId) {
      return Response.json({ error: "La sesión o el alumno no son válidos." }, { status: 400 });
    }
    if (payload.acceptedRules !== true || payload.teacherAttested !== true) {
      return Response.json({ error: "Deben confirmarse la aceptación del alumno y la recogida presencial." }, { status: 400 });
    }
    let signature: Buffer;
    try {
      signature = signaturePng(payload.signatureDataUrl);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "La firma no es válida." }, { status: 400 });
    }
    const database = getDatabase();
    const session = ownedSession(database, teacher.id, sessionId);
    if (!session) return Response.json({ error: "La sesión no existe o no está asignada a tu usuario." }, { status: 404 });
    const student = sessionStudents(database, session).find((item) => item.id === studentId);
    if (!student) return Response.json({ error: "El alumno no pertenece a esta sesión." }, { status: 404 });
    const rules = sessionRules(session);
    const result = database.prepare(`INSERT OR IGNORE INTO student_lab_rule_acceptances
      (student_email, student_first_name, student_last_name, academic_year, rules_version,
       rules_hash, signature_png, session_id, captured_by_teacher_id, teacher_attested)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(
        student.email,
        student.firstName,
        student.lastName,
        rules.academicYear,
        rules.version,
        rules.hash,
        signature,
        session.id,
        teacher.id,
      );
    if (!result.changes) {
      return Response.json({ error: "Este alumno ya había aceptado esta versión de las normas." }, { status: 409 });
    }
    publishDataChange();
    return Response.json(attendanceDetail(database, session));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la firma." }, { status: 500 });
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
