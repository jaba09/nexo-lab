import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  importSessionAssignments,
  previewSessionAssignments,
} from "../lib/sessionAssignmentImport.ts";

function assignmentDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE teachers (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);
    CREATE TABLE subjects (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      teacher_id INTEGER,
      group_code TEXT
    );
    INSERT INTO teachers (id, code) VALUES (1, 'JBA'), (2, 'JBC');
    INSERT INTO subjects (id, code) VALUES (1, '30013');
    INSERT INTO sessions
      (id, session_date, start_time, duration, subject_id, teacher_id, group_code)
    VALUES
      (30, '2026-09-14', '10:00', 120, 1, 1, '13'),
      (10, '2026-09-14', '10:00', 180, 1, 1, '11'),
      (20, '2026-09-14', '10:00', 180, 1, 2, '12');
  `);
  return database;
}

const csv = `\uFEFFcodigo,fecha,hora_ini,duracion,siglas\r
30013,2026-09-14,10:00,120,JBC\r
30013,2026-09-14,10:00,180,\r
30013,2026-09-14,10:00,120,JBA\r
`;

test("previews and imports teacher assignments in subgroup order", () => {
  const database = assignmentDatabase();
  const preview = previewSessionAssignments(database, csv);
  assert.deepEqual(preview, {
    totalRows: 3,
    matchedCount: 3,
    assignedTeacherRows: 2,
    unassignedTeacherRows: 1,
    alreadyAssignedCount: 3,
    sameAssignmentCount: 1,
    conflictingAssignmentCount: 2,
    durationMismatchCount: 1,
    unmatchedCount: 0,
    invalidCount: 0,
    invalidRows: [],
    unmatchedRows: [],
    unknownTeacherCodes: [],
  });

  assert.deepEqual(importSessionAssignments(database, csv, "keep-existing"), {
    matchedCount: 3,
    updatedCount: 0,
    assignedCount: 0,
    clearedCount: 0,
    preservedCount: 3,
    unchangedCount: 0,
    durationMismatchCount: 1,
  });
  assert.deepEqual(
    database.prepare("SELECT id, teacher_id AS teacherId, duration FROM sessions ORDER BY id").all().map((row) => ({ ...row })),
    [
      { id: 10, teacherId: 1, duration: 180 },
      { id: 20, teacherId: 2, duration: 180 },
      { id: 30, teacherId: 1, duration: 120 },
    ],
  );

  assert.deepEqual(importSessionAssignments(database, csv, "overwrite-existing"), {
    matchedCount: 3,
    updatedCount: 2,
    assignedCount: 1,
    clearedCount: 1,
    preservedCount: 0,
    unchangedCount: 1,
    durationMismatchCount: 1,
  });
  assert.deepEqual(
    database.prepare("SELECT id, teacher_id AS teacherId, duration FROM sessions ORDER BY id").all().map((row) => ({ ...row })),
    [
      { id: 10, teacherId: 2, duration: 180 },
      { id: 20, teacherId: null, duration: 180 },
      { id: 30, teacherId: 1, duration: 120 },
    ],
  );
});

test("reports invalid rows, missing sessions and unknown teachers without changing data", () => {
  const database = assignmentDatabase();
  const problematicCsv = `codigo,fecha,hora_ini,duracion,siglas
30013,2026-09-14,10:00,180,NO-EXISTE
30013,fecha-mala,10:00,180,JBA
99999,2026-09-15,09:00,120,
`;
  const preview = previewSessionAssignments(database, problematicCsv);
  assert.equal(preview.totalRows, 3);
  assert.equal(preview.matchedCount, 1);
  assert.equal(preview.invalidCount, 1);
  assert.equal(preview.unmatchedCount, 1);
  assert.deepEqual(preview.unknownTeacherCodes, ["NO-EXISTE"]);
  assert.throws(
    () => importSessionAssignments(database, problematicCsv, "overwrite-existing"),
    /datos no válidos/,
  );
  assert.equal(database.prepare("SELECT teacher_id AS teacherId FROM sessions WHERE id = 10").get().teacherId, 1);
});
