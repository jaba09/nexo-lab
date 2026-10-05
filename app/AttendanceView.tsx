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
  responsibleTeacherId: number;
  responsibleTeacherCode: string;
  responsibleTeacherName: string;
  substituteTeacherId: number | null;
  substituteTeacherCode: string | null;
  substituteTeacherName: string | null;
  attendanceRole: "responsible" | "substitute";
  canManageSubstitute: boolean;
};

type AttendanceTeacher = {
  id: number;
  code: string;
  name: string;
};

type AttendanceStudent = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  attended: boolean;
  rulesAccepted: boolean;
  rulesAcceptedAt: string | null;
  manuallyIncluded: boolean;
};

type AvailableStudent = Pick<AttendanceStudent, "id" | "firstName" | "lastName" | "email">;

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
  availableStudents: AvailableStudent[];
  rules: LaboratoryRules;
  attendanceTaken: boolean;
  attendedCount: number;
  rulesAcceptedCount: number;
  rulesPendingCount: number;
  updatedAt: string | null;
};

type AttendanceSessionsPayload = {
  sessions: AttendanceSession[];
  teachers: AttendanceTeacher[];
  today: string;
};

type AttendanceStatistics = {
  semesterId: string;
  availableSemesters: string[];
  subjects: Array<{
    subjectId: number;
    subjectCode: string;
    subjectName: string;
    teacherCount: number;
    controllingTeacherCount: number;
    teacherControlRate: number | null;
    scheduledSessionCount: number;
    recordedSessionCount: number;
    sessionControlRate: number | null;
    expectedStudentCount: number;
    attendedStudentCount: number;
    attendanceRate: number | null;
  }>;
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
  const response = await fetch("/api/attendance?includePast=true", { cache: "no-store", signal });
  const payload = await response.json() as Partial<AttendanceSessionsPayload> & { error?: string };
  if (!response.ok || !payload.sessions) throw new Error(payload.error || "No se pudieron cargar tus sesiones.");
  return { sessions: payload.sessions, teachers: payload.teachers ?? [], today: payload.today ?? "" } satisfies AttendanceSessionsPayload;
}

async function fetchAttendanceStatistics(semesterId?: string) {
  const parameters = new URLSearchParams({ view: "statistics" });
  if (semesterId) parameters.set("semesterId", semesterId);
  const response = await fetch(`/api/attendance?${parameters}`, { cache: "no-store" });
  const payload = await response.json() as AttendanceStatistics & { error?: string };
  if (!response.ok || !payload.semesterId) throw new Error(payload.error || "No se pudieron calcular las estadísticas.");
  return payload;
}

function semesterLabel(value: string) {
  const match = /^(\d{4})-(\d{2}) S([12])$/.exec(value);
  return match ? `Semestre ${match[3]} · ${match[1]}-${match[2]}` : value;
}

