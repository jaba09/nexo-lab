import { getDatabase } from "../../../../lib/database";
import { IcsLabSession, parseIcsLabSessions } from "../../../../lib/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportMapping = {
  degreeCode: string;
  subjectCode: string;
  teacherId: number | null;
};

type ImportDatabase = ReturnType<typeof getDatabase>;

type ExistingSubject = {
  id: number;
  code: string;
  name: string;
  degreeId: number;
  degreeCode: string;
  degreeName: string;
};

type ExistingDegree = {
  id: number;
  code: string;
  icsCode: string;
  name: string;
};

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function groupKey(session: Pick<IcsLabSession, "degreeCode" | "subjectCode">) {
  return `${session.degreeCode}:${session.subjectCode}`;
}

function findSubjectByCode(database: ImportDatabase, subjectCode: string) {
  const subjects = database.prepare(`SELECT s.id, s.code, s.name, s.degree_id AS degreeId,
      d.code AS degreeCode, d.name AS degreeName
    FROM subjects s JOIN degrees d ON d.id = s.degree_id
    ORDER BY CASE WHEN s.code = ? THEN 0 ELSE 1 END, s.id`
  ).all(subjectCode) as ExistingSubject[];
  return subjects.find((subject) => digits(subject.code) === subjectCode) ?? null;
}

function findDegreeByCode(database: ImportDatabase, degreeCode: string) {
  const degrees = database.prepare(`SELECT id, code, ics_code AS icsCode, name FROM degrees
    ORDER BY CASE WHEN ics_code = ? THEN 0 WHEN code = ? THEN 1 ELSE 2 END, id`
  ).all(degreeCode, degreeCode) as ExistingDegree[];
  return degrees.find((degree) => (
    degree.icsCode === degreeCode
    || (!degree.icsCode && digits(degree.code) === degreeCode)
  )) ?? null;
}

function resolveSubject(database: ImportDatabase, group: ReturnType<typeof previewGroups>[number]) {
  const existingSubject = findSubjectByCode(database, group.subjectCode);
  if (existingSubject) return { subjectId: existingSubject.id, createdSubject: false, createdDegree: false };

  let degree = findDegreeByCode(database, group.degreeCode);
  let createdDegree = false;
  if (!degree) {
    const result = database.prepare(`INSERT INTO degrees (code, ics_code, name, level, academic_year)
      VALUES (?, ?, ?, 'Grado', 1)`
    ).run(group.degreeCode, group.degreeCode, `Grado ${group.degreeCode}`);
    degree = { id: Number(result.lastInsertRowid), code: group.degreeCode, icsCode: group.degreeCode, name: `Grado ${group.degreeCode}` };
    createdDegree = true;
  }

  const result = database.prepare("INSERT INTO subjects (code, name, degree_id) VALUES (?, ?, ?)")
    .run(group.subjectCode, group.subjectName, degree.id);
  return { subjectId: Number(result.lastInsertRowid), createdSubject: true, createdDegree };
}

async function requestPayload(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return await request.json() as Record<string, unknown>;
  }

  const formData = await request.formData();
  const uploadedFile = formData.get("file");
  const content = uploadedFile && typeof uploadedFile === "object" && "text" in uploadedFile
    ? await (uploadedFile as Blob).text()
    : "";
  let mappings: unknown = [];
  const rawMappings = formData.get("mappings");
  if (typeof rawMappings === "string" && rawMappings) {
    try {
      mappings = JSON.parse(rawMappings);
    } catch {
      mappings = [];
    }
  }
  return {
    action: formData.get("action"),
    content,
    mappings,
  } as Record<string, unknown>;
}

function previewGroups(sessions: IcsLabSession[]) {
  const database = getDatabase();
  const grouped = new Map<string, IcsLabSession[]>();
  for (const session of sessions) {
    const key = groupKey(session);
    grouped.set(key, [...(grouped.get(key) ?? []), session]);
  }

  return [...grouped.values()].map((group) => {
    const first = group[0];
    const existingSubject = findSubjectByCode(database, first.subjectCode);
    const existingDegree = existingSubject ? null : findDegreeByCode(database, first.degreeCode);
    const groupCodes = [...new Set(group.map((session) => session.groupCode))]
      .sort((left, right) => Number(left) - Number(right) || left.localeCompare(right));
    return {
      degreeCode: first.degreeCode,
      subjectCode: first.subjectCode,
      subjectName: first.subjectName,
      groupCodes,
      eventCount: group.length,
      firstDate: group[0].sessionDate,
      lastDate: group[group.length - 1].sessionDate,
      existingSubjectId: existingSubject?.id ?? null,
      existingSubjectCode: existingSubject?.code ?? null,
      existingSubjectName: existingSubject?.name ?? null,
      existingSubjectDegreeCode: existingSubject?.degreeCode ?? null,
      existingSubjectDegreeName: existingSubject?.degreeName ?? null,
      existingDegreeId: existingDegree?.id ?? null,
      existingDegreeCode: existingDegree?.code ?? null,
      existingDegreeName: existingDegree?.name ?? null,
    };
  });
}

