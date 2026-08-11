"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Section = "overview" | "laboratories" | "installations" | "practices" | "degrees";
type Entity = Exclude<Section, "overview">;

type Laboratory = {
  id: number;
  code: string;
  name: string;
  location: string;
  manager: string;
  installationCount: number;
};

type Installation = {
  id: number;
  code: string;
  name: string;
  laboratoryId: number;
  laboratoryName: string;
  category: string;
  capacity: number;
  status: string;
  practiceCount: number;
};

type Practice = {
  id: number;
  code: string;
  name: string;
  installationId: number;
  installationName: string;
  laboratoryName: string;
  duration: number;
  riskLevel: string;
  degreeCount: number;
};

type Degree = {
  id: number;
  code: string;
  name: string;
  level: string;
  academicYear: number;
  practiceCount: number;
  practiceCodes: string[];
};

type AppData = {
  laboratories: Laboratory[];
  installations: Installation[];
  practices: Practice[];
  degrees: Degree[];
};

const emptyData: AppData = {
  laboratories: [],
  installations: [],
  practices: [],
  degrees: [],
};

const navigation: { key: Section; label: string; short: string }[] = [
  { key: "overview", label: "Vista general", short: "00" },
  { key: "laboratories", label: "Laboratorios", short: "LAB" },
  { key: "installations", label: "Instalaciones", short: "INS" },
  { key: "practices", label: "Prácticas", short: "PRA" },
  { key: "degrees", label: "Grados", short: "GRA" },
];

const entityCopy: Record<Entity, { singular: string; plural: string; description: string }> = {
  laboratories: {
    singular: "laboratorio",
    plural: "Laboratorios",
    description: "Unidades responsables que agrupan espacios e instalaciones.",
  },
  installations: {
    singular: "instalación",
    plural: "Instalaciones",
    description: "Espacios y equipos que pertenecen a un laboratorio.",
  },
  practices: {
    singular: "práctica",
    plural: "Prácticas de laboratorio",
    description: "Actividades docentes que utilizan una instalación concreta.",
  },
  degrees: {
    singular: "grado",
    plural: "Grados",
    description: "Programas académicos vinculados con sus prácticas formativas.",
  },
};

const initialForm = {
  code: "",
  name: "",
  location: "",
  manager: "",
  laboratoryId: "",
  category: "Docente",
  capacity: "24",
  status: "Operativa",
  installationId: "",
  duration: "120",
  riskLevel: "Bajo",
  level: "Grado",
  academicYear: "1",
  practiceIds: [] as number[],
};

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}

