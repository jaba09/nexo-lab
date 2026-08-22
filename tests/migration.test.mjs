import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("migrates degree-practice relations to subjects without losing sessions", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "nexo-lab-migration-"));
  const databasePath = join(temporaryDirectory, "legacy.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE degrees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      level TEXT NOT NULL,
      academic_year INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE laboratories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      manager TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      laboratory_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE practices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      installation_id INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE degree_practices (
      degree_id INTEGER NOT NULL,
      practice_id INTEGER NOT NULL,
      PRIMARY KEY (degree_id, practice_id)
    );
    CREATE TABLE subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      degree_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      degree_id INTEGER NOT NULL,
      practice_id INTEGER NOT NULL,
      source_uid TEXT,
      subject_code TEXT,
      group_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (degree_id, practice_id) REFERENCES degree_practices(degree_id, practice_id) ON DELETE RESTRICT
    );
    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO degrees (id, code, name, level, academic_year) VALUES (1, '300', 'Grado heredado', 'Grado', 1);
    INSERT INTO laboratories (id, code, name, location, manager)
      VALUES (1, 'LAB-LEG', 'Laboratorio heredado', 'Pruebas', 'Coordinación');
    INSERT INTO installations (id, code, name, laboratory_id, category, capacity, status)
      VALUES (1, 'INS-LEG', 'Instalación heredada', 1, 'Docente', 20, 'Operativa');
    INSERT INTO practices (id, code, name, installation_id, duration, risk_level)
      VALUES (1, 'PRA-01', 'Práctica heredada', 1, 180, 'Bajo');
    INSERT INTO degree_practices (degree_id, practice_id) VALUES (1, 1);
    INSERT INTO sessions (id, session_date, start_time, duration, degree_id, practice_id)
      VALUES (7, '2026-09-30', '11:00', 180, 1, 1);
    INSERT INTO app_meta (key, value) VALUES ('seed_version', 'standalone-v1'), ('sessions_seed_version', '1');
  `);
  legacy.close();

  process.env.NEXO_LAB_DB_PATH = databasePath;
  const { getDatabase } = await import(`../lib/database.ts?migration=${Date.now()}`);
  const database = getDatabase();
  const sessionColumns = database.prepare("PRAGMA table_info(sessions)").all();
  const practiceColumn = sessionColumns.find((column) => column.name === "practice_id");

  assert.equal(practiceColumn.notnull, 0);
  assert.ok(database.prepare("PRAGMA table_info(degrees)").all().some((column) => column.name === "ics_code"));
  assert.equal(database.prepare("SELECT ics_code AS icsCode FROM degrees WHERE id = 1").get().icsCode, "");
  assert.ok(sessionColumns.some((column) => column.name === "subject_id"));
  assert.equal(sessionColumns.find((column) => column.name === "teacher_id").notnull, 0);
  assert.ok(!sessionColumns.some((column) => column.name === "degree_id"));
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM subjects").get().total, 1);
  assert.ok(database.prepare("PRAGMA table_info(subjects)").all().some((column) => column.name === "abbreviation"));
  assert.equal(database.prepare("SELECT abbreviation FROM subjects").get().abbreviation, "");
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM practice_installations").get().total, 1);
  const preservedInstallationRelation = database.prepare(
    "SELECT practice_id AS practiceId, installation_id AS installationId FROM practice_installations",
  ).get();
  assert.equal(preservedInstallationRelation.practiceId, 1);
  assert.equal(preservedInstallationRelation.installationId, 1);
  assert.ok(!database.prepare("PRAGMA table_info(practices)").all().some((column) => column.name === "installation_id"));
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM teachers").get().total, 1);
  assert.ok(database.prepare("PRAGMA table_info(teachers)").all().some((column) => column.name === "email"));
  assert.equal(database.prepare("SELECT email FROM teachers").get().email, "");
  assert.ok(database.prepare("PRAGMA table_info(teachers)").all().some((column) => column.name === "password_hash"));
  assert.equal(database.prepare("SELECT password_hash AS passwordHash FROM teachers").get().passwordHash, "");
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM auth_sessions").get().total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM subject_practices").get().total, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM holidays").get().total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'degree_practices'").get().total, 0);
  const preservedSession = database.prepare("SELECT id, subject_id AS subjectId, teacher_id AS teacherId, practice_id AS practiceId FROM sessions WHERE id = 7").get();
  assert.equal(preservedSession.id, 7);
  assert.ok(preservedSession.subjectId);
  assert.ok(preservedSession.teacherId);
  assert.equal(preservedSession.practiceId, 1);
  const result = database.prepare(`INSERT INTO sessions
    (session_date, start_time, duration, subject_id, teacher_id, source_uid)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).run("2026-10-01", "11:00", 180, preservedSession.subjectId, preservedSession.teacherId, "legacy-incomplete");
  assert.equal(result.changes, 1);
  const unassignedTeacherResult = database.prepare(`INSERT INTO sessions
    (session_date, start_time, duration, subject_id, teacher_id, source_uid)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).run("2026-10-02", "11:00", 180, preservedSession.subjectId, null, "legacy-unassigned-teacher");
  assert.equal(unassignedTeacherResult.changes, 1);
});
