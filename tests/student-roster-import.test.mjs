import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { importStudentRoster, previewStudentRoster } from "../lib/studentRosterImport.ts";

function rosterDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE subjects (id INTEGER PRIMARY KEY, code TEXT NOT NULL);
    CREATE TABLE subject_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      semester_id TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      UNIQUE (subject_id, semester_id, email)
    );
    CREATE TABLE student_subgroups (
      student_id INTEGER NOT NULL REFERENCES subject_students(id) ON DELETE CASCADE,
      group_code TEXT NOT NULL,
      group_label TEXT NOT NULL,
      PRIMARY KEY (student_id, group_code)
    );
    INSERT INTO subjects (id, code) VALUES (1, '30013');
    INSERT INTO subject_students
      (subject_id, semester_id, first_name, last_name, email)
    VALUES
      (1, '2026-27 S1', 'Anterior', 'Alumno', 'anterior@unizar.es'),
      (1, '2026-27 S2', 'Segundo', 'Semestre', 'segundo@unizar.es');
  `);
  return database;
}

const csv = `\uFEFFNombre,Apellido(s),"Dirección de correo",Grupos
Lorena,"Abad Sanz",924740@unizar.es,"G32 - Lunes-B 11:00-13:00"
Clara,"Agustín Sanz",868411@unizar.es,
Alumno,"Un grupo",999999@unizar.es,"G22 - Martes-B 09:00-11:00"
`;

test("previews and imports a semester student roster with zero or one subgroup per student", () => {
  const database = rosterDatabase();
  const preview = previewStudentRoster(database, 1, "2026-27 S1", csv);
  assert.equal(preview.totalRows, 3);
  assert.equal(preview.studentCount, 3);
  assert.equal(preview.assignedStudentCount, 2);
  assert.equal(preview.unassignedStudentCount, 1);
  assert.equal(preview.subgroupCount, 2);
  assert.equal(preview.existingStudentCount, 1);
  assert.deepEqual(preview.subgroups.map(({ code, studentCount }) => ({ code, studentCount })), [
    { code: "22", studentCount: 1 },
    { code: "32", studentCount: 1 },
  ]);

  const result = importStudentRoster(database, 1, "2026-27 S1", csv);
  assert.equal(result.replacedStudentCount, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM subject_students WHERE subject_id = 1 AND semester_id = '2026-27 S1'").get().total, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM student_subgroups").get().total, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM subject_students WHERE semester_id = '2026-27 S2'").get().total, 1);
});

test("rejects a student assigned to more than one subgroup without replacing the roster", () => {
  const database = rosterDatabase();
  const invalidCsv = `Nombre,Apellido(s),Dirección de correo,Grupos
Ángel,Luesma Larrosa,948909@unizar.es,"G22 - Martes-B 09:00-11:00, G23 - Jueves-A 15:00-17:00"
`;
  const preview = previewStudentRoster(database, 1, "2026-27 S1", invalidCsv);
  assert.equal(preview.studentCount, 0);
  assert.equal(preview.invalidCount, 1);
  assert.match(preview.invalidRows[0].message, /solo puede pertenecer a un subgrupo/i);
  assert.throws(() => importStudentRoster(database, 1, "2026-27 S1", invalidCsv), /filas no válidas/);
  assert.equal(database.prepare("SELECT first_name AS firstName FROM subject_students WHERE semester_id = '2026-27 S1'").get().firstName, "Anterior");
});

test("rejects malformed rows without replacing an existing roster", () => {
  const database = rosterDatabase();
  const invalidCsv = `Nombre,Apellido(s),Dirección de correo,Grupos
Ana,Alumno,correo-invalido,G11 - Martes-A 15:00-17:00
`;
  const preview = previewStudentRoster(database, 1, "2026-27 S1", invalidCsv);
  assert.equal(preview.invalidCount, 1);
  assert.throws(() => importStudentRoster(database, 1, "2026-27 S1", invalidCsv), /filas no válidas/);
  assert.equal(database.prepare("SELECT first_name AS firstName FROM subject_students WHERE semester_id = '2026-27 S1'").get().firstName, "Anterior");
});
