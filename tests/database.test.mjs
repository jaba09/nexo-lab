import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("creates the independent SQLite database with the migrated hierarchy", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "nexo-lab-db-"));
  process.env.NEXO_LAB_DB_PATH = join(temporaryDirectory, "nexo-lab.sqlite");
  process.env.NEXO_LAB_BOOTSTRAP_EMAIL = "elena.martin@example.test";

  const { getDatabase, getDatabasePath } = await import(`../lib/database.ts?test=${Date.now()}`);
  const database = getDatabase();

  assert.equal(getDatabasePath(), process.env.NEXO_LAB_DB_PATH);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM laboratories").get().total, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM installations").get().total, 4);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM practices").get().total, 5);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM practice_installations").get().total, 5);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM degrees").get().total, 3);
  assert.ok(database.prepare("PRAGMA table_info(degrees)").all().some((column) => column.name === "ics_code"));
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM degrees WHERE ics_code = ''").get().total, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM subjects").get().total, 4);
  const subjectColumns = database.prepare("PRAGMA table_info(subjects)").all();
  assert.equal(subjectColumns.find((column) => column.name === "abbreviation").notnull, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM subjects WHERE abbreviation = ''").get().total, 4);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM subject_practices").get().total, 8);
  const subjectPracticeColumns = database.prepare("PRAGMA table_info(subject_practices)").all();
  assert.equal(subjectPracticeColumns.find((column) => column.name === "position").notnull, 1);
  assert.deepEqual(
    database.prepare("SELECT practice_id AS practiceId, position FROM subject_practices WHERE subject_id = 1 ORDER BY position").all().map((row) => ({ ...row })),
    [{ practiceId: 1, position: 1 }, { practiceId: 5, position: 2 }],
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM subject_editors").get().total, 0);
  database.prepare("INSERT INTO subject_editors (subject_id, teacher_id) VALUES (?, ?)").run(1, 2);
  const subjectEditor = database.prepare("SELECT subject_id AS subjectId, teacher_id AS teacherId FROM subject_editors").get();
  assert.equal(subjectEditor.subjectId, 1);
  assert.equal(subjectEditor.teacherId, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM teachers").get().total, 3);
  const teacherColumns = database.prepare("PRAGMA table_info(teachers)").all();
  assert.equal(teacherColumns.find((column) => column.name === "email").notnull, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM teachers WHERE email = ''").get().total, 0);
  assert.equal(teacherColumns.find((column) => column.name === "password_hash").notnull, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM teachers WHERE password_hash = ''").get().total, 3);
  assert.equal(teacherColumns.find((column) => column.name === "is_admin").notnull, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM teachers WHERE is_admin = 1").get().total, 1);
  assert.equal(database.prepare("SELECT is_admin AS isAdmin FROM teachers WHERE email = ?").get("elena.martin@example.test").isAdmin, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auth_sessions").get().total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM password_reset_tokens").get().total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM sessions").get().total, 4);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM holidays").get().total, 0);
  const holidayColumns = database.prepare("PRAGMA table_info(holidays)").all();
  assert.ok(holidayColumns.some((column) => column.name === "holiday_date"));
  assert.ok(holidayColumns.some((column) => column.name === "source_uid"));
  const holidayTriggers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'prevent_session_on_holiday_%'").all();
  assert.equal(holidayTriggers.length, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM academic_day_types").get().total, 120);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM academic_day_types WHERE day_type = 'A'").get().total, 60);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM academic_day_types WHERE day_type = 'B'").get().total, 60);
  assert.equal(database.prepare("SELECT day_type AS dayType FROM academic_day_types WHERE day_date = ?").get("2026-09-17").dayType, "A");
  assert.equal(database.prepare("SELECT day_type AS dayType FROM academic_day_types WHERE day_date = ?").get("2026-09-24").dayType, "B");
  assert.equal(database.prepare("SELECT day_type AS dayType FROM academic_day_types WHERE day_date = ?").get("2026-12-09").dayType, "A");
  assert.equal(database.prepare("SELECT day_type AS dayType FROM academic_day_types WHERE day_date = ?").get("2027-03-08").dayType, "A");
  assert.equal(database.prepare("SELECT day_type AS dayType FROM academic_day_types WHERE day_date = ?").get("2027-03-09").dayType, "B");
  assert.equal(database.prepare("SELECT day_type AS dayType FROM academic_day_types WHERE day_date = ?").get("2027-04-19").dayType, "B");
  assert.equal(database.prepare("SELECT day_type AS dayType FROM academic_day_types WHERE day_date = ?").get("2026-10-15"), undefined);
  assert.equal(database.prepare("SELECT day_type AS dayType FROM academic_day_types WHERE day_date = ?").get("2027-05-04"), undefined);
  assert.equal(database.prepare("SELECT value FROM app_meta WHERE key = ?").get("academic_day_types_correction_version").value, "2027-03-08-is-A");
  const sessionColumns = database.prepare("PRAGMA table_info(sessions)").all();
  assert.ok(sessionColumns.some((column) => column.name === "source_uid"));
  assert.ok(sessionColumns.some((column) => column.name === "subject_code"));
  assert.ok(sessionColumns.some((column) => column.name === "group_code"));
  assert.ok(sessionColumns.some((column) => column.name === "subject_id"));
  assert.equal(sessionColumns.find((column) => column.name === "teacher_id").notnull, 0);
  assert.ok(!sessionColumns.some((column) => column.name === "degree_id"));
  assert.equal(sessionColumns.find((column) => column.name === "practice_id").notnull, 0);
  const practiceColumns = database.prepare("PRAGMA table_info(practices)").all();
  assert.ok(!practiceColumns.some((column) => column.name === "installation_id"));
  database.prepare("INSERT INTO practice_installations (practice_id, installation_id) VALUES (?, ?)").run(1, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM practice_installations WHERE practice_id = 1").get().total, 2);
  const incompleteSession = database.prepare(`INSERT INTO sessions
    (session_date, start_time, duration, subject_id, teacher_id, source_uid, subject_code, group_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run("2099-01-01", "09:00", 180, 1, 1, "incomplete-test", "30013", "17");
  assert.equal(incompleteSession.changes, 1);
  assert.equal(database.prepare("SELECT practice_id AS practiceId FROM sessions WHERE source_uid = ?").get("incomplete-test").practiceId, null);
  const unassignedTeacherSession = database.prepare(`INSERT INTO sessions
    (session_date, start_time, duration, subject_id, teacher_id, source_uid, subject_code, group_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run("2099-01-02", "09:00", 180, 1, null, "unassigned-teacher-test", "30013", "18");
  assert.equal(unassignedTeacherSession.changes, 1);
  assert.equal(database.prepare("SELECT teacher_id AS teacherId FROM sessions WHERE source_uid = ?").get("unassigned-teacher-test").teacherId, null);
  assert.throws(
    () => database.prepare("INSERT INTO sessions (session_date, start_time, duration, subject_id, teacher_id, practice_id) VALUES (?, ?, ?, ?, ?, ?)").run("2099-01-01", "10:00", 60, 3, 1, 2),
    /FOREIGN KEY constraint failed/,
  );
});
