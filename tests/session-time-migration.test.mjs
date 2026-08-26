import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { migrateRequestedSessionTimes } from "../lib/database.ts";

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
