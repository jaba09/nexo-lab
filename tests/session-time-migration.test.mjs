import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  migrateRequested29716SessionDurations,
  migrateRequestedSessionTimes,
  migrateRequestedStudent901606ToG33,
} from "../lib/database.ts";

test("adjusts only the requested subject session times", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE subjects (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      subject_id INTEGER NOT NULL
    );
    INSERT INTO subjects (id, code) VALUES (1, '30013'), (2, '30018'), (3, '30019');
    INSERT INTO sessions (id, start_time, duration, subject_id) VALUES
      (1, '08:00', 120, 1),
      (2, '11:00', 180, 1),
      (3, '08:00', 180, 2),
      (4, '11:00', 180, 2),
      (5, '15:00', 120, 2),
      (6, '08:00', 180, 3);
  `);

  migrateRequestedSessionTimes(database);

  const migratedSessions = database
    .prepare("SELECT id, start_time AS startTime, duration FROM sessions ORDER BY id")
    .all()
    .map((session) => ({ ...session }));
  assert.deepEqual(
    migratedSessions,
    [
      { id: 1, startTime: "09:00", duration: 120 },
      { id: 2, startTime: "11:00", duration: 180 },
      { id: 3, startTime: "09:00", duration: 120 },
      { id: 4, startTime: "11:00", duration: 120 },
      { id: 5, startTime: "15:00", duration: 120 },
      { id: 6, startTime: "08:00", duration: 180 },
    ],
  );
  assert.equal(
    database.prepare("SELECT value FROM app_meta WHERE key = 'requested_session_times_30013_30018_version'").get().value,
    "1",
  );

  database.prepare("UPDATE sessions SET start_time = '08:00', duration = 180 WHERE id = 3").run();
  migrateRequestedSessionTimes(database);
  assert.deepEqual(
    { ...database.prepare("SELECT start_time AS startTime, duration FROM sessions WHERE id = 3").get() },
    { startTime: "08:00", duration: 180 },
  );
});

test("reduces only 180-minute sessions for subject 29716", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE subjects (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE);
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      subject_id INTEGER NOT NULL
    );
    INSERT INTO subjects (id, code) VALUES (1, '29716'), (2, '29717');
    INSERT INTO sessions (id, start_time, duration, subject_id) VALUES
      (1, '08:00', 180, 1),
      (2, '11:00', 120, 1),
      (3, '08:00', 180, 2);
  `);

  migrateRequested29716SessionDurations(database);

  assert.deepEqual(
    database.prepare("SELECT id, duration FROM sessions ORDER BY id").all().map((session) => ({ ...session })),
    [
      { id: 1, duration: 120 },
      { id: 2, duration: 120 },
      { id: 3, duration: 180 },
    ],
  );
  assert.equal(
    database.prepare("SELECT value FROM app_meta WHERE key = 'requested_session_duration_29716_version'").get().value,
    "1",
  );

  database.prepare("UPDATE sessions SET duration = 180 WHERE id = 1").run();
  migrateRequested29716SessionDurations(database);
  assert.equal(database.prepare("SELECT duration FROM sessions WHERE id = 1").get().duration, 180);
});

test("moves only student 901606 from G31 to the matching G33 subgroup", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE subject_students (
      id INTEGER PRIMARY KEY,
      subject_id INTEGER NOT NULL,
      semester_id TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      roster_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE student_subgroups (
      student_id INTEGER NOT NULL,
      group_code TEXT NOT NULL,
      group_label TEXT NOT NULL,
      PRIMARY KEY (student_id, group_code)
    );
    INSERT INTO subject_students (id, subject_id, semester_id, email, roster_active) VALUES
      (1, 10, '2026-27 S1', '901606@unizar.es', 1),
      (2, 10, '2026-27 S1', 'otro@unizar.es', 1),
      (3, 10, '2026-27 S1', 'referencia@unizar.es', 1),
      (4, 11, '2026-27 S1', '901606@unizar.es', 1);
    INSERT INTO student_subgroups (student_id, group_code, group_label) VALUES
      (1, '31', 'G31 - Miércoles 09:00-11:00'),
      (2, '31', 'G31 - Miércoles 09:00-11:00'),
      (3, '33', 'G33 - Viernes 11:00-13:00'),
      (4, '11', 'G11 - Martes 15:00-17:00');
  `);

  migrateRequestedStudent901606ToG33(database);

  assert.deepEqual(
    database.prepare(`SELECT student_id AS studentId, group_code AS groupCode, group_label AS groupLabel
      FROM student_subgroups ORDER BY student_id`).all().map((row) => ({ ...row })),
    [
      { studentId: 1, groupCode: "33", groupLabel: "G33 - Viernes 11:00-13:00" },
      { studentId: 2, groupCode: "31", groupLabel: "G31 - Miércoles 09:00-11:00" },
      { studentId: 3, groupCode: "33", groupLabel: "G33 - Viernes 11:00-13:00" },
      { studentId: 4, groupCode: "11", groupLabel: "G11 - Martes 15:00-17:00" },
    ],
  );
  assert.equal(
    database.prepare("SELECT value FROM app_meta WHERE key = 'requested_student_901606_subgroup_g33_version'").get().value,
    "1",
  );

  database.prepare("UPDATE student_subgroups SET group_code = '31', group_label = 'G31' WHERE student_id = 1").run();
  migrateRequestedStudent901606ToG33(database);
  assert.equal(database.prepare("SELECT group_code AS groupCode FROM student_subgroups WHERE student_id = 1").get().groupCode, "31");
});
