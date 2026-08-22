import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS laboratories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    manager TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS installations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE RESTRICT,
    category TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'Operativa',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS practices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    duration INTEGER NOT NULL CHECK (duration > 0),
    risk_level TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS practice_installations (
    practice_id INTEGER NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
    PRIMARY KEY (practice_id, installation_id)
  )`,
  `CREATE TABLE IF NOT EXISTS degrees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    ics_code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    academic_year INTEGER NOT NULL CHECK (academic_year BETWEEN 1 AND 8),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    abbreviation TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    degree_id INTEGER NOT NULL REFERENCES degrees(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS subject_practices (
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    practice_id INTEGER NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
    PRIMARY KEY (subject_id, practice_id)
  )`,
  `CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    duration INTEGER NOT NULL CHECK (duration > 0),
    subject_id INTEGER NOT NULL,
    teacher_id INTEGER,
    practice_id INTEGER,
    source_uid TEXT,
    subject_code TEXT,
    group_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT,
    FOREIGN KEY (subject_id, practice_id)
      REFERENCES subject_practices(subject_id, practice_id)
      ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holiday_date TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'Día festivo',
    source_uid TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_installations_laboratory_id ON installations(laboratory_id)",
  "CREATE INDEX IF NOT EXISTS idx_subjects_degree_id ON subjects(degree_id)",
  "CREATE INDEX IF NOT EXISTS idx_subject_practices_practice_id ON subject_practices(practice_id)",
];

const seedStatements = [
  `INSERT INTO laboratories (id, code, name, location, manager) VALUES
    (1, 'LAB-01', 'Ciencias de los Materiales', 'Edificio Norte · Planta 2', 'Dra. Elena Martín'),
    (2, 'LAB-02', 'Automática y Control', 'Edificio Este · Planta 1', 'Dr. Sergio Lozano'),
    (3, 'LAB-03', 'Energía y Fluidos', 'Nave Tecnológica · Módulo B', 'Dra. Ana Beltrán')`,
  `INSERT INTO installations (id, code, name, laboratory_id, category, capacity, status) VALUES
    (1, 'INS-01', 'Banco de ensayos universal', 1, 'Instrumentación', 18, 'Operativa'),
    (2, 'INS-02', 'Célula de fabricación aditiva', 1, 'Fabricación', 12, 'Mantenimiento'),
    (3, 'INS-03', 'Planta de control de procesos', 2, 'Docente', 24, 'Operativa'),
    (4, 'INS-04', 'Túnel de viento subsónico', 3, 'Simulación', 16, 'Operativa')`,
  `INSERT INTO practices (id, code, name, duration, risk_level) VALUES
    (1, 'PRA-01', 'Ensayo de tracción y límite elástico', 120, 'Medio'),
    (2, 'PRA-02', 'Caracterización de probetas impresas', 150, 'Bajo'),
    (3, 'PRA-03', 'Sintonía de un controlador PID', 120, 'Bajo'),
    (4, 'PRA-04', 'Respuesta dinámica de un proceso', 90, 'Bajo'),
    (5, 'PRA-05', 'Medición de perfiles aerodinámicos', 180, 'Medio')`,
  `INSERT INTO practice_installations (practice_id, installation_id) VALUES
    (1, 1), (2, 2), (3, 3), (4, 3), (5, 4)`,
  `INSERT INTO degrees (id, code, name, level, academic_year) VALUES
    (1, 'GRA-01', 'Ingeniería Mecánica', 'Grado', 2),
    (2, 'GRA-02', 'Ingeniería Electrónica y Automática', 'Grado', 3),
    (3, 'GRA-03', 'Tecnologías Industriales', 'Grado', 2)`,
  `INSERT INTO subjects (id, code, name, degree_id) VALUES
    (1, 'ASI-01', 'Mecánica de materiales', 1),
    (2, 'ASI-02', 'Fabricación aditiva', 1),
    (3, 'ASI-03', 'Control automático', 2),
    (4, 'ASI-04', 'Ingeniería industrial integrada', 3)`,
  `INSERT INTO subject_practices (subject_id, practice_id) VALUES
    (1, 1), (1, 5),
    (2, 2),
    (3, 3), (3, 4),
    (4, 1), (4, 3), (4, 5)`,
  `INSERT INTO teachers (id, code, name, email) VALUES
    (1, 'PRO-01', 'Dra. Elena Martín', 'elena.martin@example.test'),
    (2, 'PRO-02', 'Dr. Sergio Lozano', 'sergio.lozano@example.test'),
    (3, 'PRO-03', 'Dra. Ana Beltrán', 'ana.beltran@example.test')`,
  "INSERT INTO app_meta (key, value) VALUES ('seed_version', 'standalone-v2-subjects')",
];