export async function POST(request: Request) {
  try {
    const payload = await requestPayload(request);
    const content = typeof payload.content === "string" ? payload.content : "";
    if (!content || content.length > 5_000_000) {
      return Response.json({ error: "Selecciona un archivo ICS válido de menos de 5 MB." }, { status: 400 });
    }

    const parsed = parseIcsLabSessions(content);
    const database = getDatabase();
    const holidayDates = new Set([
      ...(database.prepare("SELECT holiday_date AS holidayDate FROM holidays").all() as { holidayDate: string }[])
        .map((holiday) => holiday.holidayDate),
      ...parsed.holidays.map((holiday) => holiday.holidayDate),
    ]);
    const importableSessions = parsed.sessions.filter((session) => !holidayDates.has(session.sessionDate));
    const holidayConflictCount = parsed.sessions.length - importableSessions.length;
    const groups = previewGroups(importableSessions);
    if (payload.action !== "import") {
      return Response.json({
        totalEvents: parsed.totalEvents,
        eligibleCount: importableSessions.length,
        holidayCount: parsed.holidays.length,
        holidayConflictCount,
        ignoredCount: parsed.ignoredCount,
        invalidCount: parsed.invalidCount,
        duplicateCount: parsed.duplicateCount,
        groups,
      });
    }

    if (!parsed.sessions.length && !parsed.holidays.length) {
      return Response.json({ error: "No se encontraron prácticas de laboratorio ni días festivos para importar." }, { status: 400 });
    }
    const rawMappings = Array.isArray(payload.mappings) ? payload.mappings : [];
    const mappings = new Map<string, ImportMapping>();
    for (const rawMapping of rawMappings) {
      if (!rawMapping || typeof rawMapping !== "object") continue;
      const mapping = rawMapping as Record<string, unknown>;
      const item = {
        degreeCode: String(mapping.degreeCode ?? ""),
        subjectCode: String(mapping.subjectCode ?? ""),
        teacherId: positiveInteger(mapping.teacherId) || null,
      };
      if (item.degreeCode && item.subjectCode) {
        mappings.set(groupKey(item), item);
      }
    }

    for (const group of groups) {
      const mapping = mappings.get(groupKey(group));
      if (!mapping) return Response.json({ error: `Falta la configuración de importación para la asignatura ${group.subjectCode}.` }, { status: 400 });
      if (mapping.teacherId !== null) {
        const teacher = database.prepare("SELECT 1 FROM teachers WHERE id = ?").get(mapping.teacherId);
        if (!teacher) return Response.json({ error: `El profesor elegido para ${group.subjectCode} ya no existe.` }, { status: 409 });
      }
    }

    const insert = database.prepare(`INSERT OR IGNORE INTO sessions
      (session_date, start_time, duration, subject_id, teacher_id, source_uid, subject_code, group_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertHoliday = database.prepare(`INSERT OR IGNORE INTO holidays
      (holiday_date, name, source_uid) VALUES (?, ?, ?)`);
    let importedCount = 0;
    let existingCount = 0;
    let importedHolidayCount = 0;
    let existingHolidayCount = 0;
    let createdSubjectCount = 0;
    let createdDegreeCount = 0;
    database.exec("BEGIN IMMEDIATE");
    try {
      const subjectIds = new Map<string, number>();
      for (const group of groups) {
        const resolved = resolveSubject(database, group);
        subjectIds.set(groupKey(group), resolved.subjectId);
        if (resolved.createdSubject) createdSubjectCount += 1;
        if (resolved.createdDegree) createdDegreeCount += 1;
      }
      for (const session of importableSessions) {
        const mapping = mappings.get(groupKey(session))!;
        const result = insert.run(
          session.sessionDate,
          session.startTime,
          session.duration,
          subjectIds.get(groupKey(session))!,
          mapping.teacherId,
          session.sourceUid,
          session.subjectCode,
          session.groupCode,
        );
        if (Number(result.changes)) importedCount += 1;
        else existingCount += 1;
      }
      for (const holiday of parsed.holidays) {
        const result = insertHoliday.run(holiday.holidayDate, holiday.name, holiday.sourceUid);
        if (Number(result.changes)) importedHolidayCount += 1;
        else existingHolidayCount += 1;
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    return Response.json({
      importedCount,
      existingCount,
      importedHolidayCount,
      existingHolidayCount,
      holidayConflictCount,
      ignoredCount: parsed.ignoredCount,
      createdSubjectCount,
      createdDegreeCount,
      firstDate: importableSessions[0]?.sessionDate ?? parsed.holidays[0]?.holidayDate ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo leer el archivo ICS.";
    return Response.json({ error: message }, { status: 500 });
  }
}
