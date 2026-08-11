import { getD1 } from "../../../db";

type Entity = "laboratories" | "installations" | "practices" | "degrees";

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
    installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
    duration INTEGER NOT NULL CHECK (duration > 0),
    risk_level TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS degrees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    academic_year INTEGER NOT NULL CHECK (academic_year BETWEEN 1 AND 8),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS degree_practices (
    degree_id INTEGER NOT NULL REFERENCES degrees(id) ON DELETE CASCADE,
    practice_id INTEGER NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
    PRIMARY KEY (degree_id, practice_id)
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_installations_laboratory_id ON installations(laboratory_id)",
  "CREATE INDEX IF NOT EXISTS idx_practices_installation_id ON practices(installation_id)",
  "CREATE INDEX IF NOT EXISTS idx_degree_practices_practice_id ON degree_practices(practice_id)",
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
  `INSERT INTO practices (id, code, name, installation_id, duration, risk_level) VALUES
    (1, 'PRA-01', 'Ensayo de tracción y límite elástico', 1, 120, 'Medio'),
    (2, 'PRA-02', 'Caracterización de probetas impresas', 2, 150, 'Bajo'),
    (3, 'PRA-03', 'Sintonía de un controlador PID', 3, 120, 'Bajo'),
    (4, 'PRA-04', 'Respuesta dinámica de un proceso', 3, 90, 'Bajo'),
    (5, 'PRA-05', 'Medición de perfiles aerodinámicos', 4, 180, 'Medio')`,
  `INSERT INTO degrees (id, code, name, level, academic_year) VALUES
    (1, 'GRA-01', 'Ingeniería Mecánica', 'Grado', 2),
    (2, 'GRA-02', 'Ingeniería Electrónica y Automática', 'Grado', 3),
    (3, 'GRA-03', 'Tecnologías Industriales', 'Grado', 2)`,
  `INSERT INTO degree_practices (degree_id, practice_id) VALUES
    (1, 1), (1, 2), (1, 5),
    (2, 3), (2, 4),
    (3, 1), (3, 3), (3, 5)`,
  "INSERT INTO app_meta (key, value) VALUES ('seed_version', '1')",
];