export default function Home() {
  const [data, setData] = useState<AppData>(emptyData);
  const [active, setActive] = useState<Section>("overview");
  const [drawer, setDrawer] = useState<Entity | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function loadData() {
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      const payload = (await response.json()) as AppData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar los datos.");
      setData(payload);
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudieron cargar los datos.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawer(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    if (!term) return data;
    const matches = (item: object) => JSON.stringify(item).toLocaleLowerCase("es").includes(term);
    return {
      laboratories: data.laboratories.filter(matches),
      installations: data.installations.filter(matches),
      practices: data.practices.filter(matches),
      degrees: data.degrees.filter(matches),
    };
  }, [data, search]);

  const counts = {
    laboratories: data.laboratories.length,
    installations: data.installations.length,
    practices: data.practices.length,
    degrees: data.degrees.length,
  };

  function openCreate(entity: Entity) {
    setForm({
      ...initialForm,
      laboratoryId: data.laboratories[0]?.id.toString() ?? "",
      installationId: data.installations[0]?.id.toString() ?? "",
    });
    setNotice(null);
    setDrawer(entity);
  }

  async function submitEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!drawer) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: drawer, ...form }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar el registro.");
      setDrawer(null);
      await loadData();
      setActive(drawer);
      setNotice({ kind: "success", message: `${entityCopy[drawer].singular} creado correctamente.` });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar el registro.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntity(entity: Entity, id: number, label: string) {
    if (!window.confirm(`¿Eliminar “${label}”? Esta acción no se puede deshacer.`)) return;
    setNotice(null);
    try {
      const response = await fetch("/api/data", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity, id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo eliminar el registro.");
      await loadData();
      setNotice({ kind: "success", message: "Registro eliminado correctamente." });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar el registro.",
      });
    }
  }

  function showSection(section: Section) {
    setActive(section);
    setSearch("");
  }

  const activeTitle = active === "overview" ? "Vista general" : entityCopy[active].plural;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => showSection("overview")} aria-label="Ir a la vista general">
          <span className="brand-mark">N</span>
          <span>NEXO<em>LAB</em></span>
        </button>

        <nav className="main-nav" aria-label="Navegación principal">
          <p className="nav-caption">Estructura académica</p>
          {navigation.map((item) => (
            <button
              key={item.key}
              className={active === item.key ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => showSection(item.key)}
            >
              <span className="nav-code">{item.short}</span>
              <span>{item.label}</span>
              {item.key !== "overview" && <b>{counts[item.key]}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="live-dot" />
          <div>
            <strong>Sistema conectado</strong>
            <small>Persistencia activa</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Gestión docente /</span>
            <strong>{activeTitle}</strong>
          </div>
          <div className="topbar-actions">
            {active !== "overview" && (
              <label className="search-field">
                <span aria-hidden="true">⌕</span>
                <span className="sr-only">Buscar en {activeTitle}</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar…" />
              </label>
            )}
            <button className="profile-button" type="button" aria-label="Perfil de coordinación">CG</button>
          </div>
        </header>

        <div className="content-frame">
          {notice && (
            <div className={`notice ${notice.kind}`} role="status">
              <span>{notice.kind === "success" ? "✓" : "!"}</span>
              <p>{notice.message}</p>
              <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button>
            </div>
          )}

          {loading ? (
            <div className="loading-state" role="status"><span />Cargando la estructura docente…</div>
          ) : active === "overview" ? (
            <Overview data={data} counts={counts} onOpen={showSection} onCreate={openCreate} />
          ) : (
            <EntityView
              entity={active}
              data={filtered}
              search={search}
              dependencyMissing={active === "installations" ? data.laboratories.length === 0 : active === "practices" ? data.installations.length === 0 : false}
              onCreate={openCreate}
              onDelete={deleteEntity}
            />
          )}
        </div>
      </main>

      {drawer && (
        <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDrawer(null)}>
          <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            <div className="drawer-head">
              <div>
                <span className="entity-pill">{navigation.find((item) => item.key === drawer)?.short}</span>
                <h2 id="drawer-title">Nuevo {entityCopy[drawer].singular}</h2>
                <p>{entityCopy[drawer].description}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setDrawer(null)} aria-label="Cerrar formulario">×</button>
            </div>

            <form className="entity-form" onSubmit={submitEntity}>
              <div className="field-row">
                <label>
                  <span>Código</span>
                  <input required maxLength={12} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder={drawer === "laboratories" ? "LAB-04" : drawer === "installations" ? "INS-05" : drawer === "practices" ? "PRA-06" : "GRA-04"} />
                </label>
                <label>
                  <span>Nombre</span>
                  <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre descriptivo" />
                </label>
              </div>

              {drawer === "laboratories" && (
                <>
                  <label>
                    <span>Ubicación</span>
                    <input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Edificio y planta" />
                  </label>
                  <label>
                    <span>Responsable</span>
                    <input required value={form.manager} onChange={(event) => setForm({ ...form, manager: event.target.value })} placeholder="Nombre de coordinación" />
                  </label>
                </>
              )}

              {drawer === "installations" && (
                <>
                  <label>
                    <span>Laboratorio al que pertenece</span>
                    <select required value={form.laboratoryId} onChange={(event) => setForm({ ...form, laboratoryId: event.target.value })}>
                      <option value="">Selecciona un laboratorio</option>
                      {data.laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.code} · {lab.name}</option>)}
                    </select>
                  </label>
                  <div className="field-row">
                    <label>
                      <span>Tipo</span>
                      <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                        <option>Docente</option><option>Instrumentación</option><option>Simulación</option><option>Fabricación</option>
                      </select>
                    </label>
                    <label>
                      <span>Capacidad</span>
                      <input required min="1" type="number" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} />
                    </label>
                  </div>
                  <label>
                    <span>Estado</span>
                    <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                      <option>Operativa</option><option>Mantenimiento</option><option>Planificada</option>
                    </select>
                  </label>
                </>
              )}

              {drawer === "practices" && (
                <>
                  <label>
                    <span>Instalación que utiliza</span>
                    <select required value={form.installationId} onChange={(event) => setForm({ ...form, installationId: event.target.value })}>
                      <option value="">Selecciona una instalación</option>
                      {data.installations.map((installation) => <option key={installation.id} value={installation.id}>{installation.code} · {installation.name}</option>)}
                    </select>
                  </label>
                  <div className="field-row">
                    <label>
                      <span>Duración (min)</span>
                      <input required min="15" step="15" type="number" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} />
                    </label>
                    <label>
                      <span>Nivel de riesgo</span>
                      <select value={form.riskLevel} onChange={(event) => setForm({ ...form, riskLevel: event.target.value })}>
                        <option>Bajo</option><option>Medio</option><option>Alto</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {drawer === "degrees" && (
                <>
                  <div className="field-row">
                    <label>
                      <span>Nivel</span>
                      <select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                        <option>Grado</option><option>Máster</option><option>Doctorado</option>
                      </select>
                    </label>
                    <label>
                      <span>Curso</span>
                      <select value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value })}>
                        <option value="1">1º</option><option value="2">2º</option><option value="3">3º</option><option value="4">4º</option><option value="5">5º</option>
                      </select>
                    </label>
                  </div>
                  <fieldset className="practice-picker">
                    <legend>Prácticas asignadas <small>Opcional</small></legend>
                    {data.practices.length === 0 ? <p>Crea primero una práctica para poder vincularla.</p> : data.practices.map((practice) => (
                      <label key={practice.id}>
                        <input
                          type="checkbox"
                          checked={form.practiceIds.includes(practice.id)}
                          onChange={(event) => setForm({
                            ...form,
                            practiceIds: event.target.checked
                              ? [...form.practiceIds, practice.id]
                              : form.practiceIds.filter((id) => id !== practice.id),
                          })}
                        />
                        <span><strong>{practice.code}</strong>{practice.name}</span>
                      </label>
                    ))}
                  </fieldset>
                </>
              )}

              <div className="form-summary">
                <span aria-hidden="true">i</span>
                <p>Los vínculos se guardan automáticamente en la jerarquía del sistema.</p>
              </div>
              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={() => setDrawer(null)}>Cancelar</button>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? "Guardando…" : `Crear ${entityCopy[drawer].singular}`}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function Overview({
  data,
  counts,
  onOpen,
  onCreate,
}: {
  data: AppData;
  counts: Record<Entity, number>;
  onOpen: (section: Section) => void;
  onCreate: (entity: Entity) => void;
}) {
  const statItems = [
    { entity: "laboratories" as const, code: "LAB", value: counts.laboratories, label: "laboratorios", tone: "lime" },
    { entity: "installations" as const, code: "INS", value: counts.installations, label: "instalaciones", tone: "coral" },
    { entity: "practices" as const, code: "PRA", value: counts.practices, label: "prácticas", tone: "blue" },
    { entity: "degrees" as const, code: "GRA", value: counts.degrees, label: "grados", tone: "sand" },
  ];

  return (
    <>
      <section className="hero">
        <div>
          <span className="section-kicker">Mapa académico · 2026/27</span>
          <h1>Todo el ecosistema docente, <em>conectado.</em></h1>
          <p>Organiza laboratorios, instalaciones, prácticas y grados desde una única fuente de verdad.</p>
        </div>
        <button className="primary-button hero-action" type="button" onClick={() => onCreate("laboratories")}>
          <span>+</span> Nuevo elemento
        </button>
      </section>

      <section className="stats-grid" aria-label="Resumen de elementos">
        {statItems.map((item) => (
          <button key={item.entity} className={`stat-card ${item.tone}`} type="button" onClick={() => onOpen(item.entity)}>
            <span className="stat-code">{item.code}</span>
            <strong>{String(item.value).padStart(2, "0")}</strong>
            <span>{item.label}</span>
            <ArrowIcon />
          </button>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="panel relationship-panel">
          <div className="panel-head">
            <div><span className="section-kicker">Arquitectura</span><h2>Cómo se conecta todo</h2></div>
            <span className="panel-tag">Relación activa</span>
          </div>
          <div className="relationship-flow">
            <button type="button" onClick={() => onOpen("laboratories")}><span>LAB</span><strong>Laboratorios</strong><small>Contienen instalaciones</small></button>
            <i aria-hidden="true">→</i>
            <button type="button" onClick={() => onOpen("installations")}><span>INS</span><strong>Instalaciones</strong><small>Soportan prácticas</small></button>
            <i aria-hidden="true">→</i>
            <button type="button" onClick={() => onOpen("practices")}><span>PRA</span><strong>Prácticas</strong><small>Se asignan a grados</small></button>
            <i aria-hidden="true">↔</i>
            <button type="button" onClick={() => onOpen("degrees")}><span>GRA</span><strong>Grados</strong><small>Agrupan formación</small></button>
          </div>
        </div>

        <div className="panel coverage-panel">
          <div className="panel-head"><div><span className="section-kicker">Cobertura</span><h2>Prácticas por grado</h2></div></div>
          <div className="coverage-list">
            {data.degrees.slice(0, 4).map((degree) => (
              <button type="button" onClick={() => onOpen("degrees")} key={degree.id}>
                <span className="mini-code">{degree.code}</span>
                <span><strong>{degree.name}</strong><small>{degree.level} · {degree.academicYear}º curso</small></span>
                <b>{degree.practiceCount}<small>PRA</small></b>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel activity-panel">
        <div className="panel-head">
          <div><span className="section-kicker">Inventario</span><h2>Instalaciones en contexto</h2></div>
          <button className="text-button" type="button" onClick={() => onOpen("installations")}>Ver todas <span>→</span></button>
        </div>
        <div className="compact-table" role="table" aria-label="Instalaciones recientes">
          <div className="compact-row header" role="row"><span>Código / Instalación</span><span>Laboratorio</span><span>Uso</span><span>Estado</span></div>
          {data.installations.slice(0, 4).map((installation) => (
            <div className="compact-row" role="row" key={installation.id}>
              <span><b>{installation.code}</b><strong>{installation.name}</strong></span>
              <span>{installation.laboratoryName}</span>
              <span>{installation.practiceCount} prácticas</span>
              <span><i className={`status-dot ${installation.status === "Operativa" ? "ok" : "warn"}`} />{installation.status}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function EntityView({
  entity,
  data,
  search,
  dependencyMissing,
  onCreate,
  onDelete,
}: {
  entity: Entity;
  data: AppData;
  search: string;
  dependencyMissing: boolean;
  onCreate: (entity: Entity) => void;
  onDelete: (entity: Entity, id: number, label: string) => void;
}) {
  const items = data[entity];
  return (
    <>
      <section className="entity-hero">
        <div>
          <span className="section-kicker">Catálogo / {navigation.find((item) => item.key === entity)?.short}</span>
          <h1>{entityCopy[entity].plural}</h1>
          <p>{entityCopy[entity].description}</p>
        </div>
        <button className="primary-button" type="button" disabled={dependencyMissing} onClick={() => onCreate(entity)}>
          <span>+</span> Añadir {entityCopy[entity].singular}
        </button>
      </section>

      {dependencyMissing && (
        <div className="dependency-message">Para crear este elemento, añade antes su nivel superior en la jerarquía.</div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <span>{search ? "⌕" : "+"}</span>
          <h2>{search ? "No hay coincidencias" : `Aún no hay ${entityCopy[entity].plural.toLowerCase()}`}</h2>
          <p>{search ? "Prueba con otro código, nombre o relación." : "Crea el primer registro para empezar a construir la estructura."}</p>
          {!search && !dependencyMissing && <button className="primary-button" type="button" onClick={() => onCreate(entity)}>Crear ahora</button>}
        </div>
      ) : entity === "laboratories" ? (
        <div className="laboratory-grid">
          {(items as Laboratory[]).map((lab) => (
            <article className="laboratory-card" key={lab.id}>
              <div className="card-top"><span className="entity-pill">{lab.code}</span><button type="button" onClick={() => onDelete(entity, lab.id, lab.name)} aria-label={`Eliminar ${lab.name}`}>×</button></div>
              <h2>{lab.name}</h2>
              <p><span>Ubicación</span>{lab.location}</p>
              <p><span>Responsable</span>{lab.manager}</p>
              <div className="card-foot"><strong>{lab.installationCount}</strong><span>instalaciones<br />conectadas</span><ArrowIcon /></div>
            </article>
          ))}
        </div>
      ) : entity === "degrees" ? (
        <div className="degree-list">
          {(items as Degree[]).map((degree) => (
            <article className="degree-card" key={degree.id}>
              <div className="degree-code"><span>{degree.code}</span><small>{degree.level}</small></div>
              <div className="degree-main"><h2>{degree.name}</h2><p>{degree.academicYear}º curso · {degree.practiceCount} prácticas asignadas</p></div>
              <div className="tag-list">{degree.practiceCodes.length ? degree.practiceCodes.map((code) => <span key={code}>{code}</span>) : <em>Sin prácticas</em>}</div>
              <button className="delete-button" type="button" onClick={() => onDelete(entity, degree.id, degree.name)} aria-label={`Eliminar ${degree.name}`}>×</button>
            </article>
          ))}
        </div>
      ) : (
        <div className="entity-table-wrap">
          <table className="entity-table">
            <thead><tr>
              <th>Código / Nombre</th>
              <th>{entity === "installations" ? "Laboratorio" : "Instalación"}</th>
              <th>{entity === "installations" ? "Tipo / Capacidad" : "Laboratorio"}</th>
              <th>{entity === "installations" ? "Estado" : "Duración / Riesgo"}</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody>
              {entity === "installations" ? (items as Installation[]).map((item) => (
                <tr key={item.id}>
                  <td><span className="table-code">{item.code}</span><strong>{item.name}</strong><small>{item.practiceCount} prácticas</small></td>
                  <td>{item.laboratoryName}</td>
                  <td>{item.category}<small>{item.capacity} personas</small></td>
                  <td><span className={`status-chip ${item.status === "Operativa" ? "ok" : "warn"}`}>{item.status}</span></td>
                  <td><button className="delete-button" type="button" onClick={() => onDelete(entity, item.id, item.name)} aria-label={`Eliminar ${item.name}`}>×</button></td>
                </tr>
              )) : (items as Practice[]).map((item) => (
                <tr key={item.id}>
                  <td><span className="table-code blue">{item.code}</span><strong>{item.name}</strong><small>{item.degreeCount} grados</small></td>
                  <td>{item.installationName}</td>
                  <td>{item.laboratoryName}</td>
                  <td>{item.duration} min<small>Riesgo {item.riskLevel.toLowerCase()}</small></td>
                  <td><button className="delete-button" type="button" onClick={() => onDelete(entity, item.id, item.name)} aria-label={`Eliminar ${item.name}`}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
