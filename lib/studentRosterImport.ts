import type { DatabaseSync } from "node:sqlite";

export type StudentRosterIssue = {
  rowNumber: number;
  message: string;
};

export type StudentRosterSubgroup = {
  code: string;
  label: string;
  studentCount: number;
};

export type StudentRosterPreview = {
  totalRows: number;
  studentCount: number;
  assignedStudentCount: number;
  unassignedStudentCount: number;
  subgroupCount: number;
  subgroups: StudentRosterSubgroup[];
  invalidCount: number;
  invalidRows: StudentRosterIssue[];
  existingStudentCount: number;
};

export type StudentRosterImportResult = StudentRosterPreview & {
  replacedStudentCount: number;
};

type StudentSubgroup = {
  code: string;
  label: string;
};

type StudentRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  subgroups: StudentSubgroup[];
};

const expectedHeaders = ["nombre", "apellido(s)", "direccion de correo", "grupos"];

function parseCsvRecords(content: string) {
  const records: { rowNumber: number; values: string[] }[] = [];
  let values: string[] = [];
  let value = "";
  let quoted = false;
  let rowNumber = 1;
  let recordRowNumber = 1;

  function finishRecord() {
    values.push(value);
    if (values.some((item) => item.trim() !== "")) records.push({ rowNumber: recordRowNumber, values });
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
    if (character === '"' && value === "") quoted = true;
    else if (character === ",") {
      values.push(value);
      value = "";
    } else if (character === "\n") {
      finishRecord();
      rowNumber += 1;
      recordRowNumber = rowNumber;
    } else if (character !== "\r") value += character;
  }
  if (quoted) throw new Error("El CSV contiene un campo entrecomillado sin cerrar.");
  if (value || values.length) finishRecord();
  return records;
}

function normalizedHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function normalizedEmail(value: string) {
  return value.trim().toLocaleLowerCase("es");
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSubgroups(value: string) {
  if (!value.trim()) return { subgroups: [] as StudentSubgroup[] };
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const subgroups: StudentSubgroup[] = [];
  for (const part of parts) {
    // Moodle also includes the broad course group (for example, "Grupo 531").
    // It is not a laboratory subgroup and must not be imported as one.
    if (/^Grupo\s+\d{1,6}$/i.test(part)) continue;

    const legacyMatch = /^G(\d{1,6})\s*-\s*(.+)$/i.exec(part);
    const moodleMatch = /^[\p{L}_-]+?(\d{1,6})\s+(.+)$/iu.exec(part);
    const match = legacyMatch ?? moodleMatch;
    if (!match || !match[2].trim() || part.length > 200) {
      return { subgroups: [] as StudentSubgroup[], error: `grupo no válido: ${part || "vacío"}` };
    }
    const code = String(Number(match[1]));
    const label = `G${code} - ${match[2].trim()}`;
    const existing = subgroups.find((subgroup) => subgroup.code === code);
    if (existing && existing.label !== label) {
      return { subgroups: [] as StudentSubgroup[], error: `el subgrupo G${code} tiene descripciones distintas` };
    }
    if (!existing) subgroups.push({ code, label });
  }
  if (subgroups.length > 1) {
    return {
      subgroups: [] as StudentSubgroup[],
      error: "cada alumno solo puede pertenecer a un subgrupo",
    };
  }
  return { subgroups };
}

function parseStudentRows(content: string) {
  const records = parseCsvRecords(content.replace(/^\uFEFF/, ""));
  if (!records.length) throw new Error("El archivo CSV está vacío.");
  const header = records[0].values.map(normalizedHeader);
  if (header.length !== expectedHeaders.length || header.some((value, index) => value !== expectedHeaders[index])) {
    throw new Error("La cabecera debe incluir: Nombre, Apellido(s), Dirección de correo y Grupos.");
  }

  const rows: StudentRow[] = [];
  const issues: StudentRosterIssue[] = [];
  const emails = new Set<string>();
  const labelsByCode = new Map<string, string>();
  for (const record of records.slice(1)) {
    if (record.values.length !== expectedHeaders.length) {
      issues.push({ rowNumber: record.rowNumber, message: "La fila no contiene exactamente cuatro columnas." });
      continue;
    }
    const [rawFirstName, rawLastName, rawEmail, rawGroups] = record.values;
    const firstName = rawFirstName.trim();
    const lastName = rawLastName.trim();
    const email = normalizedEmail(rawEmail);
    const parsedGroups = parseSubgroups(rawGroups);
    const problems: string[] = [];
    if (!firstName || firstName.length > 120) problems.push("nombre no válido");
    if (!lastName || lastName.length > 180) problems.push("apellidos no válidos");
    if (!validEmail(email)) problems.push("correo electrónico no válido");
    if (emails.has(email)) problems.push("correo electrónico duplicado");
    if (parsedGroups.error) problems.push(parsedGroups.error);
    for (const subgroup of parsedGroups.subgroups) {
      const existingLabel = labelsByCode.get(subgroup.code);
      if (existingLabel && existingLabel !== subgroup.label) {
        problems.push(`el subgrupo G${subgroup.code} tiene descripciones distintas`);
      }
    }
    if (problems.length) {
      issues.push({ rowNumber: record.rowNumber, message: problems.join(", ") });
      continue;
    }
    emails.add(email);
    for (const subgroup of parsedGroups.subgroups) labelsByCode.set(subgroup.code, subgroup.label);
    rows.push({ rowNumber: record.rowNumber, firstName, lastName, email, subgroups: parsedGroups.subgroups });
  }
  return { totalRows: records.length - 1, rows, issues };
}

function summarize(rows: StudentRow[]) {
  const subgroups = new Map<string, StudentRosterSubgroup>();
  let assignedStudentCount = 0;
  for (const student of rows) {
    if (student.subgroups.length) assignedStudentCount += 1;
    for (const subgroup of student.subgroups) {
      const summary = subgroups.get(subgroup.code) ?? { ...subgroup, studentCount: 0 };
      summary.studentCount += 1;
      subgroups.set(subgroup.code, summary);
    }
  }
  const orderedSubgroups = [...subgroups.values()].sort((left, right) => (
    left.code.localeCompare(right.code, "es", { numeric: true })
  ));
  return {
    studentCount: rows.length,
    assignedStudentCount,
    unassignedStudentCount: rows.length - assignedStudentCount,
    subgroupCount: orderedSubgroups.length,
    subgroups: orderedSubgroups,
  };
}

function existingStudentCount(database: DatabaseSync, subjectId: number, semesterId: string) {
  const row = database.prepare("SELECT COUNT(*) AS total FROM subject_students WHERE subject_id = ? AND semester_id = ?")
    .get(subjectId, semesterId) as { total: number };
  return Number(row.total);
}

export function previewStudentRoster(database: DatabaseSync, subjectId: number, semesterId: string, content: string): StudentRosterPreview {
  const parsed = parseStudentRows(content);
  const summary = summarize(parsed.rows);
  return {
    totalRows: parsed.totalRows,
    ...summary,
    invalidCount: parsed.issues.length,
    invalidRows: parsed.issues,
    existingStudentCount: existingStudentCount(database, subjectId, semesterId),
  };
}

export function importStudentRoster(database: DatabaseSync, subjectId: number, semesterId: string, content: string): StudentRosterImportResult {
  const parsed = parseStudentRows(content);
  if (parsed.issues.length) throw new Error("Corrige las filas no válidas antes de importar el alumnado.");
  if (!parsed.rows.length) throw new Error("El CSV no contiene alumnos para importar.");
  const replacedStudentCount = existingStudentCount(database, subjectId, semesterId);
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM subject_students WHERE subject_id = ? AND semester_id = ?").run(subjectId, semesterId);
    const insertStudent = database.prepare(`INSERT INTO subject_students
      (subject_id, semester_id, first_name, last_name, email) VALUES (?, ?, ?, ?, ?)`);
    const insertSubgroup = database.prepare(`INSERT INTO student_subgroups
      (student_id, group_code, group_label) VALUES (?, ?, ?)`);
    for (const student of parsed.rows) {
      const studentResult = insertStudent.run(subjectId, semesterId, student.firstName, student.lastName, student.email);
      const studentId = Number(studentResult.lastInsertRowid);
      for (const subgroup of student.subgroups) insertSubgroup.run(studentId, subgroup.code, subgroup.label);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return {
    totalRows: parsed.totalRows,
    ...summarize(parsed.rows),
    invalidCount: 0,
    invalidRows: [],
    existingStudentCount: parsed.rows.length,
    replacedStudentCount,
  };
}
