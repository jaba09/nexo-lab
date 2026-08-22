import { getDatabase } from "../../../lib/database";
import { semesterDefinition } from "../../../lib/semesters";
import { getAuthenticatedTeacher, hashPassword, passwordValidationError, unauthorizedResponse } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entity = "laboratories" | "installations" | "practices" | "degrees" | "subjects" | "teachers" | "sessions";

const entities: Entity[] = ["laboratories", "installations", "practices", "degrees", "subjects", "teachers", "sessions"];

function isEntity(value: unknown): value is Entity {
  return typeof value === "string" && entities.includes(value as Entity);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanCode(value: unknown) {
  return cleanString(value).toUpperCase().replace(/\s+/g, "-");
}

function compareSpanish(left: unknown, right: unknown) {
  return String(left).localeCompare(String(right), "es", { sensitivity: "base" });
}

function teacherAlphabeticalKey(name: unknown) {
  return String(name).trim().replace(/^(?:\p{L}\.)+\s*/u, "");
}

function validIcsCode(value: unknown) {
  const code = cleanString(value);
  return /^\d{3}$/.test(code) ? code : "";
}

function validEmail(value: unknown) {
  const email = cleanString(value).toLowerCase();
  if (!email) return "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function positiveIntegerList(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(positiveInteger).filter(Boolean))] : [];
}

function validDate(value: unknown) {
  const date = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? "" : date;
}

function validTime(value: unknown) {
  const time = cleanString(value);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado";
  if (message.includes("UNIQUE constraint failed: teachers.email")) return "Ya existe un profesor con ese correo electrónico.";
  if (message.includes("UNIQUE constraint failed")) return "Ya existe un elemento con ese código.";
  if (message.includes("FOREIGN KEY constraint failed")) return "La relación seleccionada ya no está disponible.";
  if (message.includes("CHECK constraint failed")) return "Revisa los valores numéricos del formulario.";
  return message;
}

function sessionFields(payload: Record<string, unknown>) {
  return {
    sessionDate: validDate(payload.sessionDate),
    startTime: validTime(payload.startTime),
    duration: positiveInteger(payload.duration),
    subjectId: positiveInteger(payload.subjectId),
    teacherId: positiveInteger(payload.teacherId) || null,
    practiceId: positiveInteger(payload.practiceId) || null,
  };
}

function subjectPracticeRelationExists(subjectId: number, practiceId: number) {
  const database = getDatabase();
  return Boolean(database.prepare(
    "SELECT 1 FROM subject_practices WHERE subject_id = ? AND practice_id = ?",
  ).get(subjectId, practiceId));
}

function isHoliday(database: ReturnType<typeof getDatabase>, date: string) {
  return Boolean(database.prepare("SELECT 1 FROM holidays WHERE holiday_date = ?").get(date));
}

export async function GET() {
  if (!await getAuthenticatedTeacher()) return unauthorizedResponse();
  try {
    const database = getDatabase();
    const laboratories = database.prepare(`SELECT
      l.id, l.code, l.name, l.location, l.manager,
      COUNT(i.id) AS installationCount
      FROM laboratories l
      LEFT JOIN installations i ON i.laboratory_id = l.id
      GROUP BY l.id
      ORDER BY l.code`).all();
    const installations = database.prepare(`SELECT
      i.id, i.code, i.name, i.laboratory_id AS laboratoryId,
      l.name AS laboratoryName, i.category, i.capacity, i.status,
      COUNT(pi.practice_id) AS practiceCount
      FROM installations i
      JOIN laboratories l ON l.id = i.laboratory_id
      LEFT JOIN practice_installations pi ON pi.installation_id = i.id
      GROUP BY i.id
      ORDER BY i.code`).all();
    const practices = database.prepare(`SELECT
      p.id, p.code, p.name, p.duration, p.risk_level AS riskLevel,
      COALESCE(loc.installationCount, 0) AS installationCount,
      COALESCE(loc.installationIds, '') AS installationIds,
      COALESCE(loc.installationNames, '') AS installationNames,
      COALESCE(labs.laboratoryNames, '') AS laboratoryNames,
      (SELECT COUNT(*) FROM subject_practices sp WHERE sp.practice_id = p.id) AS subjectCount
      FROM practices p
      LEFT JOIN (
        SELECT pi.practice_id,
          COUNT(*) AS installationCount,
          GROUP_CONCAT(i.id, ',') AS installationIds,
          GROUP_CONCAT(i.name, ' · ') AS installationNames
        FROM practice_installations pi
        JOIN installations i ON i.id = pi.installation_id
        GROUP BY pi.practice_id
      ) loc ON loc.practice_id = p.id
      LEFT JOIN (
        SELECT practice_id, GROUP_CONCAT(laboratoryName, ' · ') AS laboratoryNames
        FROM (
          SELECT DISTINCT pi.practice_id, l.name AS laboratoryName
          FROM practice_installations pi
          JOIN installations i ON i.id = pi.installation_id
          JOIN laboratories l ON l.id = i.laboratory_id
        ) distinct_laboratories
        GROUP BY practice_id
      ) labs ON labs.practice_id = p.id
      ORDER BY p.code`).all() as Record<string, unknown>[];
    const degrees = database.prepare(`SELECT
      d.id, d.code, d.ics_code AS icsCode, d.name, d.level,
      COUNT(s.id) AS subjectCount,
      COALESCE(GROUP_CONCAT(s.code, ','), '') AS subjectCodes,
      COALESCE(GROUP_CONCAT(s.id, ','), '') AS subjectIds
      FROM degrees d
      LEFT JOIN subjects s ON s.degree_id = d.id
      GROUP BY d.id
      ORDER BY d.code`).all() as Record<string, unknown>[];
    const subjects = database.prepare(`SELECT
      s.id, s.code, s.abbreviation, s.name, s.degree_id AS degreeId,
      d.code AS degreeCode, d.name AS degreeName,
      COUNT(sp.practice_id) AS practiceCount,
      COALESCE(GROUP_CONCAT(p.code, ','), '') AS practiceCodes,
      COALESCE(GROUP_CONCAT(p.id, ','), '') AS practiceIds
      FROM subjects s
      JOIN degrees d ON d.id = s.degree_id
      LEFT JOIN subject_practices sp ON sp.subject_id = s.id
      LEFT JOIN practices p ON p.id = sp.practice_id
      GROUP BY s.id
      ORDER BY s.code`).all() as Record<string, unknown>[];
    const teachers = database.prepare(`SELECT
      t.id, t.code, t.name, t.email, COUNT(se.id) AS sessionCount
      FROM teachers t
      LEFT JOIN sessions se ON se.teacher_id = t.id
      GROUP BY t.id
      ORDER BY t.name COLLATE NOCASE, t.code COLLATE NOCASE`).all() as Record<string, unknown>[];
    teachers.sort((left, right) => (
      compareSpanish(teacherAlphabeticalKey(left.name), teacherAlphabeticalKey(right.name))
      || compareSpanish(left.name, right.name)
      || compareSpanish(left.code, right.code)
    ));
    const sessions = database.prepare(`SELECT
      se.id, se.session_date AS sessionDate, se.start_time AS startTime,
      se.duration, se.subject_id AS subjectId, s.code AS subjectCode,
      s.abbreviation AS subjectAbbreviation, s.name AS subjectName,
      s.degree_id AS degreeId, d.code AS degreeCode,
      d.name AS degreeName, se.practice_id AS practiceId,
      p.code AS practiceCode, p.name AS practiceName,
      loc.installationName, se.teacher_id AS teacherId,
      t.code AS teacherCode, t.name AS teacherName, se.group_code AS groupCode,
      COALESCE((
        SELECT GROUP_CONCAT(DISTINCT degree_practices.practice_id)
        FROM subject_practices degree_practices
        JOIN subjects degree_subject ON degree_subject.id = degree_practices.subject_id
        WHERE degree_subject.degree_id = s.degree_id
      ), '') AS degreePracticeIds
      FROM sessions se
      JOIN subjects s ON s.id = se.subject_id
      JOIN degrees d ON d.id = s.degree_id
      LEFT JOIN teachers t ON t.id = se.teacher_id
      LEFT JOIN practices p ON p.id = se.practice_id
      LEFT JOIN (
        SELECT pi.practice_id, GROUP_CONCAT(i.name, ' · ') AS installationName
        FROM practice_installations pi
        JOIN installations i ON i.id = pi.installation_id
        GROUP BY pi.practice_id
      ) loc ON loc.practice_id = p.id
      ORDER BY se.session_date, se.start_time, se.id`).all() as Record<string, unknown>[];
    const holidays = database.prepare(`SELECT
      id, holiday_date AS holidayDate, name
      FROM holidays
      ORDER BY holiday_date, id`).all();

    return Response.json({
      laboratories,
      installations,
      practices: practices.map((practice) => ({
        ...practice,
        installationIds: String(practice.installationIds || "").split(",").filter(Boolean).map(Number),
      })),
      degrees: degrees.map((degree) => ({
        ...degree,
        subjectCodes: String(degree.subjectCodes || "").split(",").filter(Boolean),
        subjectIds: String(degree.subjectIds || "").split(",").filter(Boolean).map(Number),
      })),
      subjects: subjects.map((subject) => ({
        ...subject,
        practiceCodes: String(subject.practiceCodes || "").split(",").filter(Boolean),
        practiceIds: String(subject.practiceIds || "").split(",").filter(Boolean).map(Number),
      })),
      teachers,
      sessions: sessions.map((session) => ({
        ...session,
        degreePracticeIds: String(session.degreePracticeIds || "").split(",").filter(Boolean).map(Number),
      })),
      holidays,
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await getAuthenticatedTeacher()) return unauthorizedResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const entity = payload.entity;
    if (!isEntity(entity)) return Response.json({ error: "Tipo de elemento no válido." }, { status: 400 });

    const database = getDatabase();
    if (entity === "sessions") {
      const { sessionDate, startTime, duration, subjectId, teacherId, practiceId } = sessionFields(payload);
      if (!sessionDate || !startTime || !duration || !subjectId || !teacherId || !practiceId) {
        return Response.json({ error: "Completa el día, la hora, la duración, la asignatura, el profesor y la práctica." }, { status: 400 });
      }
      if (isHoliday(database, sessionDate)) {
        return Response.json({ error: "No se puede crear una sesión en un día festivo." }, { status: 409 });
      }
      if (!subjectPracticeRelationExists(subjectId, practiceId)) {
        return Response.json({ error: "La práctica seleccionada no está asignada a esa asignatura." }, { status: 409 });
      }
      if (!database.prepare("SELECT 1 FROM teachers WHERE id = ?").get(teacherId)) {
        return Response.json({ error: "El profesor seleccionado ya no está disponible." }, { status: 409 });
      }
      database.prepare("INSERT INTO sessions (session_date, start_time, duration, subject_id, teacher_id, practice_id) VALUES (?, ?, ?, ?, ?, ?)").run(sessionDate, startTime, duration, subjectId, teacherId, practiceId);
      return Response.json({ ok: true }, { status: 201 });
    }

    const code = cleanCode(payload.code);
    const name = cleanString(payload.name);
    if (!code || !name) return Response.json({ error: "El código y el nombre son obligatorios." }, { status: 400 });

    if (entity === "laboratories") {
      const location = cleanString(payload.location);
      const manager = cleanString(payload.manager);
      if (!location || !manager) return Response.json({ error: "La ubicación y la persona responsable son obligatorias." }, { status: 400 });
      database.prepare("INSERT INTO laboratories (code, name, location, manager) VALUES (?, ?, ?, ?)").run(code, name, location, manager);
    } else if (entity === "installations") {
      const laboratoryId = positiveInteger(payload.laboratoryId);
      const capacity = positiveInteger(payload.capacity);
      const category = cleanString(payload.category);
      const status = cleanString(payload.status);
      if (!laboratoryId || !capacity || !category || !status) return Response.json({ error: "Completa todos los datos de la instalación." }, { status: 400 });
      database.prepare("INSERT INTO installations (code, name, laboratory_id, category, capacity, status) VALUES (?, ?, ?, ?, ?, ?)").run(code, name, laboratoryId, category, capacity, status);
    } else if (entity === "practices") {
      const installationIds = positiveIntegerList(payload.installationIds);
      const duration = positiveInteger(payload.duration);
      const riskLevel = cleanString(payload.riskLevel);
      if (!installationIds.length || !duration || !riskLevel) return Response.json({ error: "Selecciona al menos una instalación y completa los datos de la práctica." }, { status: 400 });
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = database.prepare("INSERT INTO practices (code, name, duration, risk_level) VALUES (?, ?, ?, ?)").run(code, name, duration, riskLevel);
        const practiceId = Number(result.lastInsertRowid);
        const relation = database.prepare("INSERT INTO practice_installations (practice_id, installation_id) VALUES (?, ?)");
        for (const installationId of installationIds) relation.run(practiceId, installationId);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } else if (entity === "degrees") {
      const level = cleanString(payload.level);
      const icsCode = validIcsCode(payload.icsCode);
      if (!level || !icsCode) return Response.json({ error: "Completa el nivel y un código ICS de tres dígitos." }, { status: 400 });
      database.prepare("INSERT INTO degrees (code, ics_code, name, level, academic_year) VALUES (?, ?, ?, ?, 1)").run(code, icsCode, name, level);
    } else if (entity === "teachers") {
      const email = validEmail(payload.email);
      if (!email) return Response.json({ error: "Introduce un correo electrónico válido." }, { status: 400 });
      const passwordError = passwordValidationError(payload.password);
      if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
      database.prepare("INSERT INTO teachers (code, name, email, password_hash) VALUES (?, ?, ?, ?)")
        .run(code, name, email, hashPassword(String(payload.password)));
    } else if (entity === "subjects") {
      const degreeId = positiveInteger(payload.degreeId);
      const practiceIds = positiveIntegerList(payload.practiceIds);
      const abbreviation = cleanString(payload.abbreviation).toUpperCase().slice(0, 16);
      if (!degreeId) return Response.json({ error: "Selecciona el grado al que pertenece la asignatura." }, { status: 400 });
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = database.prepare("INSERT INTO subjects (code, abbreviation, name, degree_id) VALUES (?, ?, ?, ?)").run(code, abbreviation, name, degreeId);
        const subjectId = Number(result.lastInsertRowid);
        const relation = database.prepare("INSERT INTO subject_practices (subject_id, practice_id) VALUES (?, ?)");
        for (const practiceId of practiceIds) relation.run(subjectId, practiceId);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!await getAuthenticatedTeacher()) return unauthorizedResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const entity = payload.entity;
    const id = positiveInteger(payload.id);
    if (!isEntity(entity)) return Response.json({ error: "Tipo de elemento no válido." }, { status: 400 });
    if (!id) return Response.json({ error: "El identificador es obligatorio." }, { status: 400 });

    const database = getDatabase();
    const tableByEntity: Record<Entity, string> = {
      laboratories: "laboratories",
      installations: "installations",
      practices: "practices",
      degrees: "degrees",
      subjects: "subjects",
      teachers: "teachers",
      sessions: "sessions",
    };
    const existing = database.prepare(`SELECT id FROM ${tableByEntity[entity]} WHERE id = ?`).get(id);
    if (!existing) return Response.json({ error: "El registro que intentas editar ya no existe." }, { status: 404 });

    if (entity === "sessions") {
      const { sessionDate, startTime, duration, subjectId, teacherId, practiceId } = sessionFields(payload);
      const currentSession = database.prepare("SELECT session_date AS sessionDate, practice_id AS practiceId FROM sessions WHERE id = ?").get(id) as { sessionDate: string; practiceId: number | null };
      if (!sessionDate || !startTime || !duration || !subjectId) {
        return Response.json({ error: "Completa el día, la hora, la duración y la asignatura." }, { status: 400 });
      }
      if (sessionDate !== currentSession.sessionDate && isHoliday(database, sessionDate)) {
        return Response.json({ error: "No se puede mover una sesión a un día festivo." }, { status: 409 });
      }
      if (!database.prepare("SELECT 1 FROM subjects WHERE id = ?").get(subjectId)) {
        return Response.json({ error: "La asignatura seleccionada ya no está disponible." }, { status: 409 });
      }
      if (practiceId !== null && !subjectPracticeRelationExists(subjectId, practiceId)) {
        return Response.json({ error: "La práctica seleccionada no está asignada a esa asignatura." }, { status: 409 });
      }
      if (teacherId !== null && !database.prepare("SELECT 1 FROM teachers WHERE id = ?").get(teacherId)) {
        return Response.json({ error: "El profesor seleccionado ya no está disponible." }, { status: 409 });
      }
      let resolvedDuration = duration;
      if (practiceId !== null && practiceId !== currentSession.practiceId) {
        const practice = database.prepare("SELECT duration FROM practices WHERE id = ?").get(practiceId) as { duration: number };
        resolvedDuration = practice.duration;
      }
      database.prepare("UPDATE sessions SET session_date = ?, start_time = ?, duration = ?, subject_id = ?, teacher_id = ?, practice_id = ? WHERE id = ?").run(sessionDate, startTime, resolvedDuration, subjectId, teacherId, practiceId, id);
      return Response.json({ ok: true });
    }

    const code = cleanCode(payload.code);
    const name = cleanString(payload.name);
    if (!code || !name) return Response.json({ error: "El código y el nombre son obligatorios." }, { status: 400 });

    if (entity === "laboratories") {
      const location = cleanString(payload.location);
      const manager = cleanString(payload.manager);
      if (!location || !manager) return Response.json({ error: "La ubicación y la persona responsable son obligatorias." }, { status: 400 });
      database.prepare("UPDATE laboratories SET code = ?, name = ?, location = ?, manager = ? WHERE id = ?").run(code, name, location, manager, id);
    } else if (entity === "installations") {
      const laboratoryId = positiveInteger(payload.laboratoryId);
      const capacity = positiveInteger(payload.capacity);
      const category = cleanString(payload.category);
      const status = cleanString(payload.status);
      if (!laboratoryId || !capacity || !category || !status) return Response.json({ error: "Completa todos los datos de la instalación." }, { status: 400 });
      database.prepare("UPDATE installations SET code = ?, name = ?, laboratory_id = ?, category = ?, capacity = ?, status = ? WHERE id = ?").run(code, name, laboratoryId, category, capacity, status, id);
    } else if (entity === "practices") {
      const installationIds = positiveIntegerList(payload.installationIds);
      const duration = positiveInteger(payload.duration);
      const riskLevel = cleanString(payload.riskLevel);
      if (!installationIds.length || !duration || !riskLevel) return Response.json({ error: "Selecciona al menos una instalación y completa los datos de la práctica." }, { status: 400 });
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("UPDATE practices SET code = ?, name = ?, duration = ?, risk_level = ? WHERE id = ?").run(code, name, duration, riskLevel, id);
        const relation = database.prepare("INSERT OR IGNORE INTO practice_installations (practice_id, installation_id) VALUES (?, ?)");
        for (const installationId of installationIds) relation.run(id, installationId);
        const placeholders = installationIds.map(() => "?").join(", ");
        database.prepare(`DELETE FROM practice_installations WHERE practice_id = ? AND installation_id NOT IN (${placeholders})`).run(id, ...installationIds);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } else if (entity === "degrees") {
      const level = cleanString(payload.level);
      const icsCode = validIcsCode(payload.icsCode);
      if (!level || !icsCode) return Response.json({ error: "Completa el nivel y un código ICS de tres dígitos." }, { status: 400 });
      database.prepare("UPDATE degrees SET code = ?, ics_code = ?, name = ?, level = ? WHERE id = ?").run(code, icsCode, name, level, id);
    } else if (entity === "teachers") {
      const email = validEmail(payload.email);
      if (!email) return Response.json({ error: "Introduce un correo electrónico válido." }, { status: 400 });
      const password = typeof payload.password === "string" ? payload.password : "";
      if (password) {
        const passwordError = passwordValidationError(password);
        if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
        database.prepare("UPDATE teachers SET code = ?, name = ?, email = ?, password_hash = ? WHERE id = ?")
          .run(code, name, email, hashPassword(password), id);
      } else {
        database.prepare("UPDATE teachers SET code = ?, name = ?, email = ? WHERE id = ?").run(code, name, email, id);
      }
    } else if (entity === "subjects") {
      const degreeId = positiveInteger(payload.degreeId);
      const practiceIds = positiveIntegerList(payload.practiceIds);
      const abbreviation = cleanString(payload.abbreviation).toUpperCase().slice(0, 16);
      if (!degreeId) return Response.json({ error: "Selecciona el grado al que pertenece la asignatura." }, { status: 400 });
      const scheduledPractices = database.prepare("SELECT DISTINCT practice_id AS practiceId FROM sessions WHERE subject_id = ? AND practice_id IS NOT NULL").all(id) as { practiceId: number }[];
      if (scheduledPractices.some(({ practiceId }) => !practiceIds.includes(practiceId))) {
        return Response.json({ error: "No puedes retirar una práctica de la asignatura mientras tenga sesiones programadas." }, { status: 409 });
      }

      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("UPDATE subjects SET code = ?, abbreviation = ?, name = ?, degree_id = ? WHERE id = ?").run(code, abbreviation, name, degreeId, id);
        const relation = database.prepare("INSERT OR IGNORE INTO subject_practices (subject_id, practice_id) VALUES (?, ?)");
        for (const practiceId of practiceIds) relation.run(id, practiceId);
        if (practiceIds.length) {
          const placeholders = practiceIds.map(() => "?").join(", ");
          database.prepare(`DELETE FROM subject_practices WHERE subject_id = ? AND practice_id NOT IN (${placeholders})`).run(id, ...practiceIds);
        } else {
          database.prepare("DELETE FROM subject_practices WHERE subject_id = ?").run(id);
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!await getAuthenticatedTeacher()) return unauthorizedResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (payload.entity !== "sessions") {
      return Response.json({ error: "La actualización masiva solo está disponible para sesiones." }, { status: 400 });
    }

    if (payload.action === "move") {
      const id = positiveInteger(payload.id);
      const sessionDate = validDate(payload.sessionDate);
      const startTime = validTime(payload.startTime);
      if (!id || !sessionDate || !startTime) {
        return Response.json({ error: "El destino de la sesión no es válido." }, { status: 400 });
      }
      const database = getDatabase();
      if (isHoliday(database, sessionDate)) {
        return Response.json({ error: "No se puede mover una sesión a un día festivo." }, { status: 409 });
      }
      const result = database.prepare(
        "UPDATE sessions SET session_date = ?, start_time = ? WHERE id = ?",
      ).run(sessionDate, startTime, id);
      if (!result.changes) {
        return Response.json({ error: "La sesión que intentas mover ya no existe." }, { status: 404 });
      }
      return Response.json({ ok: true });
    }

    const ids = positiveIntegerList(payload.ids);
    if (!ids.length || ids.length > 500) {
      return Response.json({ error: "Selecciona entre 1 y 500 sesiones." }, { status: 400 });
    }
    const database = getDatabase();
    const placeholders = ids.map(() => "?").join(", ");
    const selectedSessions = database.prepare(
      `SELECT se.id, se.subject_id AS subjectId, s.degree_id AS degreeId
      FROM sessions se
      JOIN subjects s ON s.id = se.subject_id
      WHERE se.id IN (${placeholders})`,
    ).all(...ids) as { id: number; subjectId: number; degreeId: number }[];
    if (selectedSessions.length !== ids.length) {
      return Response.json({ error: "Alguna de las sesiones seleccionadas ya no existe." }, { status: 404 });
    }

    if (payload.action === "assign-teacher") {
      const teacherId = payload.teacherId === null ? null : positiveInteger(payload.teacherId);
      if (payload.teacherId !== null && !teacherId) {
        return Response.json({ error: "El profesor seleccionado no es válido." }, { status: 400 });
      }
      if (teacherId !== null && !database.prepare("SELECT 1 FROM teachers WHERE id = ?").get(teacherId)) {
        return Response.json({ error: "El profesor seleccionado ya no existe." }, { status: 409 });
      }

      database.exec("BEGIN IMMEDIATE");
      try {
        const update = database.prepare("UPDATE sessions SET teacher_id = ? WHERE id = ?");
        for (const selectedId of ids) update.run(teacherId, selectedId);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return Response.json({ ok: true, updatedCount: ids.length });
    }

    const practiceId = payload.practiceId === null ? null : positiveInteger(payload.practiceId);
    if (payload.practiceId !== null && !practiceId) {
      return Response.json({ error: "La práctica seleccionada no es válida." }, { status: 400 });
    }
    const practice = practiceId === null
      ? null
      : database.prepare("SELECT duration FROM practices WHERE id = ?").get(practiceId) as { duration: number } | undefined;
    if (practiceId !== null && !practice) {
      return Response.json({ error: "La práctica seleccionada ya no existe." }, { status: 409 });
    }
    if (practiceId !== null) {
      const eligibleDegrees = new Set((database.prepare(`SELECT DISTINCT s.degree_id AS degreeId
        FROM subject_practices sp
        JOIN subjects s ON s.id = sp.subject_id
        WHERE sp.practice_id = ?`).all(practiceId) as { degreeId: number }[]).map(({ degreeId }) => degreeId));
      if (selectedSessions.some((session) => !eligibleDegrees.has(session.degreeId))) {
        return Response.json({ error: "La práctica seleccionada no pertenece al grado de todas las sesiones seleccionadas." }, { status: 409 });
      }
    }
    const practiceDuration = practice?.duration ?? null;
    let linkedSubjectCount = 0;

    database.exec("BEGIN IMMEDIATE");
    try {
      const update = practiceId === null
        ? database.prepare("UPDATE sessions SET practice_id = NULL WHERE id = ?")
        : database.prepare("UPDATE sessions SET practice_id = ?, duration = ? WHERE id = ?");
      if (practiceId !== null) {
        const linkPractice = database.prepare("INSERT OR IGNORE INTO subject_practices (subject_id, practice_id) VALUES (?, ?)");
        for (const subjectId of new Set(selectedSessions.map((session) => session.subjectId))) {
          linkedSubjectCount += Number(linkPractice.run(subjectId, practiceId).changes);
        }
      }
      for (const selectedId of ids) {
        if (practiceId === null) update.run(selectedId);
        else update.run(practiceId, practiceDuration, selectedId);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    return Response.json({ ok: true, updatedCount: ids.length, linkedSubjectCount });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authenticatedTeacher = await getAuthenticatedTeacher();
  if (!authenticatedTeacher) return unauthorizedResponse();
  try {
    const payload = await request.json() as { entity?: Entity; id?: unknown; ids?: unknown; semesterId?: unknown };
    const entity = payload.entity;
    if (!isEntity(entity)) return Response.json({ error: "Solicitud no válida." }, { status: 400 });

    const database = getDatabase();
    if (entity === "sessions") {
      if (typeof payload.semesterId === "string") {
        let semester;
        try {
          semester = semesterDefinition(payload.semesterId);
        } catch {
          return Response.json({ error: "El semestre indicado no es válido." }, { status: 400 });
        }
        const result = database.prepare("DELETE FROM sessions WHERE session_date BETWEEN ? AND ?")
          .run(semester.startDate, semester.endDate);
        return Response.json({ ok: true, deletedCount: Number(result.changes) });
      }
      if (Array.isArray(payload.ids)) {
        const ids = positiveIntegerList(payload.ids);
        if (!ids.length) return Response.json({ error: "Selecciona al menos una sesión." }, { status: 400 });
        const placeholders = ids.map(() => "?").join(", ");
        const result = database.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...ids);
        return Response.json({ ok: true, deletedCount: Number(result.changes) });
      }
      const id = positiveInteger(payload.id);
      if (!id) return Response.json({ error: "Solicitud no válida." }, { status: 400 });
      const result = database.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      return Response.json({ ok: true, deletedCount: Number(result.changes) });
    }

    const id = positiveInteger(payload.id);
    if (!id) return Response.json({ error: "Solicitud no válida." }, { status: 400 });
    if (entity === "laboratories") {
      const usage = database.prepare("SELECT COUNT(*) AS total FROM installations WHERE laboratory_id = ?").get(id) as { total: number };
      if (Number(usage.total)) return Response.json({ error: "No puedes eliminar este laboratorio porque todavía contiene instalaciones." }, { status: 409 });
      database.prepare("DELETE FROM laboratories WHERE id = ?").run(id);
    } else if (entity === "installations") {
      const usage = database.prepare("SELECT COUNT(*) AS total FROM practice_installations WHERE installation_id = ?").get(id) as { total: number };
      if (Number(usage.total)) return Response.json({ error: "No puedes eliminar esta instalación porque todavía la usan prácticas." }, { status: 409 });
      database.prepare("DELETE FROM installations WHERE id = ?").run(id);
    } else if (entity === "practices") {
      const usage = database.prepare("SELECT COUNT(*) AS total FROM subject_practices WHERE practice_id = ?").get(id) as { total: number };
      if (Number(usage.total)) return Response.json({ error: "No puedes eliminar esta práctica porque todavía está asignada a asignaturas." }, { status: 409 });
      database.prepare("DELETE FROM practices WHERE id = ?").run(id);
    } else if (entity === "subjects") {
      const usage = database.prepare("SELECT COUNT(*) AS total FROM sessions WHERE subject_id = ?").get(id) as { total: number };
      if (Number(usage.total)) return Response.json({ error: "No puedes eliminar esta asignatura porque todavía tiene sesiones programadas." }, { status: 409 });
      database.prepare("DELETE FROM subjects WHERE id = ?").run(id);
    } else if (entity === "teachers") {
      if (id === authenticatedTeacher.id) {
        return Response.json({ error: "No puedes eliminar el profesor con el que has iniciado sesión." }, { status: 409 });
      }
      const usage = database.prepare("SELECT COUNT(*) AS total FROM sessions WHERE teacher_id = ?").get(id) as { total: number };
      if (Number(usage.total)) return Response.json({ error: "No puedes eliminar este profesor porque todavía tiene sesiones asignadas." }, { status: 409 });
      database.prepare("DELETE FROM teachers WHERE id = ?").run(id);
    } else if (entity === "degrees") {
      const usage = database.prepare("SELECT COUNT(*) AS total FROM subjects WHERE degree_id = ?").get(id) as { total: number };
      if (Number(usage.total)) return Response.json({ error: "No puedes eliminar este grado porque todavía contiene asignaturas." }, { status: 409 });
      database.prepare("DELETE FROM degrees WHERE id = ?").run(id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
