"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
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
  rulesAcceptedCount: number;
  rulesPendingCount: number;
  updatedAt: string | null;
};

type AttendanceStudent = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  attended: boolean;
  rulesAccepted: boolean;
  rulesAcceptedAt: string | null;
};

type LaboratoryRules = {
  academicYear: string;
  version: string;
  title: string;
  introduction: string;
  commitments: string[];
  closing: string;
  workshopTitle: string;
  workshopRules: { text: string; link?: string; suffix?: string }[];
  hash: string;
};

type AttendanceDetail = {
  session: AttendanceSession;
  semesterId: string;
  students: AttendanceStudent[];
  rules: LaboratoryRules;
  attendanceTaken: boolean;
  attendedCount: number;
  rulesAcceptedCount: number;
  rulesPendingCount: number;
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

function acceptanceDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}

async function fetchAttendanceSessions(signal?: AbortSignal) {
  const response = await fetch("/api/attendance", { cache: "no-store", signal });
  const payload = await response.json() as Partial<AttendanceSessionsPayload> & { error?: string };
  if (!response.ok || !payload.sessions) throw new Error(payload.error || "No se pudieron cargar tus sesiones.");
  return { sessions: payload.sessions, today: payload.today ?? "" } satisfies AttendanceSessionsPayload;
}

function SignatureDialog({
  student,
  rules,
  pendingCount,
  busy,
  onClose,
  onSave,
}: {
  student: AttendanceStudent;
  rules: LaboratoryRules;
  pendingCount: number;
  busy: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [attested, setAttested] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(280, bounds.width);
    const height = Math.max(180, bounds.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#17201d";
  }, [student.id]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    drawingRef.current = true;
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
    setHasInk(true);
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function submit() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || !accepted || !attested || busy) return;
    void onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div className="attendance-signature-overlay" role="dialog" aria-modal="true" aria-labelledby="signature-title">
      <section className="attendance-signature-dialog capture">
        <header>
          <div><span>Normas de laboratorio · {rules.academicYear}</span><h2 id="signature-title">Firma de {student.firstName} {student.lastName}</h2><p>{student.email} · {pendingCount} {pendingCount === 1 ? "firma pendiente" : "firmas pendientes"}</p></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar firma">×</button>
        </header>
        <div className="attendance-signature-content">
          <div className="attendance-rules-document">
            <strong>{rules.title}</strong>
            <p>{rules.introduction}</p>
            <ul>{rules.commitments.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            <p>{rules.closing}</p>
            <h3>{rules.workshopTitle}</h3>
            <ul>{rules.workshopRules.map((rule) => (
              <li key={rule.text}>{rule.text}{rule.link && <> <a href={rule.link} target="_blank" rel="noreferrer">{rule.link}</a></>}{rule.suffix}</li>
            ))}</ul>
          </div>
          <div className="attendance-signature-actions">
            <label className="attendance-acceptance-check">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>He leído y acepto las normas de laboratorio indicadas.</span>
            </label>
            <div className="attendance-signature-pad">
              <div><strong>Firma del alumno</strong><button type="button" onClick={clearSignature} disabled={busy || !hasInk}>Borrar</button></div>
              <canvas
                ref={canvasRef}
                aria-label="Zona para firmar con el dedo"
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
              />
              {!hasInk && <span>Firma aquí con el dedo</span>}
            </div>
            <label className="attendance-acceptance-check teacher">
              <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
              <span>Como profesor responsable, confirmo que esta firma se ha recogido presencialmente.</span>
            </label>
          </div>
        </div>
        <footer>
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="primary-button" type="button" onClick={submit} disabled={busy || !hasInk || !accepted || !attested}>{busy ? "Guardando…" : "Guardar firma y continuar"}</button>
        </footer>
      </section>
    </div>
  );
}

