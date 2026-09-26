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

test("recognizes Moodle course groups and compact laboratory subgroup names", () => {
  const database = rosterDatabase();
  const moodleCsv = `\uFEFFNombre,Apellido(s),"Dirección de correo",Grupos
Ana,Uno,ana@unizar.es,"Grupo 531, mif11 Xa 9-11h"
Beto,Dos,beto@unizar.es,mif12 Xb 9-11h
Carla,Tres,carla@unizar.es,Grupo 532
Diego,Cuatro,diego@unizar.es,
`;

  const preview = previewStudentRoster(database, 1, "2026-27 S1", moodleCsv);
  assert.equal(preview.invalidCount, 0);
  assert.equal(preview.studentCount, 4);
  assert.equal(preview.assignedStudentCount, 2);
  assert.equal(preview.unassignedStudentCount, 2);
  assert.deepEqual(preview.subgroups, [
    { code: "11", label: "G11 - Xa 9-11h", studentCount: 1 },
    { code: "12", label: "G12 - Xb 9-11h", studentCount: 1 },
  ]);
});

test("rejects more than one compact laboratory subgroup while ignoring the course group", () => {
  const database = rosterDatabase();
  const invalidCsv = `Nombre,Apellido(s),Dirección de correo,Grupos
Ángel,Luesma Larrosa,948909@unizar.es,"Grupo 531, mif25 Ja 11-13h, mif35 Ma 16-18h"
`;

  const preview = previewStudentRoster(database, 1, "2026-27 S1", invalidCsv);
  assert.equal(preview.studentCount, 0);
  assert.equal(preview.invalidCount, 1);
  assert.match(preview.invalidRows[0].message, /solo puede pertenecer a un subgrupo/i);
});

test("does not replace the roster when every student row is invalid", () => {
  const database = rosterDatabase();
  const invalidCsv = `Nombre,Apellido(s),Dirección de correo,Grupos
Ángel,Luesma Larrosa,948909@unizar.es,"G22 - Martes-B 09:00-11:00, G23 - Jueves-A 15:00-17:00"
`;
  const preview = previewStudentRoster(database, 1, "2026-27 S1", invalidCsv);
  assert.equal(preview.studentCount, 0);
  assert.equal(preview.invalidCount, 1);
  assert.match(preview.invalidRows[0].message, /solo puede pertenecer a un subgrupo/i);
  assert.throws(() => importStudentRoster(database, 1, "2026-27 S1", invalidCsv), /no contiene alumnos/);
  assert.equal(database.prepare("SELECT first_name AS firstName FROM subject_students WHERE semester_id = '2026-27 S1'").get().firstName, "Anterior");
});

test("does not replace the roster when every row is malformed", () => {
  const database = rosterDatabase();
  const invalidCsv = `Nombre,Apellido(s),Dirección de correo,Grupos
Ana,Alumno,correo-invalido,G11 - Martes-A 15:00-17:00
`;
  const preview = previewStudentRoster(database, 1, "2026-27 S1", invalidCsv);
  assert.equal(preview.invalidCount, 1);
  assert.throws(() => importStudentRoster(database, 1, "2026-27 S1", invalidCsv), /no contiene alumnos/);
  assert.equal(database.prepare("SELECT first_name AS firstName FROM subject_students WHERE semester_id = '2026-27 S1'").get().firstName, "Anterior");
});

test("imports valid students and reports the invalid rows it ignored", () => {
  const database = rosterDatabase();
  const mixedCsv = `Nombre,Apellido(s),Dirección de correo,Grupos
Ana,Correcta,ana@unizar.es,"Grupo 531, mif11 Xa 9-11h"
Ángel,Doble,angel@unizar.es,"Grupo 531, mif25 Ja 11-13h, mif35 Ma 16-18h"
Beto,Correcto,beto@unizar.es,Grupo 532
`;

  const result = importStudentRoster(database, 1, "2026-27 S1", mixedCsv);
  assert.equal(result.totalRows, 3);
  assert.equal(result.studentCount, 2);
  assert.equal(result.invalidCount, 1);
  assert.equal(result.invalidRows[0].rowNumber, 3);
  assert.equal(result.replacedStudentCount, 1);
  assert.deepEqual(
    database.prepare("SELECT email FROM subject_students WHERE semester_id = '2026-27 S1' ORDER BY email").all().map((row) => row.email),
    ["ana@unizar.es", "beto@unizar.es"],
  );
});
