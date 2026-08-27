import type { DatabaseSync } from "node:sqlite";

export type SessionAssignmentConflictMode = "keep-existing" | "overwrite-existing";

export type SessionAssignmentCsvIssue = {
  rowNumber: number;
  message: string;
};

export type SessionAssignmentPreview = {
  totalRows: number;
  matchedCount: number;
  assignedTeacherRows: number;
  unassignedTeacherRows: number;
  alreadyAssignedCount: number;
  sameAssignmentCount: number;
  conflictingAssignmentCount: number;
  durationMismatchCount: number;
  unmatchedCount: number;
  invalidCount: number;
  invalidRows: SessionAssignmentCsvIssue[];
  unmatchedRows: SessionAssignmentCsvIssue[];
  unknownTeacherCodes: string[];
};

export type SessionAssignmentImportResult = {
  matchedCount: number;
  updatedCount: number;
  assignedCount: number;
  clearedCount: number;
  preservedCount: number;
  unchangedCount: number;
  durationMismatchCount: number;
};

type ParsedCsvRecord = {
  rowNumber: number;
  values: string[];
};

type AssignmentRow = {
  rowNumber: number;
  subjectCode: string;
  sessionDate: string;
  startTime: string;
  duration: number;
  teacherCode: string;
};

type SessionRow = {
  id: number;
  subjectCode: string;
  sessionDate: string;
  startTime: string;
  duration: number;
  groupCode: string | null;
  teacherId: number | null;
  teacherCode: string | null;
};

type MatchedAssignment = {
  csv: AssignmentRow;
  session: SessionRow;
  targetTeacherId: number | null | undefined;
};

type AssignmentAnalysis = {
  preview: SessionAssignmentPreview;
  matches: MatchedAssignment[];
};

const expectedHeaders = ["codigo", "fecha", "hora_ini", "duracion", "siglas"];

function normalizedCode(value: string) {
  return value.trim().toLocaleUpperCase("es");
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function sessionKey(subjectCode: string, sessionDate: string, startTime: string) {
  return `${normalizedCode(subjectCode)}\u0000${sessionDate}\u0000${startTime}`;
}

function parseCsvRecords(content: string) {
  const records: ParsedCsvRecord[] = [];
  let values: string[] = [];
  let value = "";
  let quoted = false;
  let rowNumber = 1;
  let recordRowNumber = 1;

  function finishRecord() {
    values.push(value);
    if (values.some((item) => item.trim() !== "")) {
      records.push({ rowNumber: recordRowNumber, values });
    }
    values = [];
    value = "";
  }

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
        if (character === "\n") rowNumber += 1;
      }
      continue;
    }
    if (character === '"' && value === "") {
      quoted = true;
    } else if (character === ",") {
      values.push(value);
      value = "";
    } else if (character === "\n") {
      finishRecord();
      rowNumber += 1;
      recordRowNumber = rowNumber;
    } else if (character !== "\r") {
      value += character;
    }
  }
  if (quoted) throw new Error("El CSV contiene un campo entrecomillado sin cerrar.");
  if (value || values.length) finishRecord();
  return records;
}

function parseAssignmentRows(content: string) {
  const records = parseCsvRecords(content.replace(/^\uFEFF/, ""));
  if (!records.length) throw new Error("El archivo CSV está vacío.");
  const header = records[0].values.map((value) => value.trim().toLocaleLowerCase("es"));
  if (header.length !== expectedHeaders.length || header.some((value, index) => value !== expectedHeaders[index])) {
    throw new Error(`La cabecera debe ser exactamente: ${expectedHeaders.join(",")}.`);
  }

  const rows: AssignmentRow[] = [];
  const issues: SessionAssignmentCsvIssue[] = [];
  for (const record of records.slice(1)) {
    if (record.values.length !== expectedHeaders.length) {
      issues.push({ rowNumber: record.rowNumber, message: "La fila no contiene exactamente cinco columnas." });
      continue;
    }
    const [rawSubjectCode, rawDate, rawTime, rawDuration, rawTeacherCode] = record.values.map((value) => value.trim());
    const subjectCode = normalizedCode(rawSubjectCode);
    const teacherCode = rawTeacherCode.trim();
    const duration = Number(rawDuration);
    const problems: string[] = [];
    if (!subjectCode || subjectCode.length > 64) problems.push("código de asignatura no válido");
    if (!validDate(rawDate)) problems.push("fecha no válida");
    if (!validTime(rawTime)) problems.push("hora de inicio no válida");
    if (!Number.isInteger(duration) || duration <= 0 || duration > 1440) problems.push("duración no válida");
    if (teacherCode.length > 32) problems.push("siglas de profesor no válidas");
    if (problems.length) {
      issues.push({ rowNumber: record.rowNumber, message: problems.join(", ") });
      continue;
    }
    rows.push({
      rowNumber: record.rowNumber,
      subjectCode,
      sessionDate: rawDate,
      startTime: rawTime,
      duration,
      teacherCode,
    });
  }
  return { totalRows: records.length - 1, rows, issues };
}

function compareSessionCandidates(left: SessionRow, right: SessionRow) {
  const leftGroup = left.groupCode && /^\d+$/.test(left.groupCode) ? Number(left.groupCode) : Number.POSITIVE_INFINITY;
  const rightGroup = right.groupCode && /^\d+$/.test(right.groupCode) ? Number(right.groupCode) : Number.POSITIVE_INFINITY;
  return leftGroup - rightGroup
    || String(left.groupCode ?? "").localeCompare(String(right.groupCode ?? ""), "es", { numeric: true })
    || left.id - right.id;
}