async function initializeDatabase() {
  const db = getD1();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  const seeded = await db.prepare("SELECT value FROM app_meta WHERE key = ?").bind("seed_version").first();
  if (!seeded) await db.batch(seedStatements.map((statement) => db.prepare(statement)));
  await db.prepare("PRAGMA optimize").run();
  return db;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanCode(value: unknown) {
  return cleanString(value).toUpperCase().replace(/\s+/g, "-");
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado";
  if (message.includes("UNIQUE constraint failed")) return "Ya existe un elemento con ese código.";
  if (message.includes("FOREIGN KEY constraint failed")) return "La relación seleccionada ya no está disponible.";
  return message;
}

export async function GET() {
  try {
    const db = await initializeDatabase();
    const [laboratories, installations, practices, degrees] = await Promise.all([
      db.prepare(`SELECT
        l.id, l.code, l.name, l.location, l.manager,
        COUNT(i.id) AS installationCount
        FROM laboratories l
        LEFT JOIN installations i ON i.laboratory_id = l.id
        GROUP BY l.id
        ORDER BY l.code`).all(),
      db.prepare(`SELECT
        i.id, i.code, i.name, i.laboratory_id AS laboratoryId,
        l.name AS laboratoryName, i.category, i.capacity, i.status,
        COUNT(p.id) AS practiceCount
        FROM installations i
        JOIN laboratories l ON l.id = i.laboratory_id
        LEFT JOIN practices p ON p.installation_id = i.id
        GROUP BY i.id
        ORDER BY i.code`).all(),
      db.prepare(`SELECT
        p.id, p.code, p.name, p.installation_id AS installationId,
        i.name AS installationName, l.name AS laboratoryName,
        p.duration, p.risk_level AS riskLevel,
        COUNT(dp.degree_id) AS degreeCount
        FROM practices p
        JOIN installations i ON i.id = p.installation_id
        JOIN laboratories l ON l.id = i.laboratory_id
        LEFT JOIN degree_practices dp ON dp.practice_id = p.id
        GROUP BY p.id
        ORDER BY p.code`).all(),
      db.prepare(`SELECT
        d.id, d.code, d.name, d.level, d.academic_year AS academicYear,
        COUNT(dp.practice_id) AS practiceCount,
        COALESCE(GROUP_CONCAT(p.code, ','), '') AS practiceCodes
        FROM degrees d
        LEFT JOIN degree_practices dp ON dp.degree_id = d.id
        LEFT JOIN practices p ON p.id = dp.practice_id
        GROUP BY d.id
        ORDER BY d.code`).all(),
    ]);

    return Response.json({
      laboratories: laboratories.results,
      installations: installations.results,
      practices: practices.results,
      degrees: degrees.results.map((degree: Record<string, unknown>) => ({
        ...degree,
        practiceCodes: String(degree.practiceCodes || "").split(",").filter(Boolean),
      })),
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const entity = payload.entity as Entity;
    const code = cleanCode(payload.code);
    const name = cleanString(payload.name);
    if (!code || !name) return Response.json({ error: "El código y el nombre son obligatorios." }, { status: 400 });

    const db = await initializeDatabase();
    if (entity === "laboratories") {
      const location = cleanString(payload.location);
      const manager = cleanString(payload.manager);
      if (!location || !manager) return Response.json({ error: "La ubicación y la persona responsable son obligatorias." }, { status: 400 });
      await db.prepare("INSERT INTO laboratories (code, name, location, manager) VALUES (?, ?, ?, ?)").bind(code, name, location, manager).run();
    } else if (entity === "installations") {
      const laboratoryId = positiveInteger(payload.laboratoryId);
      const capacity = positiveInteger(payload.capacity);
      const category = cleanString(payload.category);
      const status = cleanString(payload.status);
      if (!laboratoryId || !capacity || !category || !status) return Response.json({ error: "Completa todos los datos de la instalación." }, { status: 400 });
      await db.prepare("INSERT INTO installations (code, name, laboratory_id, category, capacity, status) VALUES (?, ?, ?, ?, ?, ?)").bind(code, name, laboratoryId, category, capacity, status).run();
    } else if (entity === "practices") {
      const installationId = positiveInteger(payload.installationId);
      const duration = positiveInteger(payload.duration);
      const riskLevel = cleanString(payload.riskLevel);
      if (!installationId || !duration || !riskLevel) return Response.json({ error: "Completa todos los datos de la práctica." }, { status: 400 });
      await db.prepare("INSERT INTO practices (code, name, installation_id, duration, risk_level) VALUES (?, ?, ?, ?, ?)").bind(code, name, installationId, duration, riskLevel).run();
    } else if (entity === "degrees") {
      const level = cleanString(payload.level);
      const academicYear = positiveInteger(payload.academicYear);
      const practiceIds = Array.isArray(payload.practiceIds) ? payload.practiceIds.map(positiveInteger).filter(Boolean) : [];
      if (!level || !academicYear) return Response.json({ error: "Completa el nivel y el curso del grado." }, { status: 400 });
      const degree = await db.prepare("INSERT INTO degrees (code, name, level, academic_year) VALUES (?, ?, ?, ?) RETURNING id").bind(code, name, level, academicYear).first<{ id: number }>();
      if (!degree) throw new Error("No se pudo crear el grado.");
      if (practiceIds.length) {
        await db.batch(practiceIds.map((practiceId) => db.prepare("INSERT INTO degree_practices (degree_id, practice_id) VALUES (?, ?)").bind(degree.id, practiceId)));
      }
    } else {
      return Response.json({ error: "Tipo de elemento no válido." }, { status: 400 });
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { entity?: Entity; id?: unknown };
    const entity = payload.entity;
    const id = positiveInteger(payload.id);
    if (!entity || !id) return Response.json({ error: "Solicitud no válida." }, { status: 400 });

    const db = await initializeDatabase();
    if (entity === "laboratories") {
      const usage = await db.prepare("SELECT COUNT(*) AS total FROM installations WHERE laboratory_id = ?").bind(id).first<{ total: number }>();
      if (Number(usage?.total)) return Response.json({ error: "No puedes eliminar este laboratorio porque todavía contiene instalaciones." }, { status: 409 });
      await db.prepare("DELETE FROM laboratories WHERE id = ?").bind(id).run();
    } else if (entity === "installations") {
      const usage = await db.prepare("SELECT COUNT(*) AS total FROM practices WHERE installation_id = ?").bind(id).first<{ total: number }>();
      if (Number(usage?.total)) return Response.json({ error: "No puedes eliminar esta instalación porque todavía la usan prácticas." }, { status: 409 });
      await db.prepare("DELETE FROM installations WHERE id = ?").bind(id).run();
    } else if (entity === "practices") {
      const usage = await db.prepare("SELECT COUNT(*) AS total FROM degree_practices WHERE practice_id = ?").bind(id).first<{ total: number }>();
      if (Number(usage?.total)) return Response.json({ error: "No puedes eliminar esta práctica porque todavía está asignada a grados." }, { status: 409 });
      await db.prepare("DELETE FROM practices WHERE id = ?").bind(id).run();
    } else if (entity === "degrees") {
      await db.prepare("DELETE FROM degrees WHERE id = ?").bind(id).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