const sessionSeedStatements = [
  `INSERT INTO sessions (session_date, start_time, duration, subject_id, teacher_id, practice_id)
    SELECT date('now', 'start of month', '+2 days'), '09:00', 120, 1, 1, 1
    WHERE EXISTS (SELECT 1 FROM subject_practices WHERE subject_id = 1 AND practice_id = 1)`,
  `INSERT INTO sessions (session_date, start_time, duration, subject_id, teacher_id, practice_id)
    SELECT date('now', 'start of month', '+5 days'), '11:30', 150, 2, 2, 2
    WHERE EXISTS (SELECT 1 FROM subject_practices WHERE subject_id = 2 AND practice_id = 2)`,
  `INSERT INTO sessions (session_date, start_time, duration, subject_id, teacher_id, practice_id)
    SELECT date('now', 'start of month', '+9 days'), '08:30', 120, 3, 2, 3
    WHERE EXISTS (SELECT 1 FROM subject_practices WHERE subject_id = 3 AND practice_id = 3)`,
  `INSERT INTO sessions (session_date, start_time, duration, subject_id, teacher_id, practice_id)
    SELECT date('now', 'start of month', '+14 days'), '15:00', 180, 4, 3, 5
    WHERE EXISTS (SELECT 1 FROM subject_practices WHERE subject_id = 4 AND practice_id = 5)`,
  "INSERT INTO app_meta (key, value) VALUES ('sessions_seed_version', '1')",
];

const globalDatabase = globalThis as typeof globalThis & {
  nexoLabDatabase?: DatabaseSync;
};

function resolveDatabasePath() {
  const configuredPath = process.env.NEXO_LAB_DB_PATH?.trim();
  if (!configuredPath) return join(process.cwd(), "data", "nexo-lab.sqlite");
  if (!isAbsolute(configuredPath)) {
    throw new Error("NEXO_LAB_DB_PATH debe ser una ruta absoluta.");
  }
  return configuredPath;
}