function analyzeSessionAssignments(database: DatabaseSync, content: string): AssignmentAnalysis {
  const parsed = parseAssignmentRows(content);
  const teachers = database.prepare("SELECT id, code FROM teachers").all() as { id: number; code: string }[];
  const teachersByCode = new Map(teachers.map((teacher) => [normalizedCode(teacher.code), teacher.id]));
  const sessions = database.prepare(`SELECT
    se.id, s.code AS subjectCode, se.session_date AS sessionDate,
    se.start_time AS startTime, se.duration, se.group_code AS groupCode,
    se.teacher_id AS teacherId, t.code AS teacherCode
    FROM sessions se
    JOIN subjects s ON s.id = se.subject_id
    LEFT JOIN teachers t ON t.id = se.teacher_id`
  ).all() as SessionRow[];
  const sessionsByKey = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const key = sessionKey(session.subjectCode, session.sessionDate, session.startTime);
    const candidates = sessionsByKey.get(key) ?? [];
    candidates.push(session);
    sessionsByKey.set(key, candidates);
  }
  for (const candidates of sessionsByKey.values()) candidates.sort(compareSessionCandidates);

  const consumedByKey = new Map<string, number>();
  const matches: MatchedAssignment[] = [];
  const unmatchedRows: SessionAssignmentCsvIssue[] = [];
  const unknownTeacherCodes = new Set<string>();
  for (const row of parsed.rows) {
    const key = sessionKey(row.subjectCode, row.sessionDate, row.startTime);
    const position = consumedByKey.get(key) ?? 0;
    const session = sessionsByKey.get(key)?.[position];
    if (!session) {
      unmatchedRows.push({
        rowNumber: row.rowNumber,
        message: `${row.subjectCode} · ${row.sessionDate} · ${row.startTime}`,
      });
      continue;
    }
    consumedByKey.set(key, position + 1);
    const normalizedTeacherCode = normalizedCode(row.teacherCode);
    const targetTeacherId = normalizedTeacherCode ? teachersByCode.get(normalizedTeacherCode) : null;
    if (normalizedTeacherCode && targetTeacherId === undefined) unknownTeacherCodes.add(row.teacherCode);
    matches.push({ csv: row, session, targetTeacherId });
  }

  const assignedTeacherRows = parsed.rows.filter((row) => row.teacherCode !== "").length;
  const alreadyAssigned = matches.filter((match) => match.session.teacherId !== null);
  const preview: SessionAssignmentPreview = {
    totalRows: parsed.totalRows,
    matchedCount: matches.length,
    assignedTeacherRows,
    unassignedTeacherRows: parsed.rows.length - assignedTeacherRows,
    alreadyAssignedCount: alreadyAssigned.length,
    sameAssignmentCount: alreadyAssigned.filter((match) => match.session.teacherId === match.targetTeacherId).length,
    conflictingAssignmentCount: alreadyAssigned.filter((match) => match.session.teacherId !== match.targetTeacherId).length,
    durationMismatchCount: matches.filter((match) => match.csv.duration !== match.session.duration).length,
    unmatchedCount: unmatchedRows.length,
    invalidCount: parsed.issues.length,
    invalidRows: parsed.issues.slice(0, 20),
    unmatchedRows: unmatchedRows.slice(0, 20),
    unknownTeacherCodes: [...unknownTeacherCodes].sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" })),
  };
  return { preview, matches };
}

export function previewSessionAssignments(database: DatabaseSync, content: string) {
  return analyzeSessionAssignments(database, content).preview;
}

export function importSessionAssignments(
  database: DatabaseSync,
  content: string,
  conflictMode: SessionAssignmentConflictMode,
): SessionAssignmentImportResult {
  database.exec("BEGIN IMMEDIATE");
  try {
    const analysis = analyzeSessionAssignments(database, content);
    const { preview, matches } = analysis;
    if (preview.invalidCount) throw new Error("El CSV contiene filas con datos no válidos.");
    if (preview.unmatchedCount) throw new Error("Hay filas del CSV que no corresponden a ninguna sesión existente.");
    if (preview.unknownTeacherCodes.length) throw new Error("El CSV contiene profesores que no existen.");

    const updateTeacher = database.prepare("UPDATE sessions SET teacher_id = ? WHERE id = ?");
    let assignedCount = 0;
    let clearedCount = 0;
    let preservedCount = 0;
    let unchangedCount = 0;
    for (const match of matches) {
      if (conflictMode === "keep-existing" && match.session.teacherId !== null) {
        preservedCount += 1;
        continue;
      }
      const targetTeacherId = match.targetTeacherId ?? null;
      if (match.session.teacherId === targetTeacherId) {
        unchangedCount += 1;
        continue;
      }
      updateTeacher.run(targetTeacherId, match.session.id);
      if (targetTeacherId === null) clearedCount += 1;
      else assignedCount += 1;
    }
    database.exec("COMMIT");
    return {
      matchedCount: preview.matchedCount,
      updatedCount: assignedCount + clearedCount,
      assignedCount,
      clearedCount,
      preservedCount,
      unchangedCount,
      durationMismatchCount: preview.durationMismatchCount,
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