function percentage(value: number | null) {
  return value === null ? "—" : `${value} %`;
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

function AddStudentDialog({
  session,
  availableStudents,
  busy,
  onClose,
  onSave,
}: {
  session: AttendanceSession;
  availableStudents: AvailableStudent[];
  busy: boolean;
  onClose: () => void;
  onSave: (student: { firstName: string; lastName: string; email: string }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  function updateEmail(value: string) {
    setEmail(value);
    const match = availableStudents.find((student) => student.email.toLocaleLowerCase("es") === value.trim().toLocaleLowerCase("es"));
    if (match) {
      setFirstName(match.firstName);
      setLastName(match.lastName);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    void onSave({ firstName, lastName, email });
  }

  return (
    <div className="attendance-student-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="add-student-title">
      <section className="attendance-student-dialog">
        <header>
          <div>
            <span>Inclusión puntual</span>
            <h2 id="add-student-title">Añadir alumno</h2>
            <p>{session.subjectCode}{session.groupCode ? ` · ${groupLabel(session.groupCode)}` : " · Todos los grupos"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar">×</button>
        </header>
        <form onSubmit={submit}>
          <p className="attendance-student-dialog-note">Se añadirá únicamente a esta sesión. No se modificará su subgrupo ni el listado oficial del CSV.</p>
          <label>
            <span>Correo electrónico</span>
            <input required type="email" list="attendance-available-students" autoComplete="off" value={email} onChange={(event) => updateEmail(event.target.value)} placeholder="alumno@unizar.es" />
            <datalist id="attendance-available-students">
              {availableStudents.map((student) => <option key={student.id} value={student.email}>{student.lastName}, {student.firstName}</option>)}
            </datalist>
          </label>
          <div>
            <label><span>Nombre</span><input required maxLength={120} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
            <label><span>Apellidos</span><input required maxLength={180} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
          </div>
          <footer>
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Añadiendo…" : "Añadir a esta sesión"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function SubstituteDialog({
  session,
  teachers,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  session: AttendanceSession;
  teachers: AttendanceTeacher[];
  busy: boolean;
  onClose: () => void;
  onSave: (teacherId: number) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const options = teachers.filter((teacher) => teacher.id !== session.responsibleTeacherId);
  const [teacherId, setTeacherId] = useState(String(session.substituteTeacherId ?? options[0]?.id ?? ""));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !teacherId) return;
    void onSave(Number(teacherId));
  }

  return (
    <div className="attendance-student-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="substitute-title">
      <section className="attendance-student-dialog attendance-substitute-dialog">
        <header>
          <div>
            <span>Autorización excepcional</span>
            <h2 id="substitute-title">Profesor sustituto</h2>
            <p>{session.subjectCode}{session.groupCode ? ` · ${groupLabel(session.groupCode)}` : ""} · {dateFormatter.format(localDate(session.sessionDate))} · {session.startTime}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar sustitución">×</button>
        </header>
        <form onSubmit={submit}>
          <p className="attendance-student-dialog-note">El sustituto podrá pasar lista, añadir alumnado puntual y recoger firmas en esta sesión. El profesor responsable y la asignación docente no cambian.</p>
          <label>
            <span>Profesor sustituto</span>
            <select required value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
              {!options.length && <option value="">No hay otros profesores disponibles</option>}
              {options.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.code}</option>)}
            </select>
          </label>
          {session.substituteTeacherName && <p className="attendance-current-substitute">Sustituto actual: <strong>{session.substituteTeacherName}</strong>{session.substituteTeacherCode ? ` · ${session.substituteTeacherCode}` : ""}</p>}
          <footer>
            {session.substituteTeacherId && <button className="delete-button attendance-remove-substitute" type="button" onClick={() => void onRemove()} disabled={busy}>Retirar sustituto</button>}
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={busy || !teacherId}>{busy ? "Guardando…" : session.substituteTeacherId ? "Cambiar sustituto" : "Nombrar sustituto"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function AttendanceStatisticsPanel({
  statistics,
  loading,
  onSemesterChange,
}: {
  statistics: AttendanceStatistics | null;
  loading: boolean;
  onSemesterChange: (semesterId: string) => void;
}) {
  if (loading && !statistics) return <div className="loading-state" role="status"><span />Calculando estadísticas…</div>;
  if (!statistics) return null;
  return (
    <div className="attendance-statistics" aria-busy={loading}>
      <div className="attendance-statistics-toolbar">
        <div><strong>Control de asistencia · {semesterLabel(statistics.semesterId)}</strong><span>Resultados acumulados hasta hoy para todas las asignaturas con alumnado cargado.</span></div>
        <label><span>Semestre</span><select value={statistics.semesterId} disabled={loading} onChange={(event) => onSemesterChange(event.target.value)}>{statistics.availableSemesters.map((semester) => <option key={semester} value={semester}>{semesterLabel(semester)}</option>)}</select></label>
      </div>

      <div className="attendance-data-warning">
        <span>DAT</span>
        <p><strong>Una lista no guardada no equivale a una ausencia.</strong> El porcentaje de alumnos asistentes utiliza exclusivamente las sesiones con control registrado. Los porcentajes de profesorado y sesiones muestran, precisamente, qué parte de la docencia sí está cubierta por la aplicación.</p>
      </div>

      <section className="attendance-stat-panel attendance-subject-statistics">
        <header><div><span>POR ASIGNATURA</span><h2>Uso del control de asistencia</h2></div><small>{statistics.subjects.length} {statistics.subjects.length === 1 ? "asignatura" : "asignaturas"}</small></header>
        {!statistics.subjects.length ? <p className="attendance-stat-empty">Todavía no hay sesiones celebradas con alumnado en este semestre.</p> : (
          <div className="attendance-stat-table-wrap"><table><thead><tr><th>Asignatura</th><th>Profesores con control</th><th>Alumnos que asisten</th><th>Sesiones con control</th></tr></thead><tbody>{statistics.subjects.map((subject) => <tr key={subject.subjectId}>
            <td><strong>{subject.subjectCode}</strong><span>{subject.subjectName}</span></td>
            <td><div className="attendance-stat-metric"><strong>{subject.controllingTeacherCount} / {subject.teacherCount}</strong><span>{percentage(subject.teacherControlRate)}</span><i><b style={{ width: `${subject.teacherControlRate ?? 0}%` }} /></i><small>responsables con alguna sesión controlada</small></div></td>
            <td><div className="attendance-stat-metric"><strong>{percentage(subject.attendanceRate)}</strong><span>{subject.expectedStudentCount ? `${subject.attendedStudentCount} / ${subject.expectedStudentCount}` : "Sin datos"}</span><i><b style={{ width: `${subject.attendanceRate ?? 0}%` }} /></i><small>solo sobre listas con control registrado</small></div></td>
            <td><div className="attendance-stat-metric"><strong>{percentage(subject.sessionControlRate)}</strong><span>{subject.recordedSessionCount} / {subject.scheduledSessionCount}</span><i><b style={{ width: `${subject.sessionControlRate ?? 0}%` }} /></i><small>sesiones celebradas con lista guardada</small></div></td>
          </tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

export default function AttendanceView({ teacherName }: { teacherName: string }) {
  const [view, setView] = useState<"register" | "statistics">("register");
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [teachers, setTeachers] = useState<AttendanceTeacher[]>([]);
  const [today, setToday] = useState("");
  const [showPastSessions, setShowPastSessions] = useState(false);
  const visibleSessions = sessions.filter((session) => showPastSessions || session.sessionDate >= today);
  const sessionsLabel = showPastSessions ? "Sesiones asignadas" : "Próximas sesiones";
  const [statistics, setStatistics] = useState<AttendanceStatistics | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
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
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [studentSaving, setStudentSaving] = useState(false);
  const [substituteDialogOpen, setSubstituteDialogOpen] = useState(false);
  const [substituteSaving, setSubstituteSaving] = useState(false);
  const [onlyRulesPending, setOnlyRulesPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSessions = useCallback(async () => {
    try {
      const payload = await fetchAttendanceSessions();
      setSessions(payload.sessions);
      setTeachers(payload.teachers);
      setToday(payload.today);
      setSelectedSessionId((current) => current && payload.sessions.some((session) => session.id === current) ? current : null);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudieron cargar tus sesiones."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatistics = useCallback(async (semesterId?: string) => {
    setStatisticsLoading(true);
    try {
      setStatistics(await fetchAttendanceStatistics(semesterId));
    } catch (cause) {
      setError(errorMessage(cause, "No se pudieron calcular las estadísticas."));
    } finally {
      setStatisticsLoading(false);
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

  const modified = useMemo(() => (
    attendedIds.size !== initialAttendedIds.size
    || [...attendedIds].some((id) => !initialAttendedIds.has(id))
  ), [attendedIds, initialAttendedIds]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadInitialSessions() {
      try {
        const payload = await fetchAttendanceSessions(controller.signal);
        if (controller.signal.aborted) return;
        setSessions(payload.sessions);
        setTeachers(payload.teachers);
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
    const refresh = () => {
      void loadSessions();
      if (view === "statistics") void loadStatistics(statistics?.semesterId);
      if (selectedSessionId && !modified) void loadDetail(selectedSessionId);
    };
    events.addEventListener("data-changed", refresh);
    return () => events.close();
  }, [loadDetail, loadSessions, loadStatistics, modified, selectedSessionId, statistics?.semesterId, view]);

  function changeView(nextView: "register" | "statistics") {
    if (nextView === view) return;
    if (nextView === "statistics" && modified && !window.confirm("Hay cambios de asistencia sin guardar. ¿Quieres salir de la lista?")) return;
    setView(nextView);
    setError("");
    setSuccess("");
    if (nextView === "statistics") void loadStatistics(statistics?.semesterId);
  }

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
    setAddStudentOpen(false);
    setSubstituteDialogOpen(false);
    setError("");
    setSuccess("");
  }

  function openAddStudent() {
    if (modified) {
      setError("Guarda o descarta los cambios de asistencia antes de añadir un alumno.");
      return;
    }
    setAddStudentOpen(true);
  }

  function openSubstituteDialog() {
    if (!detail?.session.canManageSubstitute) return;
    if (modified) {
      setError("Guarda o descarta los cambios de asistencia antes de gestionar al sustituto.");
      return;
    }
    setSubstituteDialogOpen(true);
  }

  async function saveSubstitute(substituteTeacherId: number) {
    if (!detail) return;
    setSubstituteSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/attendance/delegation", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: detail.session.id, substituteTeacherId }),
      });
      const payload = await response.json() as { delegation?: { substituteTeacherName: string }; error?: string };
      if (!response.ok || !payload.delegation) throw new Error(payload.error || "No se pudo nombrar al sustituto.");
      setSubstituteDialogOpen(false);
      await loadSessions();
      await loadDetail(detail.session.id);
      setSuccess(`${payload.delegation.substituteTeacherName} podrá pasar lista en esta sesión.`);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo nombrar al sustituto."));
    } finally {
      setSubstituteSaving(false);
    }
  }

  async function removeSubstitute() {
    if (!detail?.session.substituteTeacherId) return;
    if (!window.confirm(`¿Retirar a ${detail.session.substituteTeacherName ?? "este profesor"} como sustituto de esta sesión?`)) return;
    setSubstituteSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/attendance/delegation", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: detail.session.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo retirar al sustituto.");
      setSubstituteDialogOpen(false);
      await loadSessions();
      await loadDetail(detail.session.id);
      setSuccess("La sustitución se ha retirado. La asignación oficial de la sesión no ha cambiado.");
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo retirar al sustituto."));
    } finally {
      setSubstituteSaving(false);
    }
  }

  async function addStudent(student: { firstName: string; lastName: string; email: string }) {
    if (!detail) return;
    setStudentSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: detail.session.id, ...student }),
      });
      const payload = await response.json() as AttendanceDetail & { error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "No se pudo añadir el alumno.");
      const selected = new Set(payload.students.filter((item) => item.attended).map((item) => item.id));
      setDetail(payload);
      setAttendedIds(selected);
      setInitialAttendedIds(new Set(selected));
      setAddStudentOpen(false);
      setSuccess(`${student.firstName.trim()} ${student.lastName.trim()} se ha añadido únicamente a esta sesión.`);
      await loadSessions();
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo añadir el alumno."));
    } finally {
      setStudentSaving(false);
    }
  }

  async function removeStudent(student: AttendanceStudent) {
    if (!detail || !student.manuallyIncluded) return;
    if (modified) {
      setError("Guarda o descarta los cambios de asistencia antes de retirar un alumno.");
      return;
    }
    if (!window.confirm(`¿Retirar a ${student.firstName} ${student.lastName} de esta sesión? Su firma de las normas se conservará.`)) return;
    setStudentSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/attendance", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: detail.session.id, studentId: student.id }),
      });
      const payload = await response.json() as AttendanceDetail & { error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "No se pudo retirar el alumno.");
      const selected = new Set(payload.students.filter((item) => item.attended).map((item) => item.id));
      setDetail(payload);
      setAttendedIds(selected);
      setInitialAttendedIds(new Set(selected));
      setSuccess(`${student.firstName} ${student.lastName} ya no figura en esta sesión.`);
      await loadSessions();
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo retirar el alumno."));
    } finally {
      setStudentSaving(false);
    }
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
        <div><span className="section-kicker">Control de asistencia</span><h1>Asistencia</h1><p>{view === "register" ? (showPastSessions ? `Sesiones asignadas a ${teacherName}.` : `Próximas sesiones asignadas a ${teacherName}.`) : "Uso del control de asistencia por asignatura y semestre."}</p></div>
        <div className="attendance-heading-stat"><strong>{view === "statistics" ? statistics?.subjects.length ?? "—" : visibleSessions.length}</strong><span>{view === "statistics" ? "asignaturas evaluadas" : showPastSessions ? "sesiones asignadas" : visibleSessions.length === 1 ? "sesión próxima" : "sesiones próximas"}</span></div>
      </header>

      <nav className="attendance-view-tabs" aria-label="Vistas de asistencia">
        <button type="button" className={view === "register" ? "active" : ""} aria-current={view === "register" ? "page" : undefined} onClick={() => changeView("register")}>Pasar lista</button>
        <button type="button" className={view === "statistics" ? "active" : ""} aria-current={view === "statistics" ? "page" : undefined} onClick={() => changeView("statistics")}>Estadísticas</button>
      </nav>

      {view === "register" && (
        <label className="attendance-past-sessions">
          <input type="checkbox" checked={showPastSessions} onChange={(event) => setShowPastSessions(event.target.checked)} />
          <span>Mostrar sesiones anteriores</span>
        </label>
      )}

      {error && <div className="attendance-message error" role="alert"><span>!</span><p>{error}</p><button type="button" onClick={() => setError("")} aria-label="Cerrar aviso">×</button></div>}
      {success && <div className="attendance-message success" role="status"><span>✓</span><p>{success}</p><button type="button" onClick={() => setSuccess("")} aria-label="Cerrar aviso">×</button></div>}

      {view === "statistics" ? (
        <AttendanceStatisticsPanel statistics={statistics} loading={statisticsLoading} onSemesterChange={(semesterId) => void loadStatistics(semesterId)} />
      ) : !visibleSessions.length ? (
        <div className="attendance-empty"><span>ASI</span><h2>{showPastSessions ? "No tienes sesiones asignadas" : "No tienes próximas sesiones"}</h2><p>{showPastSessions ? "Aquí aparecerán las sesiones que tengas asignadas." : "Puedes marcar «Mostrar sesiones anteriores» para consultar las de días anteriores."}</p></div>
      ) : (
        <div className="attendance-layout">
          <aside className="attendance-sessions" aria-label={sessionsLabel}>
            <header><strong>{sessionsLabel}</strong><small>Selecciona una para pasar lista</small></header>
            <div>
              {visibleSessions.map((session) => (
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
                    {session.attendanceRole === "substitute"
                      ? <small className="attendance-delegation-label">Sustitución de {session.responsibleTeacherName}</small>
                      : session.substituteTeacherName && <small className="attendance-delegation-label">Sustituto: {session.substituteTeacherName}</small>}
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
                    {detail.session.attendanceRole === "substitute"
                      ? <p className="attendance-delegation-detail">Sustitución de {detail.session.responsibleTeacherName}</p>
                      : detail.session.substituteTeacherName && <p className="attendance-delegation-detail">Sustituto autorizado: {detail.session.substituteTeacherName} · {detail.session.substituteTeacherCode}</p>}
                  </div>
                  <div className="attendance-roster-head-actions">
                    {detail.session.canManageSubstitute && <button type="button" onClick={openSubstituteDialog} disabled={substituteSaving || modified}>{detail.session.substituteTeacherId ? "Cambiar sustituto" : "+ Nombrar sustituto"}</button>}
                    <button type="button" onClick={openAddStudent} disabled={studentSaving || modified}>+ Añadir alumno</button>
                    <strong>{attendedIds.size}<small>de {detail.students.length} presentes</small></strong>
                  </div>
                </header>

                {!detail.students.length ? (
                  <div className="attendance-no-students"><span>CSV</span><h3>No hay alumnado para esta sesión</h3><p>Carga el CSV de la asignatura y semestre desde Inicio o utiliza «Añadir alumno» para una incorporación puntual.</p></div>
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
                          <label htmlFor={`attendance-${student.id}`}><strong>{student.lastName}, {student.firstName}</strong><small>{student.email}{student.manuallyIncluded ? " · Sólo esta sesión" : ""}</small></label>
                          <div className="attendance-student-actions">
                            <em>{attendedIds.has(student.id) ? "Presente" : "Ausente"}</em>
                            <button
                              type="button"
                              className={student.rulesAccepted ? "accepted" : "pending"}
                              onClick={() => student.rulesAccepted ? setSignatureViewerStudent(student) : startCollectingSignatures(student)}
                            >
                              {student.rulesAccepted ? `Firmado ${acceptanceDate(student.rulesAcceptedAt)}` : "Normas pendientes"}
                            </button>
                            {student.manuallyIncluded && <button type="button" className="remove" disabled={studentSaving} onClick={() => void removeStudent(student)}>Retirar</button>}
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
      {detail && addStudentOpen && (
        <AddStudentDialog
          key={detail.session.id}
          session={detail.session}
          availableStudents={detail.availableStudents}
          busy={studentSaving}
          onClose={() => setAddStudentOpen(false)}
          onSave={addStudent}
        />
      )}
      {detail && substituteDialogOpen && (
        <SubstituteDialog
          key={`${detail.session.id}-${detail.session.substituteTeacherId ?? "none"}`}
          session={detail.session}
          teachers={teachers}
          busy={substituteSaving}
          onClose={() => setSubstituteDialogOpen(false)}
          onSave={saveSubstitute}
          onRemove={removeSubstitute}
        />
      )}
    </section>
  );
}