function SignatureViewer({
  student,
  sessionId,
  rules,
  onClose,
}: {
  student: AttendanceStudent;
  sessionId: number;
  rules: LaboratoryRules;
  onClose: () => void;
}) {
  const imageUrl = `/api/attendance?sessionId=${sessionId}&studentId=${student.id}&signature=image`;
  const pdfUrl = `/api/attendance?sessionId=${sessionId}&studentId=${student.id}&signature=pdf`;
  return (
    <div className="attendance-signature-overlay" role="dialog" aria-modal="true" aria-labelledby="signature-view-title">
      <section className="attendance-signature-dialog viewer">
        <header>
          <div><span>Normas aceptadas · {rules.academicYear}</span><h2 id="signature-view-title">{student.firstName} {student.lastName}</h2><p>{student.email}</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar firma">×</button>
        </header>
        <div className="attendance-signature-content">
          <div className="attendance-signed-summary"><span>✓</span><div><strong>Aceptación registrada</strong><small>{acceptanceDate(student.rulesAcceptedAt)} · Versión {rules.version}</small></div></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="attendance-saved-signature" src={imageUrl} alt={`Firma de ${student.firstName} ${student.lastName}`} />
          <p className="attendance-signature-note">La firma se conserva de forma protegida y solo es accesible para el profesorado autorizado.</p>
        </div>
        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>Cerrar</button>
          <a className="primary-button" href={pdfUrl}>Descargar justificante PDF</a>
        </footer>
      </section>
    </div>
  );
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
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureStudent, setSignatureStudent] = useState<AttendanceStudent | null>(null);
  const [signatureViewerStudent, setSignatureViewerStudent] = useState<AttendanceStudent | null>(null);
  const [onlyRulesPending, setOnlyRulesPending] = useState(false);
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
      setOnlyRulesPending(false);
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
    return (detail?.students ?? []).filter((student) => (
      (!onlyRulesPending || !student.rulesAccepted)
      && (!query || `${student.lastName} ${student.firstName} ${student.email}`.toLocaleLowerCase("es").includes(query))
    ));
  }, [detail, filter, onlyRulesPending]);

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
    setOnlyRulesPending(false);
    setSignatureStudent(null);
    setSignatureViewerStudent(null);
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

  function startCollectingSignatures(student?: AttendanceStudent) {
    if (!detail) return;
    const nextStudent = student ?? detail.students.find((item) => !item.rulesAccepted);
    if (!nextStudent) return;
    setSignatureViewerStudent(null);
    setSignatureStudent(nextStudent);
  }

  async function saveSignature(student: AttendanceStudent, signatureDataUrl: string) {
    if (!detail) return;
    setSignatureSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: detail.session.id,
          studentId: student.id,
          signatureDataUrl,
          acceptedRules: true,
          teacherAttested: true,
        }),
      });
      const payload = await response.json() as AttendanceDetail & { error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "No se pudo guardar la firma.");
      setDetail(payload);
      setSessions((current) => current.map((session) => session.id === payload.session.id
        ? { ...session, rulesAcceptedCount: payload.rulesAcceptedCount, rulesPendingCount: payload.rulesPendingCount }
        : session));
      const nextStudent = payload.students.find((item) => !item.rulesAccepted);
      setSignatureStudent(nextStudent ?? null);
      setSuccess(nextStudent
        ? `Firma guardada. Continúa con ${nextStudent.firstName} ${nextStudent.lastName}.`
        : "Todas las firmas pendientes de esta sesión se han recogido.");
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar la firma."));
    } finally {
      setSignatureSaving(false);
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
                    <small>{session.subjectCode} · {session.subjectName}{session.groupCode ? ` · ${groupLabel(session.groupCode)}` : ""}{session.studentCount ? session.rulesPendingCount ? ` · ${session.rulesPendingCount} normas pendientes` : " · Normas firmadas" : ""}</small>
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
                    <div className="attendance-rules-toolbar">
                      <div><strong>{detail.rulesAcceptedCount} firmadas</strong><span>{detail.rulesPendingCount ? `${detail.rulesPendingCount} pendientes` : "Todos han aceptado las normas"}</span></div>
                      <button type="button" className={onlyRulesPending ? "active" : ""} onClick={() => setOnlyRulesPending((current) => !current)}>{onlyRulesPending ? "Mostrar todos" : "Solo pendientes"}</button>
                      <button type="button" className="collect" disabled={!detail.rulesPendingCount} onClick={() => startCollectingSignatures()}>{detail.rulesPendingCount ? "Recoger firmas" : "Firmas completas"}</button>
                    </div>
                    <div className="attendance-roster-toolbar">
                      <label><span className="sr-only">Buscar alumno</span><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar alumno…" /></label>
                      <button type="button" onClick={() => setAttendedIds(new Set(detail.students.map((student) => student.id)))}>Marcar todos</button>
                      <button type="button" onClick={() => setAttendedIds(new Set())}>Desmarcar todos</button>
                    </div>
                    <div className="attendance-student-list">
                      {visibleStudents.map((student) => (
                        <div key={student.id} className={attendedIds.has(student.id) ? "attendance-student attended" : "attendance-student"}>
                          <input id={`attendance-${student.id}`} type="checkbox" checked={attendedIds.has(student.id)} onChange={(event) => toggleStudent(student.id, event.target.checked)} />
                          <label htmlFor={`attendance-${student.id}`}><strong>{student.lastName}, {student.firstName}</strong><small>{student.email}</small></label>
                          <div className="attendance-student-actions">
                            <em>{attendedIds.has(student.id) ? "Presente" : "Ausente"}</em>
                            <button
                              type="button"
                              className={student.rulesAccepted ? "accepted" : "pending"}
                              onClick={() => student.rulesAccepted ? setSignatureViewerStudent(student) : startCollectingSignatures(student)}
                            >
                              {student.rulesAccepted ? `Firmado ${acceptanceDate(student.rulesAcceptedAt)}` : "Normas pendientes"}
                            </button>
                          </div>
                        </div>
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
      {detail && signatureStudent && (
        <SignatureDialog
          key={signatureStudent.id}
          student={signatureStudent}
          rules={detail.rules}
          pendingCount={detail.rulesPendingCount}
          busy={signatureSaving}
          onClose={() => setSignatureStudent(null)}
          onSave={(signatureDataUrl) => saveSignature(signatureStudent, signatureDataUrl)}
        />
      )}
      {detail && signatureViewerStudent && (
        <SignatureViewer
          student={signatureViewerStudent}
          sessionId={detail.session.id}
          rules={detail.rules}
          onClose={() => setSignatureViewerStudent(null)}
        />
      )}
    </section>
  );
}
