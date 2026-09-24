"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./attendance.css";

type AttendanceSession = {
  id: number;
  sessionDate: string;
  startTime: string;
  duration: number;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  practiceCode: string | null;
  practiceName: string | null;
  groupCode: string | null;
  semesterId: string;
  studentCount: number;
  attendedCount: number;
  attendanceTaken: boolean;
  updatedAt: string | null;
};

type AttendanceStudent = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  attended: boolean;
};

type AttendanceDetail = {
  session: AttendanceSession;
  semesterId: string;
  students: AttendanceStudent[];
  attendanceTaken: boolean;
  attendedCount: number;
  updatedAt: string | null;
};

type AttendanceSessionsPayload = {
  sessions: AttendanceSession[];
  today: string;
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function localDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function endTime(startTime: string, duration: number) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const total = hours * 60 + minutes + duration;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function sessionTitle(session: AttendanceSession) {
  return session.practiceName
    ? `${session.practiceName}${session.practiceCode ? ` · ${session.practiceCode}` : ""}`
    : "Sesión sin práctica asignada";
}

function groupLabel(groupCode: string | null) {
  return groupCode ? `G${groupCode.replace(/^G/i, "")}` : "";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function fetchAttendanceSessions(signal?: AbortSignal) {
  const response = await fetch("/api/attendance", { cache: "no-store", signal });
  const payload = await response.json() as Partial<AttendanceSessionsPayload> & { error?: string };
  if (!response.ok || !payload.sessions) throw new Error(payload.error || "No se pudieron cargar tus sesiones.");
  return { sessions: payload.sessions, today: payload.today ?? "" } satisfies AttendanceSessionsPayload;
}

export default function AttendanceView({ teacherName }: { teacherName: string }) {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [today, setToday] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AttendanceDetail | null>(null);
  const [attendedIds, setAttendedIds] = useState<Set<number>>(new Set());
  const [initialAttendedIds, setInitialAttendedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSessions = useCallback(async () => {
    try {
      const payload = await fetchAttendanceSessions();
      setSessions(payload.sessions);
      setToday(payload.today);
      setSelectedSessionId((current) => current && payload.sessions.some((session) => session.id === current) ? current : null);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudieron cargar tus sesiones."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (sessionId: number) => {
    setDetailLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/attendance?sessionId=${sessionId}`, { cache: "no-store" });
      const payload = await response.json() as AttendanceDetail & { error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "No se pudo cargar el alumnado.");
      const selected = new Set(payload.students.filter((student) => student.attended).map((student) => student.id));
      setDetail(payload);
      setAttendedIds(selected);
      setInitialAttendedIds(new Set(selected));
      setFilter("");
    } catch (cause) {
      setDetail(null);
      setError(errorMessage(cause, "No se pudo cargar el alumnado."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadInitialSessions() {
      try {
        const payload = await fetchAttendanceSessions(controller.signal);
        if (controller.signal.aborted) return;
        setSessions(payload.sessions);
        setToday(payload.today);
      } catch (cause) {
        if (!controller.signal.aborted) setError(errorMessage(cause, "No se pudieron cargar tus sesiones."));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadInitialSessions();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const events = new EventSource("/api/events");
    const refresh = () => { void loadSessions(); };
    events.addEventListener("data-changed", refresh);
    return () => events.close();
  }, [loadSessions]);

  const modified = useMemo(() => (
    attendedIds.size !== initialAttendedIds.size
    || [...attendedIds].some((id) => !initialAttendedIds.has(id))
  ), [attendedIds, initialAttendedIds]);
  const dirty = !detail?.attendanceTaken || modified;
  const visibleStudents = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("es");
    if (!query) return detail?.students ?? [];
    return (detail?.students ?? []).filter((student) => (
      `${student.lastName} ${student.firstName} ${student.email}`.toLocaleLowerCase("es").includes(query)
    ));
  }, [detail, filter]);

  function toggleStudent(studentId: number, attended: boolean) {
    setSuccess("");
    setAttendedIds((current) => {
      const next = new Set(current);
      if (attended) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  }

  function selectSession(sessionId: number) {
    setSelectedSessionId(sessionId);
    void loadDetail(sessionId);
  }

  function closeRoster() {
    if (modified && !window.confirm("Hay cambios de asistencia sin guardar. ¿Quieres cerrar la lista?")) return;
    setSelectedSessionId(null);
    setDetail(null);
    setAttendedIds(new Set());
    setInitialAttendedIds(new Set());
    setFilter("");
    setError("");
    setSuccess("");
  }

  async function saveAttendance() {
    if (!detail) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: detail.session.id,
          studentIds: detail.students.map((student) => student.id),
          attendedStudentIds: [...attendedIds],
        }),
      });
      const payload = await response.json() as AttendanceDetail & { error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "No se pudo guardar la asistencia.");
      const selected = new Set(payload.students.filter((student) => student.attended).map((student) => student.id));
      setDetail(payload);
      setAttendedIds(selected);
      setInitialAttendedIds(new Set(selected));
      setSuccess(`Asistencia guardada: ${payload.attendedCount} de ${payload.students.length} alumnos presentes.`);
      await loadSessions();
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar la asistencia."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-state" role="status"><span />Cargando tus próximas sesiones…</div>;

  return (
    <section className="attendance-view">
      <header className="attendance-heading">
        <div><span className="section-kicker">Control de asistencia</span><h1>Asistencia</h1><p>Próximas sesiones asignadas a {teacherName}.</p></div>
        <div className="attendance-heading-stat"><strong>{sessions.length}</strong><span>{sessions.length === 1 ? "sesión próxima" : "sesiones próximas"}</span></div>
      </header>

      {error && <div className="attendance-message error" role="alert"><span>!</span><p>{error}</p><button type="button" onClick={() => setError("")} aria-label="Cerrar aviso">×</button></div>}
      {success && <div className="attendance-message success" role="status"><span>✓</span><p>{success}</p><button type="button" onClick={() => setSuccess("")} aria-label="Cerrar aviso">×</button></div>}

      {!sessions.length ? (
        <div className="attendance-empty"><span>ASI</span><h2>No tienes próximas sesiones</h2><p>Cuando una sesión tenga tu profesor asignado, aparecerá aquí desde el comienzo de ese día.</p></div>
      ) : (
        <div className="attendance-layout">
          <aside className="attendance-sessions" aria-label="Próximas sesiones">
            <header><strong>Próximas sesiones</strong><small>Selecciona una para pasar lista</small></header>
            <div>
              {sessions.map((session) => (
                <button
                  type="button"
                  key={session.id}
                  className={selectedSessionId === session.id ? "attendance-session selected" : "attendance-session"}
                  aria-pressed={selectedSessionId === session.id}
                  onClick={() => selectSession(session.id)}
                >
                  <time dateTime={`${session.sessionDate}T${session.startTime}`}>
                    <strong>{session.startTime}</strong><small>{shortDateFormatter.format(localDate(session.sessionDate))}</small>
                  </time>
                  <span className="attendance-session-copy">
                    <strong>{sessionTitle(session)}</strong>
                    <small>{session.subjectCode} · {session.subjectName}{session.groupCode ? ` · ${groupLabel(session.groupCode)}` : ""}</small>
                  </span>
                  <span className={`attendance-session-status${session.attendanceTaken ? " complete" : ""}${!session.studentCount ? " no-roster" : ""}`}>
                    {!session.studentCount ? "Sin alumnado" : session.attendanceTaken ? `${session.attendedCount}/${session.studentCount}` : `${session.studentCount} alumnos`}
                  </span>
                  {session.sessionDate === today && <em>Hoy</em>}
                </button>
              ))}
            </div>
          </aside>

          <div className={`attendance-roster${selectedSessionId ? " mobile-open" : ""}`} aria-live="polite">
            {selectedSessionId && <button className="attendance-mobile-close" type="button" onClick={closeRoster} aria-label="Cerrar lista de alumnos">×</button>}
            {detailLoading ? <div className="attendance-roster-loading" role="status"><span />Cargando alumnado…</div> : !selectedSessionId || !detail ? (
              <div className="attendance-roster-placeholder"><span>✓</span><h2>Selecciona una sesión</h2><p>Aquí aparecerá la lista de su subgrupo para marcar los alumnos presentes.</p></div>
            ) : (
              <>
                <header className="attendance-roster-head">
                  <div>
                    <span>{dateFormatter.format(localDate(detail.session.sessionDate))} · {detail.session.startTime}–{endTime(detail.session.startTime, detail.session.duration)}</span>
                    <h2>{sessionTitle(detail.session)}</h2>
                    <p>{detail.session.subjectCode} · {detail.session.subjectName}{detail.session.groupCode ? ` · ${groupLabel(detail.session.groupCode)}` : " · Todos los grupos"}</p>
                  </div>
                  <strong>{attendedIds.size}<small>de {detail.students.length} presentes</small></strong>
                </header>

                {!detail.students.length ? (
                  <div className="attendance-no-students"><span>CSV</span><h3>No hay alumnado para esta sesión</h3><p>Carga el CSV de la asignatura y semestre desde Inicio. Si la sesión tiene grupo, los códigos de subgrupo deben coincidir.</p></div>
                ) : (
                  <>
                    <div className="attendance-roster-toolbar">
                      <label><span className="sr-only">Buscar alumno</span><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar alumno…" /></label>
                      <button type="button" onClick={() => setAttendedIds(new Set(detail.students.map((student) => student.id)))}>Marcar todos</button>
                      <button type="button" onClick={() => setAttendedIds(new Set())}>Desmarcar todos</button>
                    </div>
                    <div className="attendance-student-list">
                      {visibleStudents.map((student) => (
                        <label key={student.id} className={attendedIds.has(student.id) ? "attendance-student attended" : "attendance-student"}>
                          <input type="checkbox" checked={attendedIds.has(student.id)} onChange={(event) => toggleStudent(student.id, event.target.checked)} />
                          <span><strong>{student.lastName}, {student.firstName}</strong><small>{student.email}</small></span>
                          <em>{attendedIds.has(student.id) ? "Presente" : "Ausente"}</em>
                        </label>
                      ))}
                      {!visibleStudents.length && <p className="attendance-search-empty">No hay alumnos que coincidan con la búsqueda.</p>}
                    </div>
                    <footer className="attendance-roster-actions">
                      <span>{detail.attendanceTaken ? "Lista guardada anteriormente" : "Lista todavía sin guardar"}{detail.updatedAt ? ` · ${detail.updatedAt}` : ""}</span>
                      <button type="button" className="primary-button" disabled={saving || !dirty} onClick={() => void saveAttendance()}>{saving ? "Guardando…" : "Guardar asistencia"}</button>
                    </footer>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