function tableExists(database: DatabaseSync, table: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function migratePracticeInstallations(database: DatabaseSync) {
  const practiceColumns = database.prepare("PRAGMA table_info(practices)").all() as { name: string }[];
  if (!practiceColumns.some((column) => column.name === "installation_id")) return;

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`INSERT OR IGNORE INTO practice_installations (practice_id, installation_id)
      SELECT id, installation_id FROM practices`);
    database.exec(`CREATE TABLE practices_multiple_installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      duration INTEGER NOT NULL CHECK (duration > 0),
      risk_level TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    database.exec(`INSERT INTO practices_multiple_installations
      (id, code, name, duration, risk_level, created_at)
      SELECT id, code, name, duration, risk_level, created_at FROM practices`);
    database.exec("DROP TABLE practices");
    database.exec("ALTER TABLE practices_multiple_installations RENAME TO practices");
    database.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run("practice_installations_migration_version", "1");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateDegreePractices(database: DatabaseSync) {
  const sessionColumns = database.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  if (sessionColumns.some((column) => column.name === "subject_id")) return;

  const hasDegreePractices = tableExists(database, "degree_practices");
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`INSERT INTO subjects (code, name, degree_id)
      SELECT 'MIG-' || d.id, 'Asignatura general · ' || d.name, d.id
      FROM degrees d
      WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.degree_id = d.id)`);
    if (hasDegreePractices) {
      database.exec(`INSERT OR IGNORE INTO subject_practices (subject_id, practice_id)
        SELECT s.id, dp.practice_id
        FROM degree_practices dp
        JOIN subjects s ON s.degree_id = dp.degree_id
        WHERE s.id = (SELECT MIN(s2.id) FROM subjects s2 WHERE s2.degree_id = dp.degree_id)`);
    }
    database.exec(`CREATE TABLE sessions_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL CHECK (duration > 0),
      subject_id INTEGER NOT NULL,
      practice_id INTEGER,
      source_uid TEXT,
      subject_code TEXT,
      group_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
      FOREIGN KEY (subject_id, practice_id)
        REFERENCES subject_practices(subject_id, practice_id)
        ON DELETE RESTRICT
    )`);
    database.exec(`INSERT INTO sessions_next
      (id, session_date, start_time, duration, subject_id, practice_id, source_uid, subject_code, group_code, created_at)
      SELECT se.id, se.session_date, se.start_time, se.duration,
        (SELECT MIN(s.id) FROM subjects s WHERE s.degree_id = se.degree_id),
        se.practice_id, se.source_uid, se.subject_code, se.group_code, se.created_at
      FROM sessions se`);
    database.exec("DROP TABLE sessions");
    database.exec("ALTER TABLE sessions_next RENAME TO sessions");
    if (hasDegreePractices) database.exec("DROP TABLE degree_practices");
    database.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run("subjects_migration_version", "1");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateSessionTeachers(database: DatabaseSync) {
  const sessionColumns = database.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  if (sessionColumns.some((column) => column.name === "teacher_id")) return;

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`INSERT INTO teachers (code, name)
      SELECT 'PRO-MIG', 'Profesor inicial'
      WHERE NOT EXISTS (SELECT 1 FROM teachers)`);
    database.exec(`CREATE TABLE sessions_with_teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL CHECK (duration > 0),
      subject_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      practice_id INTEGER,
      source_uid TEXT,
      subject_code TEXT,
      group_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT,
      FOREIGN KEY (subject_id, practice_id)
        REFERENCES subject_practices(subject_id, practice_id)
        ON DELETE RESTRICT
    )`);
    database.exec(`INSERT INTO sessions_with_teachers
      (id, session_date, start_time, duration, subject_id, teacher_id, practice_id, source_uid, subject_code, group_code, created_at)
      SELECT id, session_date, start_time, duration, subject_id,
        (SELECT MIN(id) FROM teachers), practice_id, source_uid, subject_code, group_code, created_at
      FROM sessions`);
    database.exec("DROP TABLE sessions");
    database.exec("ALTER TABLE sessions_with_teachers RENAME TO sessions");
    database.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run("teachers_migration_version", "1");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateNullableSessionTeachers(database: DatabaseSync) {
  const sessionColumns = database.prepare("PRAGMA table_info(sessions)").all() as { name: string; notnull: number }[];
  const teacherColumn = sessionColumns.find((column) => column.name === "teacher_id");
  if (!teacherColumn?.notnull) return;

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`CREATE TABLE sessions_nullable_teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL CHECK (duration > 0),
      subject_id INTEGER NOT NULL,
      teacher_id INTEGER,
      practice_id INTEGER,
      source_uid TEXT,
      subject_code TEXT,
      group_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT,
      FOREIGN KEY (subject_id, practice_id)
        REFERENCES subject_practices(subject_id, practice_id)
        ON DELETE RESTRICT
    )`);
    database.exec(`INSERT INTO sessions_nullable_teachers
      (id, session_date, start_time, duration, subject_id, teacher_id, practice_id, source_uid, subject_code, group_code, created_at)
      SELECT id, session_date, start_time, duration, subject_id, teacher_id, practice_id, source_uid, subject_code, group_code, created_at
      FROM sessions`);
    database.exec("DROP TABLE sessions");
    database.exec("ALTER TABLE sessions_nullable_teachers RENAME TO sessions");
    database.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run("nullable_session_teachers_migration_version", "1");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

function initializeDatabase(database: DatabaseSync) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");
  for (const statement of schemaStatements) database.exec(statement);

  const sessionColumnInfo = database.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  const sessionColumns = new Set(sessionColumnInfo.map((column) => column.name));
  if (!sessionColumns.has("source_uid")) database.exec("ALTER TABLE sessions ADD COLUMN source_uid TEXT");
  if (!sessionColumns.has("subject_code")) database.exec("ALTER TABLE sessions ADD COLUMN subject_code TEXT");
  if (!sessionColumns.has("group_code")) database.exec("ALTER TABLE sessions ADD COLUMN group_code TEXT");

  const degreeColumnInfo = database.prepare("PRAGMA table_info(degrees)").all() as { name: string }[];
  if (!degreeColumnInfo.some((column) => column.name === "ics_code")) {
    database.exec("ALTER TABLE degrees ADD COLUMN ics_code TEXT NOT NULL DEFAULT ''");
  }

  const subjectColumnInfo = database.prepare("PRAGMA table_info(subjects)").all() as { name: string }[];
  if (!subjectColumnInfo.some((column) => column.name === "abbreviation")) {
    database.exec("ALTER TABLE subjects ADD COLUMN abbreviation TEXT NOT NULL DEFAULT ''");
  }

  const teacherColumnInfo = database.prepare("PRAGMA table_info(teachers)").all() as { name: string }[];
  if (!teacherColumnInfo.some((column) => column.name === "email")) {
    database.exec("ALTER TABLE teachers ADD COLUMN email TEXT NOT NULL DEFAULT ''");
  }
  if (!teacherColumnInfo.some((column) => column.name === "password_hash")) {
    database.exec("ALTER TABLE teachers ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
  }

  migratePracticeInstallations(database);
  migrateDegreePractices(database);
  migrateSessionTeachers(database);
  migrateNullableSessionTeachers(database);

  database.exec("CREATE INDEX IF NOT EXISTS idx_sessions_date_time ON sessions(session_date, start_time)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_practice_installations_installation_id ON practice_installations(installation_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_sessions_subject_practice ON sessions(subject_id, practice_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_sessions_teacher_id ON sessions(teacher_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_auth_sessions_teacher_id ON auth_sessions(teacher_id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at)");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email COLLATE NOCASE) WHERE email <> ''");
  database.exec("CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date)");
  database.exec(`CREATE TRIGGER IF NOT EXISTS prevent_session_on_holiday_insert
    BEFORE INSERT ON sessions
    WHEN EXISTS (SELECT 1 FROM holidays WHERE holiday_date = NEW.session_date)
    BEGIN
      SELECT RAISE(ABORT, 'No se puede programar una sesión en un día festivo.');
    END`);
  database.exec(`CREATE TRIGGER IF NOT EXISTS prevent_session_on_holiday_move
    BEFORE UPDATE OF session_date ON sessions
    WHEN NEW.session_date <> OLD.session_date
      AND EXISTS (SELECT 1 FROM holidays WHERE holiday_date = NEW.session_date)
    BEGIN
      SELECT RAISE(ABORT, 'No se puede mover una sesión a un día festivo.');
    END`);
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_degrees_ics_code ON degrees(ics_code) WHERE ics_code <> ''");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_source_uid ON sessions(source_uid)");
  const foreignKeyProblem = database.prepare("PRAGMA foreign_key_check").get();
  if (foreignKeyProblem) throw new Error("La migración a asignaturas ha dejado una relación no válida.");

  const seeded = database.prepare("SELECT value FROM app_meta WHERE key = ?").get("seed_version");
  if (!seeded) {
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of seedStatements) database.exec(statement);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const sessionsSeeded = database.prepare("SELECT value FROM app_meta WHERE key = ?").get("sessions_seed_version");
  if (!sessionsSeeded) {
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of sessionSeedStatements) database.exec(statement);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  database.exec("PRAGMA optimize");
}

export function getDatabase() {
  if (globalDatabase.nexoLabDatabase) return globalDatabase.nexoLabDatabase;

  const databasePath = resolveDatabasePath();
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  initializeDatabase(database);
  globalDatabase.nexoLabDatabase = database;
  return database;
}

export function getDatabasePath() {
  return resolveDatabasePath();
}
