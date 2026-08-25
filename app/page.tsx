"use client";

import { DragEvent as ReactDragEvent, FormEvent, Fragment, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { semesterDefinition, semesterFromDate, semesterOptions } from "../lib/semesters";
import { downloadSessionsIcs, downloadSessionsPdf } from "../lib/sessionExports";

type Section = "overview" | "laboratories" | "installations" | "practices" | "degrees" | "subjects" | "teachers" | "sessions";
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
  installationIds: number[];
  installationNames: string;
  laboratoryNames: string;
  installationCount: number;
  duration: number;
  riskLevel: string;
  subjectCount: number;
};

type Degree = {
  id: number;
  code: string;
  icsCode: string;
  name: string;
  level: string;
  subjectCount: number;
  subjectCodes: string[];
  subjectIds: number[];
};

type Subject = {
  id: number;
  code: string;
  abbreviation: string;
  name: string;
  degreeId: number;
  degreeCode: string;
  degreeName: string;
  practiceCount: number;
  practiceCodes: string[];
  practiceIds: number[];
};

type Teacher = {
  id: number;
  code: string;
  name: string;
  email: string;
  isAdmin: boolean;
  sessionCount: number;
};

type AuthenticatedTeacher = Pick<Teacher, "id" | "code" | "name" | "email" | "isAdmin">;

function compareTeachersBySurname(left: Teacher, right: Teacher) {
  const surname = (teacher: Teacher) => teacher.name.trim().replace(/^(?:\p{L}\.)+\s*/u, "");
  return surname(left).localeCompare(surname(right), "es", { sensitivity: "base" })
    || left.name.localeCompare(right.name, "es", { sensitivity: "base" })
    || left.code.localeCompare(right.code, "es", { sensitivity: "base" });
}

type Session = {
  id: number;
  sessionDate: string;
  startTime: string;
  duration: number;
  subjectId: number;
  subjectName: string;
  degreeId: number;
  degreeCode: string;
  degreeName: string;
  practiceId: number | null;
  practiceCode: string | null;
  practiceName: string | null;
  installationName: string | null;
  subjectCode: string;
  subjectAbbreviation: string;
  teacherId: number | null;
  teacherCode: string | null;
  teacherName: string | null;
  groupCode: string | null;
  degreePracticeIds?: number[];
};

type Holiday = {
  id: number;
  holidayDate: string;
  name: string;
};

type AcademicDayType = {
  date: string;
  dayType: "A" | "B";
};

type IcsPreviewGroup = {
  degreeCode: string;
  subjectCode: string;
  subjectName: string;
  groupCodes: string[];
  eventCount: number;
  firstDate: string;
  lastDate: string;
  existingSubjectId: number | null;
  existingSubjectCode: string | null;
  existingSubjectName: string | null;
  existingSubjectDegreeCode: string | null;
  existingSubjectDegreeName: string | null;
  existingDegreeId: number | null;
  existingDegreeCode: string | null;
  existingDegreeName: string | null;
};

type IcsPreview = {
  totalEvents: number;
  eligibleCount: number;
  holidayCount: number;
  holidayConflictCount: number;
  ignoredCount: number;
  invalidCount: number;
  duplicateCount: number;
  groups: IcsPreviewGroup[];
};

type IcsImportResult = {
  importedCount: number;
  existingCount: number;
  importedHolidayCount: number;
  existingHolidayCount: number;
  holidayConflictCount: number;
  ignoredCount: number;
  createdSubjectCount: number;
  createdDegreeCount: number;
};

function icsImportMessage(result: IcsImportResult) {
  const details = [
    result.importedCount === 0
      ? "No se importaron sesiones nuevas."
      : result.importedCount === 1
        ? "Se importó una sesión nueva sin práctica asignada."
        : `Se importaron ${result.importedCount} sesiones nuevas sin práctica asignada.`,
  ];
  const createdItems = [
    result.createdSubjectCount === 1
      ? "una asignatura"
      : result.createdSubjectCount > 1 ? `${result.createdSubjectCount} asignaturas` : "",
    result.createdDegreeCount === 1
      ? "un grado"
      : result.createdDegreeCount > 1 ? `${result.createdDegreeCount} grados` : "",
  ].filter(Boolean);
  const createdCount = result.createdSubjectCount + result.createdDegreeCount;
  if (createdItems.length) {
    details.push(`Se ${createdCount === 1 ? "creó" : "crearon"} automáticamente ${createdItems.join(" y ")}.`);
  }
  if (result.existingCount === 1) details.push("Una sesión ya estaba importada.");
  if (result.existingCount > 1) details.push(`${result.existingCount} sesiones ya estaban importadas.`);
  if (result.importedHolidayCount === 1) details.push("Se marcó un día como festivo.");
  if (result.importedHolidayCount > 1) details.push(`Se marcaron ${result.importedHolidayCount} días como festivos.`);
  if (result.existingHolidayCount === 1) details.push("Un día festivo ya estaba marcado.");
  if (result.existingHolidayCount > 1) details.push(`${result.existingHolidayCount} días festivos ya estaban marcados.`);
  if (result.holidayConflictCount === 1) details.push("No se importó una sesión porque coincidía con un día festivo.");
  if (result.holidayConflictCount > 1) details.push(`No se importaron ${result.holidayConflictCount} sesiones porque coincidían con días festivos.`);
  if (result.ignoredCount === 1) details.push("Se omitió un evento porque no era una práctica de laboratorio ni un día festivo.");
  if (result.ignoredCount > 1) details.push(`Se omitieron ${result.ignoredCount} eventos porque no eran prácticas de laboratorio ni días festivos.`);
  return `Importación completada. ${details.join(" ")}`;
}

type EntityRecord = Laboratory | Installation | Practice | Degree | Subject | Teacher | Session;

type AppData = {
  laboratories: Laboratory[];
  installations: Installation[];
  practices: Practice[];
  degrees: Degree[];
  subjects: Subject[];
  teachers: Teacher[];
  sessions: Session[];
  holidays: Holiday[];
  academicDayTypes: AcademicDayType[];
};

type CalendarFilters = {
  laboratoryId: string;
  installationId: string;
  degreeId: string;
  subjectId: string;
  practiceId: string;
};

type CalendarViewMode = "month" | "week" | "list";

type CalendarDropPreview = {
  date: string;
  startTime: string;
  top: number;
  height: number;
};

type SessionDeleteRequest = { ids: number[] } | { semesterId: string };

type WeeklySessionPosition = {
  session: Session;
  lane: number;
  laneCount: number;
};

const calendarWeekStartHour = 8;
const calendarWeekEndHour = 19;
const calendarWeekHourHeight = 64;
const calendarWeekDayCount = 5;
const calendarListDateFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function semesterDisplayTitle(semesterId: string) {
  const semester = semesterDefinition(semesterId);
  const [startYear, endYear] = semester.academicYear.split("-");
  return `Semestre ${semester.number} · Curso ${startYear.slice(-2)}-${endYear}`;
}

const emptyData: AppData = {
  laboratories: [],
  installations: [],
  practices: [],
  degrees: [],
  subjects: [],
  teachers: [],
  sessions: [],
  holidays: [],
  academicDayTypes: [],
};

const emptyCalendarFilters: CalendarFilters = {
  laboratoryId: "",
  installationId: "",
  degreeId: "",
  subjectId: "",
  practiceId: "",
};

const navigation: { key: Section; label: string; short: string }[] = [
  { key: "overview", label: "Vista general", short: "00" },
  { key: "sessions", label: "Calendario", short: "SES" },
  { key: "laboratories", label: "Laboratorios", short: "LAB" },
  { key: "installations", label: "Instalaciones", short: "INS" },
  { key: "practices", label: "Prácticas", short: "PRA" },
  { key: "degrees", label: "Grados", short: "GRA" },
  { key: "subjects", label: "Asignaturas", short: "ASI" },
  { key: "teachers", label: "Profesores", short: "PRO" },
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
    description: "Actividades docentes que utilizan una o varias instalaciones.",
  },
  degrees: {
    singular: "grado",
    plural: "Grados",
    description: "Programas académicos que contienen sus asignaturas docentes.",
  },
  subjects: {
    singular: "asignatura",
    plural: "Asignaturas",
    description: "Materias que pertenecen a un grado y agrupan prácticas de laboratorio.",
  },
  teachers: {
    singular: "profesor",
    plural: "Profesores",
    description: "Personal docente responsable de impartir las sesiones de laboratorio.",
  },
  sessions: {
    singular: "sesión",
    plural: "Sesiones",
    description: "Programación por día, hora, asignatura y profesor; las sesiones sin práctica quedan marcadas como incompletas.",
  },
};

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function apiUrl(path: string) {
  if (typeof window === "undefined") return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${normalizedPath}`;
}

function clientErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/expected pattern|failed to fetch|networkerror|load failed/i.test(message)) {
    return "No se pudo comunicar con la API de la aplicación. Recarga la página y vuelve a intentarlo.";
  }
  return message || fallback;
}

function preferredSemester(sessions: Session[], referenceDate: string) {
  const nextSession = [...sessions]
    .filter((session) => session.sessionDate > referenceDate)
    .sort((left, right) => left.sessionDate.localeCompare(right.sessionDate))[0];
  return semesterFromDate(nextSession?.sessionDate ?? referenceDate);
}

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function appendAcademicDayType(label: string, dayType?: "A" | "B") {
  return dayType ? `${label}-${dayType}` : label;
}

function academicWeekdayLabel(
  day: Date,
  date: string,
  dayTypesByDate: Map<string, "A" | "B">,
  weekday: "long" | "short" = "long",
) {
  return appendAcademicDayType(
    day.toLocaleDateString("es-ES", { weekday }),
    dayTypesByDate.get(date),
  );
}

function startOfCalendarWeek(date: Date) {
  const mondayOffset = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
}

function addCalendarDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function calendarSessionStartMinutes(session: Session) {
  const [hours, minutes] = session.startTime.split(":").map(Number);
  return hours * 60 + minutes;
}

function layoutOverlappingSessions(sessions: Session[]) {
  const ordered = [...sessions].sort((left, right) => (
    calendarSessionStartMinutes(left) - calendarSessionStartMinutes(right)
    || left.duration - right.duration
    || left.id - right.id
  ));
  const positioned: WeeklySessionPosition[] = [];
  let cluster: Session[] = [];
  let clusterEnd = -1;

  function placeCluster(items: Session[]) {
    const laneEnds: number[] = [];
    const assignments = items.map((session) => {
      const start = calendarSessionStartMinutes(session);
      const end = start + session.duration;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      return { session, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    positioned.push(...assignments.map((assignment) => ({ ...assignment, laneCount })));
  }

  for (const session of ordered) {
    const start = calendarSessionStartMinutes(session);
    if (cluster.length && start >= clusterEnd) {
      placeCluster(cluster);
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(session);
    clusterEnd = Math.max(clusterEnd, start + session.duration);
  }
  if (cluster.length) placeCluster(cluster);
  return positioned;
}

function initialDateForSemester(semesterId: string, sessions: Session[], referenceDate: string) {
  const definition = semesterDefinition(semesterId);
  const firstSession = [...sessions]
    .filter((session) => semesterFromDate(session.sessionDate) === semesterId)
    .sort((left, right) => left.sessionDate.localeCompare(right.sessionDate))[0];
  const targetDate = semesterFromDate(referenceDate) === semesterId
    ? referenceDate
    : firstSession?.sessionDate ?? definition.startDate;
  return parseLocalDate(targetDate);
}

function initialMonthForSemester(semesterId: string, sessions: Session[], referenceDate: string) {
  const date = initialDateForSemester(semesterId, sessions, referenceDate);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function initialWeekForSemester(semesterId: string, sessions: Session[], referenceDate: string) {
  return startOfCalendarWeek(initialDateForSemester(semesterId, sessions, referenceDate));
}

const initialForm = {
  code: "",
  abbreviation: "",
  email: "",
  isAdmin: false,
  password: "",
  name: "",
  location: "",
  manager: "",
  laboratoryId: "",
  category: "Docente",
  capacity: "24",
  status: "Operativa",
  installationIds: [] as number[],
  duration: "120",
  riskLevel: "Bajo",
  level: "Grado",
  icsCode: "",
  practiceIds: [] as number[],
  sessionDate: "",
  startTime: "09:00",
  degreeId: "",
  subjectId: "",
  teacherId: "",
  sessionPracticeId: "",
};

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}

function subscribeToBrowserLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function resetTokenFromBrowserLocation() {
  return new URLSearchParams(window.location.search).get("resetToken")?.trim() ?? "";
}

function LoginScreen({
  initialError,
  onLogin,
}: {
  initialError: string;
  onLogin: (teacher: AuthenticatedTeacher) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initialError);
  const [authMode, setAuthMode] = useState<"login" | "request" | "request-sent" | "reset" | "reset-done">("login");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetLinkDismissed, setResetLinkDismissed] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const resetToken = useSyncExternalStore(subscribeToBrowserLocation, resetTokenFromBrowserLocation, () => "");

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/auth/session"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json() as { teacher?: AuthenticatedTeacher; error?: string };
      if (!response.ok || !payload.teacher) throw new Error(payload.error || "No se pudo iniciar sesión.");
      setPassword("");
      await onLogin(payload.teacher);
    } catch (loginError) {
      setError(clientErrorMessage(loginError, "No se pudo iniciar sesión."));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/auth/password-reset/request"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo solicitar el enlace de recuperación.");
      setAuthMode("request-sent");
    } catch (recoveryError) {
      setError(clientErrorMessage(recoveryError, "No se pudo solicitar el enlace de recuperación."));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(apiUrl("/api/auth/password-reset/reset"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo actualizar la contraseña.");
      setNewPassword("");
      setConfirmPassword("");
      window.history.replaceState({}, "", window.location.pathname);
      setAuthMode("reset-done");
    } catch (resetError) {
      setError(clientErrorMessage(resetError, "No se pudo actualizar la contraseña."));
    } finally {
      setSubmitting(false);
    }
  }

  function showRecovery() {
    setRecoveryEmail(email);
    setError("");
    setAuthMode("request");
  }

  function showLogin() {
    window.history.replaceState({}, "", window.location.pathname);
    setAuthMode("login");
    setResetLinkDismissed(true);
    setError("");
  }

  const visibleAuthMode = resetToken && !resetLinkDismissed && authMode === "login" ? "reset" : authMode;
  const recoveringPassword = visibleAuthMode !== "login";
  const authTitle = visibleAuthMode === "login"
    ? "Iniciar sesión"
    : visibleAuthMode === "reset" ? "Nueva contraseña" : "Recuperar acceso";

  return (
    <main className="login-page">
      <section className={recoveringPassword ? "login-panel recovery" : "login-panel"} aria-labelledby="login-title">
        <div className="login-brand"><span>N</span>NEXO<em>LAB</em></div>
        <div>
          <span className="section-kicker">Gestión docente</span>
          <h1 id="login-title">{authTitle}</h1>
          <p>{visibleAuthMode === "login"
            ? "Accede con el correo electrónico asociado a tu ficha de profesor."
            : visibleAuthMode === "reset"
              ? "Elige una contraseña nueva para volver a acceder a Nexo Lab."
              : "Solicita un enlace seguro en el correo asociado a tu ficha."}</p>
        </div>
        {error && <div className="login-error" role="alert"><span>!</span><p>{error}</p></div>}
        {visibleAuthMode === "request-sent" && (
          <div className="recovery-result" role="status">
            <span aria-hidden="true">✓</span>
            <h2>Revisa tu correo</h2>
            <p>Si la dirección está registrada, recibirás un enlace válido durante 30 minutos. Revisa también la carpeta de correo no deseado.</p>
            <button className="login-link-button" type="button" onClick={showLogin}>Volver al inicio de sesión</button>
          </div>
        )}
        {visibleAuthMode === "reset-done" && (
          <div className="recovery-result" role="status">
            <span aria-hidden="true">✓</span>
            <h2>Contraseña actualizada</h2>
            <p>Ya puedes iniciar sesión con tu nueva contraseña. Los accesos anteriores se han cerrado por seguridad.</p>
            <button className="primary-button recovery-login-button" type="button" onClick={showLogin}>Iniciar sesión<ArrowIcon /></button>
          </div>
        )}
        {visibleAuthMode === "reset" && (
          <form className="login-form recovery-form" onSubmit={submitNewPassword}>
            <label>
              <span>Nueva contraseña</span>
              <input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="12 caracteres como mínimo" />
            </label>
            <label>
              <span>Repite la nueva contraseña</span>
              <input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="La misma contraseña" />
            </label>
            <p className="recovery-help">El enlace es de un solo uso. Al guardar la nueva contraseña se cerrarán las sesiones que estuvieran abiertas.</p>
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Guardando…" : "Guardar contraseña"}<ArrowIcon /></button>
          </form>
        )}
        {visibleAuthMode === "request" && (
          <form className="login-form recovery-form" onSubmit={submitRecovery}>
            <label>
              <span>Correo electrónico</span>
              <input required type="email" autoComplete="username" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="nombre@unizar.es" />
            </label>
            <p className="recovery-help">Recibirás un enlace de un solo uso para elegir una nueva contraseña. Nexo Lab nunca envía contraseñas por correo.</p>
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Enviando…" : "Enviar enlace"}<ArrowIcon /></button>
            <button className="login-link-button" type="button" onClick={showLogin}>Volver al inicio de sesión</button>
          </form>
        )}
        {visibleAuthMode === "login" && (
          <form className="login-form" onSubmit={submitLogin}>
            <label>
              <span>Correo electrónico</span>
              <input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@unizar.es" />
            </label>
            <label>
              <span>Contraseña</span>
              <input required type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" />
            </label>
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Accediendo…" : "Entrar"}<ArrowIcon /></button>
            <button className="login-link-button" type="button" onClick={showRecovery}>He olvidado mi contraseña</button>
          </form>
        )}
      </section>
      <aside className="login-art" aria-hidden="true"><span>LAB</span><strong>Planifica.<br />Coordina.<br />Enseña.</strong></aside>
    </main>
  );
}

export default function Home() {
  const [authenticatedTeacher, setAuthenticatedTeacher] = useState<AuthenticatedTeacher | null>(null);
  const [authenticationChecked, setAuthenticationChecked] = useState(false);
  const [authenticationError, setAuthenticationError] = useState("");
  const [data, setData] = useState<AppData>(emptyData);
  const [active, setActive] = useState<Section>("overview");
  const [drawer, setDrawer] = useState<Entity | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState(() => semesterFromDate(localIsoDate()));
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function loadData() {
    try {
      const response = await fetch(apiUrl("/api/data"), { cache: "no-store" });
      const payload = (await response.json()) as AppData & { error?: string };
      if (response.status === 401) setAuthenticatedTeacher(null);
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar los datos.");
      setData(payload);
    } catch (error) {
      setNotice({
        kind: "error",
        message: clientErrorMessage(error, "No se pudieron cargar los datos."),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const sessionResponse = await fetch(apiUrl("/api/auth/session"), { cache: "no-store" });
        if (sessionResponse.status === 401) return;
        const sessionPayload = await sessionResponse.json() as { teacher?: AuthenticatedTeacher; error?: string };
        if (!sessionResponse.ok || !sessionPayload.teacher) {
          throw new Error(sessionPayload.error || "No se pudo comprobar la sesión.");
        }
        const response = await fetch(apiUrl("/api/data"), { cache: "no-store" });
        const payload = (await response.json()) as AppData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "No se pudieron cargar los datos.");
        if (active) {
          setAuthenticatedTeacher(sessionPayload.teacher);
          setData(payload);
          setSelectedSemester(preferredSemester(payload.sessions, localIsoDate()));
        }
      } catch (error) {
        if (active) {
          setAuthenticationError(clientErrorMessage(error, "No se pudo comprobar el acceso."));
        }
      } finally {
        if (active) {
          setAuthenticationChecked(true);
          setLoading(false);
        }
      }
    }

    void loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  async function finishLogin(teacher: AuthenticatedTeacher) {
    setAuthenticatedTeacher(teacher);
    setAuthenticationError("");
    setLoading(true);
    await loadData();
  }

  async function logout() {
    try {
      await fetch(apiUrl("/api/auth/session"), { method: "DELETE" });
    } finally {
      setAuthenticatedTeacher(null);
      setData(emptyData);
      setDrawer(null);
      setNotice(null);
    }
  }

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
      subjects: data.subjects.filter(matches),
      teachers: data.teachers.filter(matches),
      sessions: data.sessions.filter(matches),
      holidays: data.holidays,
      academicDayTypes: data.academicDayTypes,
    };
  }, [data, search]);

  const counts = {
    laboratories: data.laboratories.length,
    installations: data.installations.length,
    practices: data.practices.length,
    degrees: data.degrees.length,
    subjects: data.subjects.length,
    teachers: data.teachers.length,
    sessions: data.sessions.filter((session) => semesterFromDate(session.sessionDate) === selectedSemester).length,
  };

  const sessionSubjectOptions = data.subjects.filter((subject) => (
    String(subject.degreeId) === form.degreeId
    && (editingId !== null || subject.practiceIds.length > 0)
  ));
  const selectedSessionSubject = data.subjects.find((subject) => String(subject.id) === form.subjectId);
  const sessionPracticeOptions = data.practices.filter((practice) => selectedSessionSubject?.practiceIds.includes(practice.id));
  const editingSession = editingId === null ? undefined : data.sessions.find((session) => session.id === editingId);
  const selectedSessionHoliday = data.holidays.find((holiday) => holiday.holidayDate === form.sessionDate);
  const sessionDateBlocked = drawer === "sessions" && Boolean(
    selectedSessionHoliday
    && (editingId === null || editingSession?.sessionDate !== form.sessionDate)
  );

  function openCreate(entity: Entity) {
    if (!authenticatedTeacher?.isAdmin) return;
    const schedulableSubject = data.subjects.find((subject) => subject.practiceIds.length > 0);
    setForm({
      ...initialForm,
      laboratoryId: data.laboratories[0]?.id.toString() ?? "",
      installationIds: entity === "practices" && data.installations[0] ? [data.installations[0].id] : [],
      sessionDate: localIsoDate(),
      degreeId: (entity === "subjects" ? data.degrees[0]?.id : schedulableSubject?.degreeId)?.toString() ?? "",
      subjectId: schedulableSubject?.id.toString() ?? "",
      teacherId: data.teachers[0]?.id.toString() ?? "",
      sessionPracticeId: schedulableSubject?.practiceIds[0]?.toString() ?? "",
    });
    setEditingId(null);
    setNotice(null);
    setDrawer(entity);
  }

  function openEdit(entity: Entity, item: EntityRecord) {
    if (!authenticatedTeacher?.isAdmin) return;
    if (entity === "laboratories") {
      const laboratory = item as Laboratory;
      setForm({
        ...initialForm,
        code: laboratory.code,
        name: laboratory.name,
        location: laboratory.location,
        manager: laboratory.manager,
      });
    } else if (entity === "installations") {
      const installation = item as Installation;
      setForm({
        ...initialForm,
        code: installation.code,
        name: installation.name,
        laboratoryId: String(installation.laboratoryId),
        category: installation.category,
        capacity: String(installation.capacity),
        status: installation.status,
      });
    } else if (entity === "practices") {
      const practice = item as Practice;
      setForm({
        ...initialForm,
        code: practice.code,
        name: practice.name,
        installationIds: practice.installationIds,
        duration: String(practice.duration),
        riskLevel: practice.riskLevel,
      });
    } else if (entity === "degrees") {
      const degree = item as Degree;
      setForm({
        ...initialForm,
        code: degree.code,
        icsCode: degree.icsCode,
        name: degree.name,
        level: degree.level,
      });
    } else if (entity === "subjects") {
      const subject = item as Subject;
      setForm({
        ...initialForm,
        code: subject.code,
        abbreviation: subject.abbreviation,
        name: subject.name,
        degreeId: String(subject.degreeId),
        practiceIds: subject.practiceIds,
      });
    } else if (entity === "teachers") {
      const teacher = item as Teacher;
      setForm({
        ...initialForm,
        code: teacher.code,
        name: teacher.name,
        email: teacher.email,
        isAdmin: teacher.isAdmin,
      });
    } else {
      const session = item as Session;
      setForm({
        ...initialForm,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        duration: String(session.duration),
        degreeId: String(session.degreeId),
        subjectId: String(session.subjectId),
        teacherId: session.teacherId?.toString() ?? "",
        sessionPracticeId: session.practiceId?.toString() ?? "",
      });
    }

    setEditingId(item.id);
    setNotice(null);
    setDrawer(entity);
  }

  async function submitEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!drawer || !authenticatedTeacher?.isAdmin) return;
    if (sessionDateBlocked) {
      setNotice({ kind: "error", message: "No se puede crear ni mover una sesión a un día festivo." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(apiUrl("/api/data"), {
        method: editingId === null ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: drawer,
          id: editingId,
          ...form,
          practiceId: drawer === "sessions" ? form.sessionPracticeId : undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar el registro.");
      setDrawer(null);
      await loadData();
      setActive(drawer);
      setNotice({
        kind: "success",
        message: `El registro se ha ${editingId === null ? "creado" : "actualizado"} correctamente.`,
      });
      setEditingId(null);
    } catch (error) {
      setNotice({
        kind: "error",
        message: clientErrorMessage(error, "No se pudo guardar el registro."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntity(entity: Entity, id: number, label: string) {
    if (!authenticatedTeacher?.isAdmin) return;
    if (!window.confirm(`¿Eliminar “${label}”? Esta acción no se puede deshacer.`)) return;
    setNotice(null);
    try {
      const response = await fetch(apiUrl("/api/data"), {
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
        message: clientErrorMessage(error, "No se pudo eliminar el registro."),
      });
    }
  }

  async function deleteSessions(request: SessionDeleteRequest, confirmation: string) {
    if (!authenticatedTeacher?.isAdmin) return false;
    if (!window.confirm(`${confirmation}\n\nEsta acción no se puede deshacer.`)) return false;
    setNotice(null);
    try {
      const response = await fetch(apiUrl("/api/data"), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: "sessions", ...request }),
      });
      const payload = (await response.json()) as { deletedCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudieron borrar las sesiones.");
      await loadData();
      const deletedCount = payload.deletedCount ?? 0;
      setNotice({
        kind: "success",
        message: deletedCount === 1 ? "Se ha borrado una sesión." : `Se han borrado ${deletedCount} sesiones.`,
      });
      return true;
    } catch (error) {
      setNotice({ kind: "error", message: clientErrorMessage(error, "No se pudieron borrar las sesiones.") });
      return false;
    }
  }

  async function assignPracticeToSessions(ids: number[], practiceId: number | null) {
    if (!authenticatedTeacher?.isAdmin) return false;
    setNotice(null);
    try {
      const response = await fetch(apiUrl("/api/data"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: "sessions", ids, practiceId }),
      });
      const payload = await response.json() as { error?: string; updatedCount?: number; linkedSubjectCount?: number };
      if (!response.ok) throw new Error(payload.error || "No se pudo cambiar la práctica.");
      const practice = data.practices.find((item) => item.id === practiceId);
      await loadData();
      setNotice({
        kind: "success",
        message: practiceId === null
          ? `${payload.updatedCount ?? ids.length} sesiones marcadas como incompletas.`
          : `${payload.updatedCount ?? ids.length} sesiones asignadas a ${practice?.code ?? "la práctica seleccionada"}.${payload.linkedSubjectCount ? ` La práctica se ha vinculado también a ${payload.linkedSubjectCount} ${payload.linkedSubjectCount === 1 ? "asignatura" : "asignaturas"}.` : ""}`,
      });
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: clientErrorMessage(error, "No se pudo cambiar la práctica."),
      });
      return false;
    }
  }

  async function assignTeacherToSessions(ids: number[], teacherId: number | null) {
    if (!authenticatedTeacher?.isAdmin) return false;
    setNotice(null);
    try {
      const response = await fetch(apiUrl("/api/data"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: "sessions", action: "assign-teacher", ids, teacherId }),
      });
      const payload = await response.json() as { error?: string; updatedCount?: number };
      if (!response.ok) throw new Error(payload.error || "No se pudo cambiar el profesor.");
      const teacher = data.teachers.find((item) => item.id === teacherId);
      const updatedCount = payload.updatedCount ?? ids.length;
      await loadData();
      setNotice({
        kind: "success",
        message: teacherId === null
          ? updatedCount === 1 ? "La sesión se ha dejado sin profesor asignado." : `${updatedCount} sesiones se han dejado sin profesor asignado.`
          : updatedCount === 1 ? `La sesión se ha asignado a ${teacher?.code ?? "el profesor seleccionado"}.` : `${updatedCount} sesiones se han asignado a ${teacher?.code ?? "el profesor seleccionado"}.`,
      });
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: clientErrorMessage(error, "No se pudo cambiar el profesor."),
      });
      return false;
    }
  }

  async function moveSession(id: number, sessionDate: string, startTime: string) {
    if (!authenticatedTeacher?.isAdmin) return false;
    setNotice(null);
    try {
      const response = await fetch(apiUrl("/api/data"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: "sessions", action: "move", id, sessionDate, startTime }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo mover la sesión.");
      await loadData();
      setNotice({ kind: "success", message: `Sesión movida al ${sessionDate} a las ${startTime}.` });
      return true;
    } catch (error) {
      setNotice({ kind: "error", message: clientErrorMessage(error, "No se pudo mover la sesión.") });
      return false;
    }
  }

  function showSection(section: Section) {
    setActive(section);
    setSearch("");
  }

  async function finishIcsImport(result: IcsImportResult) {
    setImportOpen(false);
    await loadData();
    setActive("sessions");
    setNotice({
      kind: "success",
      message: icsImportMessage(result),
    });
  }

  const activeTitle = active === "overview" ? "Vista general" : entityCopy[active].plural;

  if (!authenticationChecked) {
    return <div className="auth-loading" role="status"><span />Comprobando el acceso…</div>;
  }

  if (!authenticatedTeacher) {
    return <LoginScreen initialError={authenticationError} onLogin={finishLogin} />;
  }

  return (
    <div className={authenticatedTeacher.isAdmin ? "app-shell" : "app-shell read-only"}>
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
            <div className="account-summary">
              <span className="profile-button" aria-hidden="true">{authenticatedTeacher.code}</span>
              <span><strong>{authenticatedTeacher.name}</strong><small>{authenticatedTeacher.isAdmin ? "Administrador" : "Solo lectura"} · {authenticatedTeacher.email}</small></span>
              <button type="button" onClick={logout}>Salir</button>
            </div>
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
            <Overview
              data={data}
              canEdit={authenticatedTeacher.isAdmin}
              selectedSemester={selectedSemester}
              onSelectedSemesterChange={setSelectedSemester}
              onAssignPractice={assignPracticeToSessions}
              onAssignTeacher={assignTeacherToSessions}
              onDeleteSessions={deleteSessions}
            />
          ) : (
            <EntityView
              entity={active}
              canEdit={authenticatedTeacher.isAdmin}
              data={filtered}
              catalog={data}
              search={search}
              dependencyMissing={
                active === "installations"
                  ? data.laboratories.length === 0
                  : active === "practices"
                    ? data.installations.length === 0
                    : active === "subjects"
                      ? data.degrees.length === 0
                    : active === "sessions"
                      ? !data.subjects.some((subject) => subject.practiceIds.length > 0) || data.teachers.length === 0
                      : false
              }
              onCreate={openCreate}
              onEdit={openEdit}
              onDelete={deleteEntity}
              onImport={() => setImportOpen(true)}
              onAssignPractice={assignPracticeToSessions}
              onAssignTeacher={assignTeacherToSessions}
              onMoveSession={moveSession}
              onDeleteSessions={deleteSessions}
              selectedSemester={selectedSemester}
              onSelectedSemesterChange={setSelectedSemester}
            />
          )}
        </div>
      </main>

      {drawer && authenticatedTeacher.isAdmin && (
        <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDrawer(null)}>
          <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            <div className="drawer-head">
              <div>
                <span className="entity-pill">{navigation.find((item) => item.key === drawer)?.short}</span>
                <h2 id="drawer-title">{editingId === null ? (["installations", "practices", "subjects", "sessions"].includes(drawer) ? "Nueva" : "Nuevo") : "Editar"} {entityCopy[drawer].singular}</h2>
                <p>{entityCopy[drawer].description}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setDrawer(null)} aria-label="Cerrar formulario">×</button>
            </div>

            <form className="entity-form" onSubmit={submitEntity}>
              {drawer !== "sessions" && (
                <div className="field-row">
                  <label>
                    <span>Código</span>
                    <input required maxLength={12} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder={drawer === "laboratories" ? "LAB-04" : drawer === "installations" ? "INS-05" : drawer === "practices" ? "PRA-06" : drawer === "subjects" ? "30013" : drawer === "teachers" ? "PRO-04" : "GRA-04"} />
                  </label>
                  <label>
                    <span>Nombre</span>
                    <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre descriptivo" />
                  </label>
                </div>
              )}

              {drawer === "teachers" && (
                <>
                  <label>
                    <span>Correo electrónico</span>
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      placeholder="nombre@universidad.es"
                    />
                  </label>
                  <label className="permission-checkbox" htmlFor="teacher-is-admin">
                    <input
                      id="teacher-is-admin"
                      type="checkbox"
                      checked={form.isAdmin}
                      onChange={(event) => setForm({ ...form, isAdmin: event.target.checked })}
                    />
                    <span>
                      Administrador
                      <small>Puede crear, editar, borrar e importar datos.</small>
                    </span>
                  </label>
                  <label>
                    <span>{editingId === null ? "Contraseña" : "Nueva contraseña"} {editingId !== null && <small>(opcional)</small>}</span>
                    <input
                      required={editingId === null}
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                      placeholder={editingId === null ? "12 caracteres como mínimo" : "Déjala vacía para conservar la actual"}
                    />
                  </label>
                </>
              )}

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
                  <fieldset className="practice-picker">
                    <legend>Instalaciones que utiliza <small>Una o más</small></legend>
                    {data.installations.map((installation) => (
                      <label key={installation.id}>
                        <input
                          type="checkbox"
                          checked={form.installationIds.includes(installation.id)}
                          onChange={(event) => setForm({
                            ...form,
                            installationIds: event.target.checked
                              ? [...form.installationIds, installation.id]
                              : form.installationIds.filter((id) => id !== installation.id),
                          })}
                        />
                        <span><strong>{installation.code}</strong>{installation.name}</span>
                      </label>
                    ))}
                  </fieldset>
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
                <div className="field-row">
                  <label>
                    <span>Nivel</span>
                    <select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                      <option>Grado</option><option>Máster</option><option>Doctorado</option>
                    </select>
                  </label>
                  <label>
                    <span>Código ICS</span>
                    <input required inputMode="numeric" pattern="[0-9]{3}" maxLength={3} value={form.icsCode} onChange={(event) => setForm({ ...form, icsCode: event.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="300" />
                  </label>
                </div>
              )}

              {drawer === "subjects" && (
                <>
                  <label>
                    <span>Abreviatura (opcional)</span>
                    <input maxLength={16} value={form.abbreviation} onChange={(event) => setForm({ ...form, abbreviation: event.target.value.toUpperCase() })} placeholder="MF" />
                  </label>
                  <label>
                    <span>Grado al que pertenece</span>
                    <select required value={form.degreeId} onChange={(event) => setForm({ ...form, degreeId: event.target.value })}>
                      <option value="">Selecciona un grado</option>
                      {data.degrees.map((degree) => <option key={degree.id} value={degree.id}>{degree.code} · {degree.name}</option>)}
                    </select>
                  </label>
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

              {drawer === "sessions" && (
                <>
                  <div className="field-row">
                    <label>
                      <span>Día</span>
                      <input required type="date" aria-invalid={sessionDateBlocked} value={form.sessionDate} onChange={(event) => setForm({ ...form, sessionDate: event.target.value })} />
                    </label>
                    <label>
                      <span>Hora</span>
                      <input required type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
                    </label>
                  </div>
                  {sessionDateBlocked && <p className="session-holiday-warning" role="alert">Esta fecha es festiva. Elige otro día para programar la sesión.</p>}
                  <label>
                    <span>Duración (min)</span>
                    <input required min="15" step="15" type="number" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} />
                  </label>
                  <label>
                    <span>Grado</span>
                    <select
                      required
                      value={form.degreeId}
                      onChange={(event) => {
                        const subject = data.subjects.find((item) => (
                          String(item.degreeId) === event.target.value
                          && (editingId !== null || item.practiceIds.length > 0)
                        ));
                        const practiceId = subject?.practiceIds[0];
                        const practice = data.practices.find((item) => item.id === practiceId);
                        setForm({
                          ...form,
                          degreeId: event.target.value,
                          subjectId: subject?.id.toString() ?? "",
                          sessionPracticeId: practiceId?.toString() ?? "",
                          duration: editingId !== null && practice ? String(practice.duration) : form.duration,
                        });
                      }}
                    >
                      <option value="">Selecciona un grado</option>
                      {data.degrees.filter((degree) => data.subjects.some((subject) => (
                        subject.degreeId === degree.id
                        && (editingId !== null || subject.practiceIds.length > 0)
                      ))).map((degree) => (
                        <option key={degree.id} value={degree.id}>{degree.code} · {degree.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Asignatura</span>
                    <select
                      required
                      value={form.subjectId}
                      onChange={(event) => {
                        const subject = data.subjects.find((item) => String(item.id) === event.target.value);
                        const practiceId = subject?.practiceIds[0];
                        const practice = data.practices.find((item) => item.id === practiceId);
                        setForm({
                          ...form,
                          subjectId: event.target.value,
                          sessionPracticeId: practiceId?.toString() ?? "",
                          duration: editingId !== null && practice ? String(practice.duration) : form.duration,
                        });
                      }}
                    >
                      <option value="">Selecciona una asignatura</option>
                      {sessionSubjectOptions.map((subject) => (
                        <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Práctica{editingId !== null && " (opcional)"}</span>
                    <select
                      required={editingId === null}
                      value={form.sessionPracticeId}
                      onChange={(event) => {
                        const practice = data.practices.find((item) => String(item.id) === event.target.value);
                        setForm({
                          ...form,
                          sessionPracticeId: event.target.value,
                          duration: editingId !== null && practice ? String(practice.duration) : form.duration,
                        });
                      }}
                    >
                      <option value="">{editingId === null ? "Selecciona una práctica de la asignatura" : "Sin práctica asignada"}</option>
                      {sessionPracticeOptions.map((practice) => (
                        <option key={practice.id} value={practice.id}>{practice.code} · {practice.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Profesor{editingId !== null && " (opcional)"}</span>
                    <select required={editingId === null} value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })}>
                      <option value="">{editingId === null ? "Selecciona un profesor" : "Sin profesor asignado"}</option>
                      {data.teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>{teacher.code} · {teacher.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <div className="form-summary">
                <span aria-hidden="true">i</span>
                <p>Los vínculos se guardan automáticamente en la jerarquía del sistema.</p>
              </div>
              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={() => setDrawer(null)}>Cancelar</button>
                <button className="primary-button" type="submit" disabled={saving || sessionDateBlocked}>{saving ? "Guardando…" : `${editingId === null ? "Crear" : "Guardar"} ${entityCopy[drawer].singular}`}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {importOpen && authenticatedTeacher.isAdmin && (
        <IcsImportDialog
          data={data}
          onClose={() => setImportOpen(false)}
          onImported={finishIcsImport}
        />
      )}
    </div>
  );
}

function SessionListColumns({ session }: { session: Session }) {
  return (
    <>
      <time className="calendar-list-time" dateTime={`${session.sessionDate}T${session.startTime}`}>
        <strong>{session.startTime.replace(/^0/, "")}</strong>
        <small>{session.duration} min · {session.groupCode ? `G${session.groupCode}` : "G—"}</small>
      </time>
      <span className="calendar-list-practice">
        <span className="calendar-list-practice-title">
          <strong>{session.practiceName ?? "Sin práctica"}</strong>
          {session.practiceId === null && <em>Incompleta</em>}
        </span>
        <small>{session.practiceCode ?? "—"}{session.installationName ? ` · ${session.installationName}` : ""}</small>
      </span>
      <span className="calendar-list-subject">
        <strong>{session.subjectAbbreviation || session.subjectCode}-{session.degreeCode}</strong>
        <small>{session.subjectName}</small>
      </span>
      <span className="calendar-list-teacher">
        <strong className={session.teacherCode ? undefined : "session-teacher-unassigned"}>Prof. {session.teacherCode ?? "sin asignar"}</strong>
        <small>{session.teacherName ?? "Profesor sin asignar"}</small>
      </span>
    </>
  );
}

function practicesAvailableToSessions({
  sessions,
  practices,
  subjects,
}: {
  sessions: Session[];
  practices: Practice[];
  subjects: Subject[];
}) {
  return practices.filter((practice) => (
    sessions.length > 0 && sessions.every((session) => {
      const directPracticeIds = session.degreePracticeIds?.map(Number) ?? [];
      if (directPracticeIds.length) return directPracticeIds.includes(practice.id);
      return subjects.some((subject) => (
        Number(subject.degreeId) === Number(session.degreeId)
        && subject.practiceIds.some((practiceId) => Number(practiceId) === practice.id)
      ));
    })
  ));
}

function SessionSelectionActions({
  sessions,
  practices,
  subjects,
  teachers,
  canEdit,
  assigning,
  deleting,
  onAssignTeacher,
  onAssignPractice,
  onDelete,
  onClear,
}: {
  sessions: Session[];
  practices: Practice[];
  subjects: Subject[];
  teachers: Teacher[];
  canEdit: boolean;
  assigning: boolean;
  deleting: boolean;
  onAssignTeacher: (teacherId: number | null) => void;
  onAssignPractice: (practiceId: number | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const degreePractices = practicesAvailableToSessions({ sessions, practices, subjects });

  return (
    <div className="session-selection-actions" aria-label="Acciones para las sesiones seleccionadas">
      {canEdit && (
        <>
          <label>
            <span>Práctica</span>
            <select
              aria-label="Asignar práctica a la selección"
              value=""
              disabled={assigning}
              onChange={(event) => {
                if (!event.target.value) return;
                onAssignPractice(event.target.value === "none" ? null : Number(event.target.value));
              }}
            >
              <option value="">Asignar práctica…</option>
              <option value="none">Sin práctica</option>
              {degreePractices.map((practice) => (
                <option key={practice.id} value={practice.id}>{practice.code} · {practice.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Profesor</span>
            <select
              aria-label="Asignar profesor a la selección"
              value=""
              disabled={assigning}
              onChange={(event) => {
                if (!event.target.value) return;
                onAssignTeacher(event.target.value === "none" ? null : Number(event.target.value));
              }}
            >
              <option value="">Asignar profesor…</option>
              <option value="none">Sin profesor</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.code} · {teacher.name}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <button className="export-action" type="button" onClick={() => downloadSessionsIcs(sessions)}>Exportar ICS</button>
      <button
        className="export-action"
        type="button"
        onClick={() => void downloadSessionsPdf(sessions).catch(() => window.alert("No se ha podido generar el PDF."))}
      >
        Exportar PDF
      </button>
      <button type="button" onClick={onClear}>Limpiar selección</button>
      {canEdit && <button className="danger-action" type="button" disabled={deleting} onClick={onDelete}>Borrar selección</button>}
    </div>
  );
}

function OverviewSessionsList({
  headingPrefix,
  ariaLabel,
  emptyMessage,
  sessions,
  dayTypesByDate,
  selectedIds,
  onSelect,
}: {
  headingPrefix: string;
  ariaLabel: string;
  emptyMessage: string;
  sessions: Session[];
  dayTypesByDate: Map<string, "A" | "B">;
  selectedIds: Set<number>;
  onSelect: (session: Session, event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  if (!sessions.length) {
    return <p className="overview-session-empty">{emptyMessage}</p>;
  }

  const sessionsByDate = new Map<string, Session[]>();
  for (const session of sessions) {
    const dateSessions = sessionsByDate.get(session.sessionDate) ?? [];
    dateSessions.push(session);
    sessionsByDate.set(session.sessionDate, dateSessions);
  }

  return (
    <div className="calendar-list overview-session-list" aria-label={ariaLabel}>
      {[...sessionsByDate.entries()].map(([date, dateSessions]) => {
        const day = parseLocalDate(date);
        const dayNumber = day.toLocaleDateString("es-ES", { day: "numeric" });
        const month = day.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
        const weekday = academicWeekdayLabel(day, date, dayTypesByDate);
        const headingId = `${headingPrefix}-day-${date}`;
        return (
          <section className="calendar-list-day" key={date} aria-labelledby={headingId}>
            <header className="calendar-list-day-header">
              <time dateTime={date}>
                <span className="calendar-list-day-number">{dayNumber}</span>
                <span className="calendar-list-day-copy">
                  <strong id={headingId}>{weekday}</strong>
                  <small>{month} {day.getFullYear()}</small>
                </span>
              </time>
              <span>{dateSessions.length} {dateSessions.length === 1 ? "sesión" : "sesiones"}</span>
            </header>
            <div className="calendar-list-day-sessions" role="list">
              {dateSessions.map((session) => (
                <article
                  className={`calendar-list-session overview-session-row${session.practiceId === null ? " incomplete" : ""}${selectedIds.has(session.id) ? " selected" : ""}`}
                  key={session.id}
                  role="listitem"
                >
                  <span className="calendar-list-select-indicator" aria-hidden="true">{selectedIds.has(session.id) ? "✓" : ""}</span>
                  <button
                    className="calendar-list-main"
                    type="button"
                    aria-pressed={selectedIds.has(session.id)}
          aria-label={`Seleccionar ${session.practiceName || "sesión sin práctica"} del ${calendarListDateFormatter.format(parseLocalDate(session.sessionDate))} a las ${session.startTime}, ${session.groupCode ? `grupo ${session.groupCode}` : "sin grupo"}`}
                    onClick={(event) => onSelect(session, event)}
                    title="Clic para seleccionar · Shift + clic para ampliar el rango"
                  >
                    <SessionListColumns session={session} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function OverviewSubjectSessions({
  subjectId,
  sessions,
  dayTypesByDate,
  selectedIds,
  onSelect,
}: {
  subjectId: number;
  sessions: Session[];
  dayTypesByDate: Map<string, "A" | "B">;
  selectedIds: Set<number>;
  onSelect: (session: Session, event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <OverviewSessionsList
      headingPrefix={`overview-subject-${subjectId}`}
      ariaLabel="Sesiones de la asignatura ordenadas cronológicamente"
      emptyMessage="Esta asignatura no tiene sesiones en el semestre seleccionado."
      sessions={sessions}
      dayTypesByDate={dayTypesByDate}
      selectedIds={selectedIds}
      onSelect={onSelect}
    />
  );
}

function normalizedSessionSubgroup(session: Session) {
  return (session.groupCode?.trim() ?? "").replace(/^G(?=\d)/i, "").toUpperCase();
}

function firstUnassignedSessionPerSubgroup(sessions: Session[]) {
  const firstSessionBySubgroup = new Map<string, Session>();
  const orderedSessions = [...sessions].sort((left, right) => (
    left.sessionDate.localeCompare(right.sessionDate)
    || left.startTime.localeCompare(right.startTime)
    || left.id - right.id
  ));

  for (const session of orderedSessions) {
    if (session.practiceId !== null) continue;
    const subgroup = normalizedSessionSubgroup(session);
    if (!subgroup || firstSessionBySubgroup.has(subgroup)) continue;
    firstSessionBySubgroup.set(subgroup, session);
  }

  return [...firstSessionBySubgroup.values()];
}

function OverviewGroupedSubjectSessions({
  subjectId,
  sessions,
  dayTypesByDate,
  selectedIds,
  onSelect,
}: {
  subjectId: number;
  sessions: Session[];
  dayTypesByDate: Map<string, "A" | "B">;
  selectedIds: Set<number>;
  onSelect: (session: Session, event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  if (!sessions.length) {
    return <p className="overview-session-empty">Esta asignatura no tiene sesiones en el semestre seleccionado.</p>;
  }

  type GroupSchedule = {
    weekday: string;
    weekdayIndex: number;
    startTime: string;
    endTime: string;
    dayTypes: Set<"A" | "B">;
    hasUntypedDays: boolean;
  };
  type SessionGroup = {
    groupCode: string;
    schedulesByKey: Map<string, GroupSchedule>;
    sessions: Session[];
  };
  const sessionsByGroup = new Map<string, SessionGroup>();
  for (const session of sessions) {
    const groupCode = normalizedSessionSubgroup(session);
    const groupKey = groupCode || "__unassigned__";
    const group: SessionGroup = sessionsByGroup.get(groupKey) ?? {
      groupCode,
      schedulesByKey: new Map<string, GroupSchedule>(),
      sessions: [],
    };
    const day = parseLocalDate(session.sessionDate);
    const weekdayIndex = (day.getDay() + 6) % 7;
    const weekday = day.toLocaleDateString("es-ES", { weekday: "long" });
    const dayType = dayTypesByDate.get(session.sessionDate);
    const [hour, minute] = session.startTime.split(":").map(Number);
    const endMinutes = hour * 60 + minute + session.duration;
    const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    const scheduleKey = `${weekdayIndex}|${session.startTime}|${endTime}`;
    const schedule = group.schedulesByKey.get(scheduleKey) ?? {
      weekday,
      weekdayIndex,
      startTime: session.startTime,
      endTime,
      dayTypes: new Set<"A" | "B">(),
      hasUntypedDays: false,
    };
    if (dayType) schedule.dayTypes.add(dayType);
    else schedule.hasUntypedDays = true;
    group.schedulesByKey.set(scheduleKey, schedule);
    group.sessions.push(session);
    sessionsByGroup.set(groupKey, group);
  }
  const orderedGroups = [...sessionsByGroup.entries()].sort(([, left], [, right]) => {
    if (!left.groupCode && right.groupCode) return 1;
    if (left.groupCode && !right.groupCode) return -1;
    return left.groupCode.localeCompare(right.groupCode, "es", { numeric: true, sensitivity: "base" });
  });

  return (
    <div className="overview-session-groups" aria-label="Sesiones de la asignatura agrupadas por subgrupo y horario">
      {orderedGroups.map(([groupKey, group], groupIndex) => {
        const groupLabel = group.groupCode
          ? `G${group.groupCode}`
          : "Sin grupo";
        const scheduleLabels = [...group.schedulesByKey.values()]
          .sort((left, right) => (
            left.weekdayIndex - right.weekdayIndex
            || left.startTime.localeCompare(right.startTime)
            || left.endTime.localeCompare(right.endTime)
          ))
          .map((schedule) => {
            const dayTypes = [...schedule.dayTypes].sort();
            const typedWeekday = dayTypes.length
              ? `${schedule.weekday}-${dayTypes.join("/")}`
              : schedule.weekday;
            const weekdayLabel = schedule.hasUntypedDays && dayTypes.length
              ? `${typedWeekday} y ${schedule.weekday} sin tipo`
              : typedWeekday;
            return `${weekdayLabel} ${schedule.startTime}–${schedule.endTime}`;
          });
        const scheduleSummary = scheduleLabels.join(" · ");
        return (
          <details className="overview-session-group" key={groupKey}>
            <summary className="overview-session-group-head">
              <span className="overview-session-group-chevron" aria-hidden="true">›</span>
              <strong>{groupLabel}</strong>
              <span className="overview-session-group-schedule">{scheduleSummary}</span>
              <b>{group.sessions.length}<small>{group.sessions.length === 1 ? "sesión" : "sesiones"}</small></b>
            </summary>
            <OverviewSessionsList
              headingPrefix={`overview-subject-${subjectId}-group-${groupIndex}`}
              ariaLabel={`Sesiones del subgrupo ${groupLabel}, ${scheduleSummary}, ordenadas cronológicamente`}
              emptyMessage="Este subgrupo no tiene sesiones en el semestre seleccionado."
              sessions={group.sessions}
              dayTypesByDate={dayTypesByDate}
              selectedIds={selectedIds}
              onSelect={onSelect}
            />
          </details>
        );
      })}
    </div>
  );
}

function OverviewTeacherSessions({
  teacherKey,
  teacherName,
  sessions,
  dayTypesByDate,
  selectedIds,
  onSelect,
}: {
  teacherKey: string;
  teacherName: string;
  sessions: Session[];
  dayTypesByDate: Map<string, "A" | "B">;
  selectedIds: Set<number>;
  onSelect: (session: Session, event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <OverviewSessionsList
      headingPrefix={`overview-teacher-${teacherKey}`}
      ariaLabel={`Sesiones de ${teacherName} ordenadas cronológicamente`}
      emptyMessage="Este profesor no tiene sesiones en el semestre seleccionado."
      sessions={sessions}
      dayTypesByDate={dayTypesByDate}
      selectedIds={selectedIds}
      onSelect={onSelect}
    />
  );
}

function Overview({
  data,
  canEdit,
  selectedSemester,
  onSelectedSemesterChange,
  onAssignPractice,
  onAssignTeacher,
  onDeleteSessions,
}: {
  data: AppData;
  canEdit: boolean;
  selectedSemester: string;
  onSelectedSemesterChange: (semesterId: string) => void;
  onAssignPractice: (ids: number[], practiceId: number | null) => Promise<boolean>;
  onAssignTeacher: (ids: number[], teacherId: number | null) => Promise<boolean>;
  onDeleteSessions: (request: SessionDeleteRequest, confirmation: string) => Promise<boolean>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedTeacherKeys, setExpandedTeacherKeys] = useState<Set<string>>(() => new Set());
  const [groupedSubjectIds, setGroupedSubjectIds] = useState<Set<number>>(() => new Set());
  const dayTypesByDate = useMemo(() => (
    new Map(data.academicDayTypes.map((item) => [item.date, item.dayType]))
  ), [data.academicDayTypes]);
  const availableSemesters = semesterOptions([
    ...data.sessions.map((session) => session.sessionDate),
    ...data.holidays.map((holiday) => holiday.holidayDate),
    ...data.academicDayTypes.map((item) => item.date),
  ], localIsoDate());
  const semesterSessions = data.sessions
    .filter((session) => semesterFromDate(session.sessionDate) === selectedSemester)
    .sort((left, right) => (
      left.sessionDate.localeCompare(right.sessionDate)
      || left.startTime.localeCompare(right.startTime)
      || left.id - right.id
    ));
  const degreeSessionCounts = new Map<number, number>();
  const subjectSessionCounts = new Map<number, number>();
  const teacherSessionCounts = new Map<number, number>();
  let unassignedTeacherSessionCount = 0;
  const sessionsBySubject = new Map<number, Session[]>();
  const sessionsByTeacher = new Map<number | null, Session[]>();
  for (const session of semesterSessions) {
    degreeSessionCounts.set(session.degreeId, (degreeSessionCounts.get(session.degreeId) ?? 0) + 1);
    subjectSessionCounts.set(session.subjectId, (subjectSessionCounts.get(session.subjectId) ?? 0) + 1);
    if (session.teacherId === null) {
      unassignedTeacherSessionCount += 1;
    } else {
      teacherSessionCounts.set(session.teacherId, (teacherSessionCounts.get(session.teacherId) ?? 0) + 1);
    }
    const teacherSessions = sessionsByTeacher.get(session.teacherId) ?? [];
    teacherSessions.push(session);
    sessionsByTeacher.set(session.teacherId, teacherSessions);
    const subjectSessions = sessionsBySubject.get(session.subjectId) ?? [];
    subjectSessions.push(session);
    sessionsBySubject.set(session.subjectId, subjectSessions);
  }
  for (const subjectSessions of sessionsBySubject.values()) {
    subjectSessions.sort((left, right) => (
      left.sessionDate.localeCompare(right.sessionDate)
      || left.startTime.localeCompare(right.startTime)
      || left.id - right.id
    ));
  }
  const orderedDegrees = [...data.degrees].sort((left, right) => (
    left.name.localeCompare(right.name, "es", { sensitivity: "base" })
    || left.code.localeCompare(right.code, "es")
  ));
  const orderedTeachers = [...data.teachers].sort(compareTeachersBySurname);
  const selectedSessions = semesterSessions.filter((session) => selectedIds.has(session.id));

  useEffect(() => {
    const clearSelectionWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedIds(new Set());
      setAnchorId(null);
    };
    window.addEventListener("keydown", clearSelectionWithEscape);
    return () => window.removeEventListener("keydown", clearSelectionWithEscape);
  }, []);

  function clearOverviewSelection() {
    setSelectedIds(new Set());
    setAnchorId(null);
  }

  function changeOverviewSemester(semesterId: string) {
    clearOverviewSelection();
    onSelectedSemesterChange(semesterId);
  }

  function selectOverviewSession(session: Session, event: ReactMouseEvent<HTMLButtonElement>) {
    const subjectSessions = sessionsBySubject.get(session.subjectId) ?? [];
    if (event.shiftKey && anchorId !== null) {
      const anchorIndex = subjectSessions.findIndex((item) => item.id === anchorId);
      const sessionIndex = subjectSessions.findIndex((item) => item.id === session.id);
      if (anchorIndex >= 0 && sessionIndex >= 0) {
        const first = Math.min(anchorIndex, sessionIndex);
        const last = Math.max(anchorIndex, sessionIndex);
        setSelectedIds(new Set(subjectSessions.slice(first, last + 1).map((item) => item.id)));
        return;
      }
    }
    setSelectedIds(new Set([session.id]));
    setAnchorId(session.id);
  }

  function selectOverviewTeacherSession(session: Session, event: ReactMouseEvent<HTMLButtonElement>) {
    const teacherSessions = sessionsByTeacher.get(session.teacherId) ?? [];
    if (event.shiftKey && anchorId !== null) {
      const anchorIndex = teacherSessions.findIndex((item) => item.id === anchorId);
      const sessionIndex = teacherSessions.findIndex((item) => item.id === session.id);
      if (anchorIndex >= 0 && sessionIndex >= 0) {
        const first = Math.min(anchorIndex, sessionIndex);
        const last = Math.max(anchorIndex, sessionIndex);
        setSelectedIds(new Set(teacherSessions.slice(first, last + 1).map((item) => item.id)));
        return;
      }
    }
    setSelectedIds(new Set([session.id]));
    setAnchorId(session.id);
  }

  function toggleOverviewTeacher(teacherKey: string) {
    setExpandedTeacherKeys((current) => {
      const next = new Set(current);
      if (next.has(teacherKey)) next.delete(teacherKey);
      else next.add(teacherKey);
      return next;
    });
  }

  function toggleSubjectGrouping(subjectId: number) {
    setGroupedSubjectIds((current) => {
      const next = new Set(current);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  }

  function toggleFirstUnassignedSubgroups(subjectSessions: Session[]) {
    const firstUnassignedSessions = firstUnassignedSessionPerSubgroup(subjectSessions);
    const firstUnassignedIds = firstUnassignedSessions.map((session) => session.id);
    if (!firstUnassignedIds.length) return;
    const alreadySelected = selectedIds.size === firstUnassignedIds.length
      && firstUnassignedIds.every((id) => selectedIds.has(id));
    if (alreadySelected) {
      clearOverviewSelection();
      return;
    }
    setSelectedIds(new Set(firstUnassignedIds));
    setAnchorId(null);
  }

  async function assignOverviewPractice(practiceId: number | null) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setAssigning(true);
    const changed = await onAssignPractice(ids, practiceId);
    setAssigning(false);
    if (changed) clearOverviewSelection();
  }

  async function assignOverviewTeacher(teacherId: number | null) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setAssigning(true);
    const changed = await onAssignTeacher(ids, teacherId);
    setAssigning(false);
    if (changed) clearOverviewSelection();
  }

  async function deleteOverviewSessions() {
    const ids = [...selectedIds];
    if (!ids.length || deleting) return;
    setDeleting(true);
    try {
      const confirmation = ids.length === 1
        ? "¿Borrar la sesión seleccionada?"
        : `¿Borrar las ${ids.length} sesiones seleccionadas?`;
      if (await onDeleteSessions({ ids }, confirmation)) clearOverviewSelection();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SemesterFocus
        className="overview-semester-focus"
        semesterId={selectedSemester}
        semesters={availableSemesters}
        onChange={changeOverviewSemester}
      />
      <div className={selectedIds.size ? "calendar-selection-bar overview-selection-bar active" : "calendar-selection-bar overview-selection-bar"}>
        {selectedIds.size ? (
          <>
            <strong>{selectedIds.size} {selectedIds.size === 1 ? "sesión seleccionada" : "sesiones seleccionadas"}</strong>
            <span>Shift + clic amplía el rango dentro del listado abierto · Esc limpia la selección</span>
            <SessionSelectionActions
              sessions={selectedSessions}
              practices={data.practices}
              subjects={data.subjects}
              teachers={data.teachers}
              canEdit={canEdit}
              assigning={assigning}
              deleting={deleting}
              onAssignTeacher={(teacherId) => void assignOverviewTeacher(teacherId)}
              onAssignPractice={(practiceId) => void assignOverviewPractice(practiceId)}
              onDelete={() => void deleteOverviewSessions()}
              onClear={clearOverviewSelection}
            />
          </>
        ) : (
            <span>{canEdit ? "Haz clic en una sesión para seleccionarla. Después usa la barra de acciones para asignar práctica, profesor o borrar." : "Modo de solo lectura: selecciona sesiones para exportarlas en PDF o ICS."} Shift + clic selecciona un rango dentro del listado abierto y Esc limpia la selección.</span>
        )}
      </div>
      <section className="panel overview-degree-panel">
        <div className="panel-head">
          <div><span className="section-kicker">Carga docente</span><h2>Sesiones por grado</h2></div>
          <span className="panel-tag session-total">{semesterSessions.length} {semesterSessions.length === 1 ? "sesión" : "sesiones"}</span>
        </div>
        {orderedDegrees.length ? (
          <div className="overview-degree-list">
            {orderedDegrees.map((degree) => {
              const degreeSubjects = data.subjects
                .filter((subject) => subject.degreeId === degree.id)
                .sort((left, right) => (
                  left.name.localeCompare(right.name, "es", { sensitivity: "base" })
                  || left.code.localeCompare(right.code, "es")
                ));
              const degreeSessionCount = degreeSessionCounts.get(degree.id) ?? 0;
              return (
                <details className="overview-degree-item" key={degree.id}>
                  <summary>
                    <span className="overview-degree-chevron" aria-hidden="true">›</span>
                    <span className="overview-degree-code">{degree.code}</span>
                    <span className="overview-degree-name">
                      <strong>{degree.name}</strong>
                      <small>{degree.level}{degree.icsCode ? ` · ICS ${degree.icsCode}` : ""}</small>
                    </span>
                    <b>{degreeSessionCount}<small>{degreeSessionCount === 1 ? "sesión" : "sesiones"}</small></b>
                  </summary>
                  {degreeSubjects.length ? (
                    <div className="overview-subject-list" aria-label={`Asignaturas de ${degree.name}`}>
                      {degreeSubjects.map((subject) => {
                        const subjectSessionCount = subjectSessionCounts.get(subject.id) ?? 0;
                        const subjectSessions = sessionsBySubject.get(subject.id) ?? [];
                        const firstUnassignedSubgroupSessions = firstUnassignedSessionPerSubgroup(subjectSessions);
                        const firstUnassignedSubgroupIds = firstUnassignedSubgroupSessions.map((session) => session.id);
                        const firstUnassignedSubgroupsSelected = firstUnassignedSubgroupIds.length > 0
                          && selectedIds.size === firstUnassignedSubgroupIds.length
                          && firstUnassignedSubgroupIds.every((id) => selectedIds.has(id));
                        return (
                          <details className="overview-subject-item" key={subject.id}>
                            <summary>
                              <span className="overview-subject-chevron" aria-hidden="true">›</span>
                              <span className="overview-subject-code">{subject.abbreviation || subject.code}</span>
                              <span>
                                <strong>{subject.name}</strong>
                                <small>{subject.code}</small>
                              </span>
                              <span className="overview-subject-toggles">
                                <button
                                  className="overview-subject-group-toggle"
                                  type="button"
                                  role="checkbox"
                                  aria-checked={groupedSubjectIds.has(subject.id)}
                                  aria-label={`Agrupar las sesiones de ${subject.name} por subgrupos`}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    toggleSubjectGrouping(subject.id);
                                  }}
                                >
                                  <span className="overview-subject-group-box" aria-hidden="true">{groupedSubjectIds.has(subject.id) ? "✓" : ""}</span>
                                  <span className="overview-subject-toggle-label">Por subgrupos</span>
                                </button>
                                <button
                                  className="overview-subject-group-toggle overview-subject-select-toggle"
                                  type="button"
                                  role="checkbox"
                                  aria-checked={firstUnassignedSubgroupsSelected}
                                  aria-label={`Seleccionar la primera sesión sin práctica de cada subgrupo de ${subject.name}`}
                                  title={firstUnassignedSubgroupIds.length
                                    ? "Selecciona la primera sesión sin práctica de cada subgrupo"
                                    : "No hay sesiones de subgrupo sin práctica"}
                                  disabled={!firstUnassignedSubgroupIds.length}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    toggleFirstUnassignedSubgroups(subjectSessions);
                                  }}
                                >
                                  <span className="overview-subject-group-box" aria-hidden="true">{firstUnassignedSubgroupsSelected ? "✓" : ""}</span>
                                  <span className="overview-subject-toggle-label">Selec. subgrupos</span>
                                </button>
                              </span>
                              <b>{subjectSessionCount}<small>{subjectSessionCount === 1 ? "sesión" : "sesiones"}</small></b>
                            </summary>
                            {groupedSubjectIds.has(subject.id) ? (
                              <OverviewGroupedSubjectSessions
                                subjectId={subject.id}
                                sessions={subjectSessions}
                                dayTypesByDate={dayTypesByDate}
                                selectedIds={selectedIds}
                                onSelect={selectOverviewSession}
                              />
                            ) : (
                              <OverviewSubjectSessions
                                subjectId={subject.id}
                                sessions={subjectSessions}
                                dayTypesByDate={dayTypesByDate}
                                selectedIds={selectedIds}
                                onSelect={selectOverviewSession}
                              />
                            )}
                          </details>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="overview-subject-empty">Este grado todavía no tiene asignaturas.</p>
                  )}
                </details>
              );
            })}
          </div>
        ) : (
          <p className="overview-subject-empty standalone">Todavía no hay grados creados.</p>
        )}
      </section>
      <section className="panel overview-teacher-panel">
        <div className="panel-head">
          <div><span className="section-kicker">Carga docente</span><h2>Sesiones por profesor</h2></div>
          <span className="panel-tag session-total">{semesterSessions.length} {semesterSessions.length === 1 ? "sesión" : "sesiones"}</span>
        </div>
        {orderedTeachers.length || unassignedTeacherSessionCount ? (
          <div className="overview-teacher-table-wrap">
            <table className="overview-teacher-table">
              <thead>
                <tr>
                  <th scope="col">Profesor</th>
                  <th scope="col">Correo electrónico</th>
                  <th scope="col">Sesiones</th>
                </tr>
              </thead>
              <tbody>
                {orderedTeachers.map((teacher) => {
                  const sessionCount = teacherSessionCounts.get(teacher.id) ?? 0;
                  const teacherKey = String(teacher.id);
                  const teacherSessions = sessionsByTeacher.get(teacher.id) ?? [];
                  const expanded = expandedTeacherKeys.has(teacherKey);
                  return (
                    <Fragment key={teacher.id}>
                      <tr className={expanded ? "overview-teacher-data-row expanded" : "overview-teacher-data-row"}>
                        <td>
                          <button
                            className="overview-teacher-identity"
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={`overview-teacher-${teacherKey}-sessions`}
                            onClick={() => toggleOverviewTeacher(teacherKey)}
                          >
                            <span className="overview-teacher-chevron" aria-hidden="true">›</span>
                            <span className="overview-teacher-code">{teacher.code}</span>
                            <strong>{teacher.name}</strong>
                          </button>
                        </td>
                        <td className="overview-teacher-email">{teacher.email || "Sin correo electrónico"}</td>
                        <td className="overview-teacher-count"><b>{sessionCount}</b><small>{sessionCount === 1 ? "sesión" : "sesiones"}</small></td>
                      </tr>
                      {expanded && (
                        <tr className="overview-teacher-session-row">
                          <td colSpan={3} id={`overview-teacher-${teacherKey}-sessions`}>
                            <OverviewTeacherSessions
                              teacherKey={teacherKey}
                              teacherName={teacher.name}
                              sessions={teacherSessions}
                              dayTypesByDate={dayTypesByDate}
                              selectedIds={selectedIds}
                              onSelect={selectOverviewTeacherSession}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {unassignedTeacherSessionCount > 0 && (
                  <>
                    <tr className={expandedTeacherKeys.has("unassigned") ? "overview-teacher-data-row overview-teacher-unassigned expanded" : "overview-teacher-data-row overview-teacher-unassigned"}>
                      <td>
                        <button
                          className="overview-teacher-identity"
                          type="button"
                          aria-expanded={expandedTeacherKeys.has("unassigned")}
                          aria-controls="overview-teacher-unassigned-sessions"
                          onClick={() => toggleOverviewTeacher("unassigned")}
                        >
                          <span className="overview-teacher-chevron" aria-hidden="true">›</span>
                          <span className="overview-teacher-code">—</span>
                          <strong>Sin profesor asignado</strong>
                        </button>
                      </td>
                      <td className="overview-teacher-email">—</td>
                      <td className="overview-teacher-count"><b>{unassignedTeacherSessionCount}</b><small>{unassignedTeacherSessionCount === 1 ? "sesión" : "sesiones"}</small></td>
                    </tr>
                    {expandedTeacherKeys.has("unassigned") && (
                      <tr className="overview-teacher-session-row overview-teacher-unassigned">
                        <td colSpan={3} id="overview-teacher-unassigned-sessions">
                          <OverviewTeacherSessions
                            teacherKey="unassigned"
                            teacherName="las sesiones sin profesor asignado"
                            sessions={sessionsByTeacher.get(null) ?? []}
                            dayTypesByDate={dayTypesByDate}
                            selectedIds={selectedIds}
                            onSelect={selectOverviewTeacherSession}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="overview-subject-empty standalone">Todavía no hay profesores creados.</p>
        )}
      </section>
    </>
  );
}

function SemesterFocus({
  className,
  semesterId,
  semesters,
  onChange,
}: {
  className: string;
  semesterId: string;
  semesters: ReturnType<typeof semesterOptions>;
  onChange: (semesterId: string) => void;
}) {
  const semester = semesterDefinition(semesterId);
  const [startYear, endYear] = semester.academicYear.split("-");
  const shortAcademicYear = `${startYear.slice(-2)}-${endYear}`;
  return (
    <section className={`semester-focus ${className}`} aria-labelledby={`${className}-title`}>
      <div>
        <span className="section-kicker">Semestre activo</span>
        <h1 id={`${className}-title`}>
          <span>Semestre {semester.number}</span>
          <small>Curso {shortAcademicYear}</small>
        </h1>
      </div>
      <label className="semester-focus-picker">
        <span>Seleccionar semestre</span>
        <select aria-label="Semestre académico" value={semesterId} onChange={(event) => onChange(event.target.value)}>
          {semesters.map((semester) => (
            <option key={semester.id} value={semester.id}>{semesterDisplayTitle(semester.id)}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

function EntityView({
  entity,
  canEdit,
  data,
  catalog,
  search,
  dependencyMissing,
  onCreate,
  onEdit,
  onDelete,
  onImport,
  onAssignPractice,
  onAssignTeacher,
  onMoveSession,
  onDeleteSessions,
  selectedSemester,
  onSelectedSemesterChange,
}: {
  entity: Entity;
  canEdit: boolean;
  data: AppData;
  catalog: AppData;
  search: string;
  dependencyMissing: boolean;
  onCreate: (entity: Entity) => void;
  onEdit: (entity: Entity, item: EntityRecord) => void;
  onDelete: (entity: Entity, id: number, label: string) => void;
  onImport: () => void;
  onAssignPractice: (ids: number[], practiceId: number | null) => Promise<boolean>;
  onAssignTeacher: (ids: number[], teacherId: number | null) => Promise<boolean>;
  onMoveSession: (id: number, sessionDate: string, startTime: string) => Promise<boolean>;
  onDeleteSessions: (request: SessionDeleteRequest, confirmation: string) => Promise<boolean>;
  selectedSemester: string;
  onSelectedSemesterChange: (semesterId: string) => void;
}) {
  const items = data[entity];
  const teacherSemesterOptions = semesterOptions([
    ...catalog.sessions.map((session) => session.sessionDate),
    ...catalog.holidays.map((holiday) => holiday.holidayDate),
    ...catalog.academicDayTypes.map((item) => item.date),
  ], localIsoDate());
  const teacherSessionCounts = new Map<number, number>();
  for (const session of catalog.sessions) {
    if (session.teacherId === null || semesterFromDate(session.sessionDate) !== selectedSemester) continue;
    teacherSessionCounts.set(session.teacherId, (teacherSessionCounts.get(session.teacherId) ?? 0) + 1);
  }
  function editRecordWithKeyboard(event: ReactKeyboardEvent<HTMLElement>, item: EntityRecord) {
    if (!canEdit || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onEdit(entity, item);
  }
  return (
    <>
      <section className="entity-hero">
        <div>
          <span className="section-kicker">Catálogo / {navigation.find((item) => item.key === entity)?.short}</span>
          <h1>{entityCopy[entity].plural}</h1>
          <p>{entityCopy[entity].description}</p>
        </div>
        <div className="entity-hero-actions">
          {canEdit ? (
            <>
              {entity === "sessions" && <button className="secondary-button" type="button" onClick={onImport}>Importar ICS</button>}
              <button className="primary-button" type="button" disabled={dependencyMissing} onClick={() => onCreate(entity)}>
                <span>+</span> Añadir {entityCopy[entity].singular}
              </button>
            </>
          ) : <span className="read-only-badge">Solo lectura</span>}
        </div>
      </section>

      {canEdit && dependencyMissing && (
        <div className="dependency-message">Para crear este elemento, añade antes su nivel superior en la jerarquía.</div>
      )}

      {entity === "sessions" ? (
        <CalendarView
          sessions={items as Session[]}
          allSessions={catalog.sessions}
          holidays={catalog.holidays}
          academicDayTypes={catalog.academicDayTypes}
          laboratories={catalog.laboratories}
          installations={catalog.installations}
          degrees={catalog.degrees}
          subjects={catalog.subjects}
          practices={catalog.practices}
          teachers={catalog.teachers}
          canEdit={canEdit}
          onEdit={(session) => onEdit(entity, session)}
          onDelete={(session) => onDelete(entity, session.id, `${session.practiceCode || session.subjectCode || "Sesión incompleta"} · ${session.sessionDate} ${session.startTime}`)}
          onAssignPractice={onAssignPractice}
          onAssignTeacher={onAssignTeacher}
          onMoveSession={onMoveSession}
          onDeleteSessions={onDeleteSessions}
          selectedSemester={selectedSemester}
          onSelectedSemesterChange={onSelectedSemesterChange}
        />
      ) : items.length === 0 ? (
        <div className="empty-state">
          <span>{search ? "⌕" : "+"}</span>
          <h2>{search ? "No hay coincidencias" : `Aún no hay ${entityCopy[entity].plural.toLowerCase()}`}</h2>
          <p>{search ? "Prueba con otro código, nombre o relación." : "Crea el primer registro para empezar a construir la estructura."}</p>
          {canEdit && !search && !dependencyMissing && <button className="primary-button" type="button" onClick={() => onCreate(entity)}>Crear ahora</button>}
        </div>
      ) : entity === "laboratories" ? (
        <div className="laboratory-grid">
          {(items as Laboratory[]).map((lab) => (
            <div className={canEdit ? "laboratory-card editable-record" : "laboratory-card"} key={lab.id} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} aria-label={canEdit ? `Editar ${lab.name}` : undefined} onClick={canEdit ? () => onEdit(entity, lab) : undefined} onKeyDown={canEdit ? (event) => editRecordWithKeyboard(event, lab) : undefined}>
              <div className="card-top"><span className="entity-pill">{lab.code}</span>{canEdit && <div className="record-actions"><button className="delete-button" type="button" onClick={(event) => { event.stopPropagation(); onDelete(entity, lab.id, lab.name); }} aria-label={`Eliminar ${lab.name}`}>×</button></div>}</div>
              <h2>{lab.name}</h2>
              <p><span>Ubicación</span>{lab.location}</p>
              <p><span>Responsable</span>{lab.manager}</p>
              <div className="card-foot"><strong>{lab.installationCount}</strong><span>instalaciones<br />conectadas</span><ArrowIcon /></div>
            </div>
          ))}
        </div>
      ) : entity === "degrees" ? (
        <div className="degree-list">
          {(items as Degree[]).map((degree) => (
            <div className={canEdit ? "degree-card editable-record" : "degree-card"} key={degree.id} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} aria-label={canEdit ? `Editar ${degree.name}` : undefined} onClick={canEdit ? () => onEdit(entity, degree) : undefined} onKeyDown={canEdit ? (event) => editRecordWithKeyboard(event, degree) : undefined}>
              <div className="degree-code"><span>{degree.code}</span><small>{degree.level}</small></div>
              <div className="degree-main"><h2>{degree.name}</h2><p>{degree.icsCode ? `ICS ${degree.icsCode}` : "Sin código ICS"} · {degree.subjectCount} {degree.subjectCount === 1 ? "asignatura" : "asignaturas"}</p></div>
              <div className="tag-list">{degree.subjectCodes.length ? degree.subjectCodes.map((code) => <span key={code}>{code}</span>) : <em>Sin asignaturas</em>}</div>
              {canEdit && <div className="record-actions"><button className="delete-button" type="button" onClick={(event) => { event.stopPropagation(); onDelete(entity, degree.id, degree.name); }} aria-label={`Eliminar ${degree.name}`}>×</button></div>}
            </div>
          ))}
        </div>
      ) : entity === "subjects" ? (
        <div className="degree-list">
          {(items as Subject[]).map((subject) => (
            <div className={canEdit ? "degree-card editable-record" : "degree-card"} key={subject.id} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} aria-label={canEdit ? `Editar ${subject.name}` : undefined} onClick={canEdit ? () => onEdit(entity, subject) : undefined} onKeyDown={canEdit ? (event) => editRecordWithKeyboard(event, subject) : undefined}>
              <div className="degree-code subject"><span>{subject.code}</span><small>ASI</small></div>
              <div className="degree-main"><h2>{subject.name}</h2><p>{subject.abbreviation ? `${subject.abbreviation} · ` : "Sin abreviatura · "}{subject.degreeCode} · {subject.degreeName}</p></div>
              <div className="tag-list">{subject.practiceCodes.length ? subject.practiceCodes.map((code) => <span key={code}>{code}</span>) : <em>Sin prácticas</em>}</div>
              {canEdit && <div className="record-actions"><button className="delete-button" type="button" onClick={(event) => { event.stopPropagation(); onDelete(entity, subject.id, subject.name); }} aria-label={`Eliminar ${subject.name}`}>×</button></div>}
            </div>
          ))}
        </div>
      ) : entity === "teachers" ? (
        <>
          <div className="teacher-semester-toolbar">
            <div>
              <span className="section-kicker">Sesiones del semestre</span>
              <strong>{semesterDisplayTitle(selectedSemester)}</strong>
            </div>
            <label>
              <span>Cambiar semestre</span>
              <select aria-label="Cambiar semestre para el recuento de profesores" value={selectedSemester} onChange={(event) => onSelectedSemesterChange(event.target.value)}>
                {teacherSemesterOptions.map((semester) => (
                  <option key={semester.id} value={semester.id}>{semesterDisplayTitle(semester.id)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="degree-list">
            {[...(items as Teacher[])].sort(compareTeachersBySurname).map((teacher) => {
              const semesterSessionCount = teacherSessionCounts.get(teacher.id) ?? 0;
              return (
                <div className={canEdit ? "degree-card editable-record" : "degree-card"} key={teacher.id} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} aria-label={canEdit ? `Editar ${teacher.name}` : undefined} onClick={canEdit ? () => onEdit(entity, teacher) : undefined} onKeyDown={canEdit ? (event) => editRecordWithKeyboard(event, teacher) : undefined}>
                  <div className="degree-code teacher"><span>{teacher.code}</span><small>PRO</small></div>
                  <div className="degree-main"><h2>{teacher.name}</h2><p>{teacher.email || "Sin correo electrónico"}</p></div>
                  <div className="tag-list"><span className={teacher.isAdmin ? "permission-tag admin" : "permission-tag"}>{teacher.isAdmin ? "Administrador" : "Solo lectura"}</span><span>{semesterSessionCount} {semesterSessionCount === 1 ? "sesión" : "sesiones"}</span></div>
                  {canEdit && <div className="record-actions"><button className="delete-button" type="button" onClick={(event) => { event.stopPropagation(); onDelete(entity, teacher.id, teacher.name); }} aria-label={`Eliminar ${teacher.name}`}>×</button></div>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="entity-table-wrap">
          <table className="entity-table">
            <thead><tr>
              <th>Código / Nombre</th>
              <th>{entity === "installations" ? "Laboratorio" : "Instalaciones"}</th>
              <th>{entity === "installations" ? "Tipo / Capacidad" : "Laboratorios"}</th>
              <th>{entity === "installations" ? "Estado" : "Duración / Riesgo"}</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody>
              {entity === "installations" ? (items as Installation[]).map((item) => (
                <tr className={canEdit ? "editable-record" : undefined} key={item.id} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} aria-label={canEdit ? `Editar ${item.name}` : undefined} onClick={canEdit ? () => onEdit(entity, item) : undefined} onKeyDown={canEdit ? (event) => editRecordWithKeyboard(event, item) : undefined}>
                  <td><span className="table-code">{item.code}</span><strong>{item.name}</strong><small>{item.practiceCount} prácticas</small></td>
                  <td>{item.laboratoryName}</td>
                  <td>{item.category}<small>{item.capacity} personas</small></td>
                  <td><span className={`status-chip ${item.status === "Operativa" ? "ok" : "warn"}`}>{item.status}</span></td>
                  <td>{canEdit && <div className="record-actions"><button className="delete-button" type="button" onClick={(event) => { event.stopPropagation(); onDelete(entity, item.id, item.name); }} aria-label={`Eliminar ${item.name}`}>×</button></div>}</td>
                </tr>
              )) : (items as Practice[]).map((item) => (
                <tr className={canEdit ? "editable-record" : undefined} key={item.id} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} aria-label={canEdit ? `Editar ${item.name}` : undefined} onClick={canEdit ? () => onEdit(entity, item) : undefined} onKeyDown={canEdit ? (event) => editRecordWithKeyboard(event, item) : undefined}>
                  <td><span className="table-code blue">{item.code}</span><strong>{item.name}</strong><small>{item.subjectCount} asignaturas</small></td>
                  <td>{item.installationNames}<small>{item.installationCount} instalaciones</small></td>
                  <td>{item.laboratoryNames}</td>
                  <td>{item.duration} min<small>Riesgo {item.riskLevel.toLowerCase()}</small></td>
                  <td>{canEdit && <div className="record-actions"><button className="delete-button" type="button" onClick={(event) => { event.stopPropagation(); onDelete(entity, item.id, item.name); }} aria-label={`Eliminar ${item.name}`}>×</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CalendarView({
  sessions,
  allSessions,
  canEdit,
  holidays,
  academicDayTypes,
  laboratories,
  installations,
  degrees,
  subjects,
  practices,
  teachers,
  onEdit,
  onDelete,
  onAssignPractice,
  onAssignTeacher,
  onMoveSession,
  onDeleteSessions,
  selectedSemester,
  onSelectedSemesterChange,
}: {
  sessions: Session[];
  allSessions: Session[];
  canEdit: boolean;
  holidays: Holiday[];
  academicDayTypes: AcademicDayType[];
  laboratories: Laboratory[];
  installations: Installation[];
  degrees: Degree[];
  subjects: Subject[];
  practices: Practice[];
  teachers: Teacher[];
  onEdit: (session: Session) => void;
  onDelete: (session: Session) => void;
  onAssignPractice: (ids: number[], practiceId: number | null) => Promise<boolean>;
  onAssignTeacher: (ids: number[], teacherId: number | null) => Promise<boolean>;
  onMoveSession: (id: number, sessionDate: string, startTime: string) => Promise<boolean>;
  onDeleteSessions: (request: SessionDeleteRequest, confirmation: string) => Promise<boolean>;
  selectedSemester: string;
  onSelectedSemesterChange: (semesterId: string) => void;
}) {
  const referenceDate = localIsoDate();
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("month");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    return initialMonthForSemester(selectedSemester, allSessions, referenceDate);
  });
  const [visibleWeekStart, setVisibleWeekStart] = useState(() => {
    return initialWeekForSemester(selectedSemester, allSessions, referenceDate);
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filters, setFilters] = useState<CalendarFilters>(emptyCalendarFilters);
  const [draggedSessionId, setDraggedSessionId] = useState<number | null>(null);
  const [movingSessionId, setMovingSessionId] = useState<number | null>(null);
  const [monthDropDate, setMonthDropDate] = useState<string | null>(null);
  const [weekDropPreview, setWeekDropPreview] = useState<CalendarDropPreview | null>(null);
  const dayTypesByDate = useMemo(() => (
    new Map(academicDayTypes.map((item) => [item.date, item.dayType]))
  ), [academicDayTypes]);

  const orderedSessions = useMemo(() => [...sessions].sort((left, right) => (
    left.sessionDate.localeCompare(right.sessionDate)
    || left.startTime.localeCompare(right.startTime)
    || left.id - right.id
  )), [sessions]);
  const availableSemesters = useMemo(() => (
    semesterOptions([
      ...allSessions.map((session) => session.sessionDate),
      ...holidays.map((holiday) => holiday.holidayDate),
      ...academicDayTypes.map((item) => item.date),
    ], referenceDate)
  ), [allSessions, holidays, academicDayTypes, referenceDate]);
  const activeSemester = useMemo(() => semesterDefinition(selectedSemester), [selectedSemester]);
  const semesterSessions = useMemo(() => (
    orderedSessions.filter((session) => semesterFromDate(session.sessionDate) === selectedSemester)
  ), [orderedSessions, selectedSemester]);
  const allSemesterSessionIds = useMemo(() => (
    allSessions
      .filter((session) => semesterFromDate(session.sessionDate) === selectedSemester)
      .map((session) => session.id)
  ), [allSessions, selectedSemester]);
  const practicesById = useMemo(() => new Map(practices.map((practice) => [practice.id, practice])), [practices]);
  const installationsById = useMemo(() => new Map(installations.map((installation) => [installation.id, installation])), [installations]);
  const filterSubjects = useMemo(() => (
    filters.degreeId
      ? subjects.filter((subject) => String(subject.degreeId) === filters.degreeId)
      : subjects
  ), [filters.degreeId, subjects]);
  const filteredSemesterSessions = useMemo(() => semesterSessions.filter((session) => {
    if (filters.degreeId && String(session.degreeId) !== filters.degreeId) return false;
    if (filters.subjectId && String(session.subjectId) !== filters.subjectId) return false;
    if (filters.practiceId && String(session.practiceId ?? "") !== filters.practiceId) return false;

    const practice = session.practiceId === null ? undefined : practicesById.get(session.practiceId);
    if (filters.installationId && !practice?.installationIds.some((id) => String(id) === filters.installationId)) return false;
    if (filters.laboratoryId && !practice?.installationIds.some((id) => (
      String(installationsById.get(id)?.laboratoryId ?? "") === filters.laboratoryId
    ))) return false;
    return true;
  }), [semesterSessions, filters, practicesById, installationsById]);
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const draggedSession = draggedSessionId === null
    ? undefined
    : filteredSemesterSessions.find((session) => session.id === draggedSessionId);

  const days = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => (
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    ));
  }, [visibleMonth]);
  const weekDays = useMemo(() => (
    Array.from({ length: calendarWeekDayCount }, (_, index) => addCalendarDays(visibleWeekStart, index))
  ), [visibleWeekStart]);
  const weekHours = useMemo(() => (
    Array.from(
      { length: calendarWeekEndHour - calendarWeekStartHour + 1 },
      (_, index) => calendarWeekStartHour + index,
    )
  ), []);

  const sessionsByDate = useMemo(() => {
    const grouped = new Map<string, Session[]>();
    for (const session of filteredSemesterSessions) {
      const dateSessions = grouped.get(session.sessionDate) ?? [];
      dateSessions.push(session);
      grouped.set(session.sessionDate, dateSessions);
    }
    return grouped;
  }, [filteredSemesterSessions]);
  const holidaysByDate = useMemo(() => (
    new Map(holidays.map((holiday) => [holiday.holidayDate, holiday]))
  ), [holidays]);
  const weeklyLayout = useMemo(() => {
    const byDate = new Map<string, WeeklySessionPosition[]>();
    let maximumLaneCount = 1;
    for (const day of weekDays) {
      const date = localIsoDate(day);
      const visibleSessions = (sessionsByDate.get(date) ?? []).filter((session) => {
        const start = calendarSessionStartMinutes(session);
        return start < calendarWeekEndHour * 60 && start + session.duration > calendarWeekStartHour * 60;
      });
      const positioned = layoutOverlappingSessions(visibleSessions);
      maximumLaneCount = Math.max(maximumLaneCount, ...positioned.map((item) => item.laneCount));
      byDate.set(date, positioned);
    }
    return { byDate, maximumLaneCount };
  }, [sessionsByDate, weekDays]);

  const selectedSessions = useMemo(() => (
    filteredSemesterSessions.filter((session) => selectedIds.has(session.id))
  ), [filteredSemesterSessions, selectedIds]);

  useEffect(() => {
    if (calendarView !== "list") return;
    const clearSelectionWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedIds(new Set());
      setAnchorId(null);
    };
    window.addEventListener("keydown", clearSelectionWithEscape);
    return () => window.removeEventListener("keydown", clearSelectionWithEscape);
  }, [calendarView]);

  const today = localIsoDate();
  const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(visibleMonth);
  const weekEnd = weekDays[weekDays.length - 1];
  const weekLabel = visibleWeekStart.getMonth() === weekEnd.getMonth()
    ? `${visibleWeekStart.getDate()}–${weekEnd.getDate()} de ${new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(weekEnd)}`
    : `${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(visibleWeekStart)}–${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(weekEnd)}`;
  const weeklyDayMinWidth = Math.max(120, weeklyLayout.maximumLaneCount * 96);
  const weeklyGridMinWidth = 58 + weeklyDayMinWidth * weekDays.length;
  const visibleMonthValue = visibleMonth.getFullYear() * 12 + visibleMonth.getMonth();
  const semesterStartValue = activeSemester.startYear * 12 + activeSemester.startMonthIndex;
  const semesterEndValue = activeSemester.endYear * 12 + activeSemester.endMonthIndex;
  const semesterFirstWeek = startOfCalendarWeek(parseLocalDate(activeSemester.startDate));
  const semesterLastWeek = startOfCalendarWeek(parseLocalDate(activeSemester.endDate));
  const canMovePrevious = calendarView === "month"
    ? visibleMonthValue > semesterStartValue
    : calendarView === "week" && visibleWeekStart.getTime() > semesterFirstWeek.getTime();
  const canMoveNext = calendarView === "month"
    ? visibleMonthValue < semesterEndValue
    : calendarView === "week" && visibleWeekStart.getTime() < semesterLastWeek.getTime();

  function moveMonth(offset: number) {
    const candidate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    const candidateValue = candidate.getFullYear() * 12 + candidate.getMonth();
    if (candidateValue < semesterStartValue || candidateValue > semesterEndValue) return;
    setVisibleMonth(candidate);
  }

  function moveWeek(offset: number) {
    const candidate = addCalendarDays(visibleWeekStart, offset * 7);
    if (candidate < semesterFirstWeek || candidate > semesterLastWeek) return;
    setVisibleWeekStart(candidate);
  }

  function moveCalendar(offset: number) {
    if (calendarView === "month") moveMonth(offset);
    else if (calendarView === "week") moveWeek(offset);
    clearSelection();
  }

  function goToToday() {
    setVisibleMonth(initialMonthForSemester(selectedSemester, allSessions, referenceDate));
    setVisibleWeekStart(initialWeekForSemester(selectedSemester, allSessions, referenceDate));
    clearSelection();
  }

  function changeSemester(semesterId: string) {
    onSelectedSemesterChange(semesterId);
    setVisibleMonth(initialMonthForSemester(semesterId, allSessions, referenceDate));
    setVisibleWeekStart(initialWeekForSemester(semesterId, allSessions, referenceDate));
    clearSelection();
  }

  async function deleteSelectedSessions() {
    const ids = [...selectedIds];
    if (!ids.length || deleting) return;
    setDeleting(true);
    try {
      const confirmation = ids.length === 1
        ? "¿Borrar la sesión seleccionada?"
        : `¿Borrar las ${ids.length} sesiones seleccionadas?`;
      if (await onDeleteSessions({ ids }, confirmation)) clearSelection();
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSemesterSessions() {
    if (!allSemesterSessionIds.length || deleting) return;
    setDeleting(true);
    try {
      const count = allSemesterSessionIds.length;
      const confirmation = count === 1
        ? `¿Borrar la única sesión del semestre ${selectedSemester}?`
        : `¿Borrar las ${count} sesiones del semestre ${selectedSemester}?`;
      if (await onDeleteSessions({ semesterId: selectedSemester }, confirmation)) clearSelection();
    } finally {
      setDeleting(false);
    }
  }

  function changeCalendarView(view: CalendarViewMode) {
    if (view === calendarView) return;
    if (view === "week") {
      const reference = parseLocalDate(referenceDate);
      const weekTarget = calendarView === "month"
        ? reference.getFullYear() === visibleMonth.getFullYear() && reference.getMonth() === visibleMonth.getMonth()
          ? reference
          : new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
        : initialDateForSemester(selectedSemester, allSessions, referenceDate);
      const candidate = startOfCalendarWeek(weekTarget);
      setVisibleWeekStart(candidate < semesterFirstWeek ? semesterFirstWeek : candidate > semesterLastWeek ? semesterLastWeek : candidate);
    } else if (view === "month") {
      const middleOfWeek = calendarView === "week"
        ? addCalendarDays(visibleWeekStart, 3)
        : initialDateForSemester(selectedSemester, allSessions, referenceDate);
      const candidateValue = middleOfWeek.getFullYear() * 12 + middleOfWeek.getMonth();
      const clampedValue = Math.max(semesterStartValue, Math.min(candidateValue, semesterEndValue));
      setVisibleMonth(new Date(Math.floor(clampedValue / 12), clampedValue % 12, 1));
    }
    setCalendarView(view);
    clearSelection();
  }

  function changeFilter(filter: keyof CalendarFilters, value: string) {
    setFilters((current) => {
      if (filter === "degreeId") {
        return { ...current, degreeId: value, subjectId: "", practiceId: "" };
      }
      if (filter === "subjectId") {
        return { ...current, subjectId: value, practiceId: "" };
      }
      return { ...current, [filter]: value };
    });
    clearSelection();
  }

  function clearFilters() {
    setFilters(emptyCalendarFilters);
    clearSelection();
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setAnchorId(null);
  }

  function selectSession(session: Session, event: ReactMouseEvent<HTMLButtonElement>) {
    const subjectSessions = filteredSemesterSessions.filter((item) => item.subjectId === session.subjectId);
    if (event.shiftKey && anchorId !== null) {
      const anchorIndex = subjectSessions.findIndex((item) => item.id === anchorId);
      const sessionIndex = subjectSessions.findIndex((item) => item.id === session.id);
      if (anchorIndex >= 0 && sessionIndex >= 0) {
        const first = Math.min(anchorIndex, sessionIndex);
        const last = Math.max(anchorIndex, sessionIndex);
        setSelectedIds(new Set(subjectSessions.slice(first, last + 1).map((item) => item.id)));
        return;
      }
    }
    setSelectedIds(new Set([session.id]));
    setAnchorId(session.id);
  }

  async function assignPractice(practiceId: number | null) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setAssigning(true);
    const changed = await onAssignPractice(ids, practiceId);
    setAssigning(false);
    if (changed) clearSelection();
  }

  async function assignTeacher(teacherId: number | null) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setAssigning(true);
    const changed = await onAssignTeacher(ids, teacherId);
    setAssigning(false);
    if (changed) clearSelection();
  }

  function formatCalendarTime(minutes: number) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function beginSessionDrag(event: ReactDragEvent<HTMLElement>, session: Session) {
    if (!canEdit) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(session.id));
    const bounds = event.currentTarget.getBoundingClientRect();
    const dragImage = event.currentTarget.cloneNode(true) as HTMLElement;
    dragImage.classList.remove(
      "weekly-session",
      "overlapping-session",
      "overlap-lane-0",
      "overlap-lane-1",
      "overlap-lane-2",
      "overlap-lane-3",
      "selected",
      "dragging",
      "moving",
    );
    dragImage.classList.add("session-drag-image");
    dragImage.style.width = `${bounds.width}px`;
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, Math.min(bounds.width / 2, 70), Math.min(bounds.height / 2, 28));
    window.setTimeout(() => dragImage.remove(), 0);
    setDraggedSessionId(session.id);
    setMonthDropDate(null);
    setWeekDropPreview(null);
    clearSelection();
  }

  function endSessionDrag() {
    setDraggedSessionId(null);
    setMonthDropDate(null);
    setWeekDropPreview(null);
  }

  async function moveDraggedSession(session: Session, sessionDate: string, startTime: string) {
    endSessionDrag();
    if (holidaysByDate.has(sessionDate)) return;
    if (session.sessionDate === sessionDate && session.startTime === startTime) return;
    setMovingSessionId(session.id);
    await onMoveSession(session.id, sessionDate, startTime);
    setMovingSessionId(null);
  }

  function previewMonthDrop(event: ReactDragEvent<HTMLDivElement>, date: string) {
    if (!draggedSession || date < activeSemester.startDate || date > activeSemester.endDate) return;
    event.preventDefault();
    if (holidaysByDate.has(date)) {
      event.dataTransfer.dropEffect = "none";
      setMonthDropDate(null);
      return;
    }
    event.dataTransfer.dropEffect = "move";
    setMonthDropDate(date);
  }

  function dropOnMonth(event: ReactDragEvent<HTMLDivElement>, date: string) {
    if (!draggedSession || date < activeSemester.startDate || date > activeSemester.endDate) return;
    event.preventDefault();
    if (holidaysByDate.has(date)) {
      endSessionDrag();
      return;
    }
    void moveDraggedSession(draggedSession, date, draggedSession.startTime);
  }

  function weeklyDropDestination(event: ReactDragEvent<HTMLDivElement>, date: string, session: Session) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const rangeMinutes = (calendarWeekEndHour - calendarWeekStartHour) * 60;
    const rawMinutes = calendarWeekStartHour * 60 + (relativeY / bounds.height) * rangeMinutes;
    const snappedMinutes = Math.round(rawMinutes / 30) * 30;
    const latestStart = Math.max(
      calendarWeekStartHour * 60,
      Math.floor((calendarWeekEndHour * 60 - session.duration) / 30) * 30,
    );
    const startMinutes = Math.max(calendarWeekStartHour * 60, Math.min(snappedMinutes, latestStart));
    const clippedEnd = Math.min(startMinutes + session.duration, calendarWeekEndHour * 60);
    return {
      date,
      startTime: formatCalendarTime(startMinutes),
      top: ((startMinutes - calendarWeekStartHour * 60) / 60) * calendarWeekHourHeight + 4,
      height: Math.max(34, ((clippedEnd - startMinutes) / 60) * calendarWeekHourHeight - 8),
    };
  }

  function previewWeekDrop(event: ReactDragEvent<HTMLDivElement>, date: string) {
    if (!draggedSession || date < activeSemester.startDate || date > activeSemester.endDate) return;
    event.preventDefault();
    if (holidaysByDate.has(date)) {
      event.dataTransfer.dropEffect = "none";
      setWeekDropPreview(null);
      return;
    }
    event.dataTransfer.dropEffect = "move";
    setWeekDropPreview(weeklyDropDestination(event, date, draggedSession));
  }

  function dropOnWeek(event: ReactDragEvent<HTMLDivElement>, date: string) {
    if (!draggedSession || date < activeSemester.startDate || date > activeSemester.endDate) return;
    event.preventDefault();
    if (holidaysByDate.has(date)) {
      endSessionDrag();
      return;
    }
    const destination = weeklyDropDestination(event, date, draggedSession);
    void moveDraggedSession(draggedSession, destination.date, destination.startTime);
  }

  function renderSession(session: Session, weekly = false, weeklyPosition?: WeeklySessionPosition) {
    const start = calendarSessionStartMinutes(session);
    const clippedStart = Math.max(start, calendarWeekStartHour * 60);
    const clippedEnd = Math.min(start + session.duration, calendarWeekEndHour * 60);
    const weeklyStyle = weekly ? {
      top: `${((clippedStart - calendarWeekStartHour * 60) / 60) * calendarWeekHourHeight + 4}px`,
      height: `${Math.max(34, ((clippedEnd - clippedStart) / 60) * calendarWeekHourHeight - 8)}px`,
      ...(weeklyPosition ? {
        left: `calc(${weeklyPosition.lane * (100 / weeklyPosition.laneCount)}% + 3px)`,
        right: "auto",
        width: `calc(${100 / weeklyPosition.laneCount}% - 6px)`,
      } : {}),
    } : undefined;

    return (
      <article
        className={`session-event ${weekly ? "weekly-session" : "monthly-session"}${weeklyPosition && weeklyPosition.laneCount > 1 ? ` overlapping-session overlap-lane-${weeklyPosition.lane % 4}` : ""}${session.practiceId === null ? " incomplete" : ""}${selectedIds.has(session.id) ? " selected" : ""}${draggedSessionId === session.id ? " dragging" : ""}${movingSessionId === session.id ? " moving" : ""}`}
        key={session.id}
        style={weeklyStyle}
        draggable={canEdit && movingSessionId === null}
        aria-roledescription={canEdit ? "Sesión arrastrable" : undefined}
        onDragStart={canEdit ? (event) => beginSessionDrag(event, session) : undefined}
        onDragEnd={canEdit ? endSessionDrag : undefined}
      >
        <button
          className="session-event-main"
          type="button"
          aria-pressed={selectedIds.has(session.id)}
          onClick={(event) => selectSession(session, event)}
          onDoubleClick={canEdit ? () => onEdit(session) : undefined}
          aria-label={`Seleccionar ${session.practiceName || "sesión sin práctica"}, ${session.groupCode ? `grupo ${session.groupCode}` : "sin grupo"}`}
          title={canEdit ? "Arrastra para cambiar día y hora · doble clic para editar" : "Clic para seleccionar y exportar"}
        >
          {weekly ? (
            <>
              <strong className="weekly-practice-name" title={session.practiceName ?? "Sin práctica"}>{session.practiceName ?? "Sin práctica"}</strong>
              <small className="weekly-session-details" title={`${session.subjectName} · ${session.degreeName} · ${session.groupCode ? `Grupo ${session.groupCode}` : "Sin grupo"} · ${session.teacherName ?? "Profesor sin asignar"}`}>
                {session.subjectAbbreviation || session.subjectCode}-{session.degreeCode} · {session.groupCode ? `G${session.groupCode}` : "G—"} · {session.teacherCode ? `Prof. ${session.teacherCode}` : <span className="session-teacher-unassigned">Prof. sin asignar</span>}
              </small>
            </>
          ) : (
            <span className="monthly-session-line">
              <b>{session.startTime.replace(/^0/, "")}</b>
              <strong>{session.practiceCode || "—"}</strong>
              <small>{session.subjectAbbreviation || session.subjectCode}-{session.degreeCode} · {session.groupCode ? `G${session.groupCode}` : "G—"}</small>
            </span>
          )}
        </button>
        {canEdit && <button className="session-event-delete" type="button" onClick={() => { clearSelection(); onDelete(session); }} aria-label={`Eliminar sesión de ${session.practiceName || session.subjectCode || "laboratorio"}`}>×</button>}
      </article>
    );
  }

  function renderListSession(session: Session) {
    const formattedDate = calendarListDateFormatter.format(parseLocalDate(session.sessionDate));
    const selected = selectedIds.has(session.id);
    return (
      <article
        className={`calendar-list-session${session.practiceId === null ? " incomplete" : ""}${selected ? " selected" : ""}`}
        key={session.id}
        role="listitem"
      >
        <span className="calendar-list-select-indicator" aria-hidden="true">{selected ? "✓" : ""}</span>
        <button
          className="calendar-list-main"
          type="button"
          aria-pressed={selected}
          aria-label={`Seleccionar ${session.practiceName || "sesión sin práctica"} del ${formattedDate} a las ${session.startTime}, ${session.groupCode ? `grupo ${session.groupCode}` : "sin grupo"}`}
          onClick={(event) => selectSession(session, event)}
          onDoubleClick={canEdit ? () => onEdit(session) : undefined}
          title={canEdit ? "Clic para seleccionar · doble clic para editar" : "Clic para seleccionar y exportar"}
        >
          <SessionListColumns session={session} />
        </button>
        {canEdit && <button className="calendar-list-delete" type="button" onClick={() => { clearSelection(); onDelete(session); }} aria-label={`Eliminar sesión de ${session.practiceName || session.subjectCode || "laboratorio"}`}>×</button>}
      </article>
    );
  }

  return (
    <section className="calendar-shell" aria-label="Calendario de sesiones">
      <SemesterFocus
        className="calendar-semester-focus"
        semesterId={selectedSemester}
        semesters={availableSemesters}
        onChange={changeSemester}
      />
      <div className="calendar-toolbar">
        <div>
          <span className="section-kicker">Planificación {calendarView === "month" ? "mensual" : calendarView === "week" ? "semanal" : "en lista"}</span>
          <h2>{calendarView === "month" ? monthLabel : calendarView === "week" ? weekLabel : "Sesiones ordenadas"}</h2>
        </div>
        <div className="calendar-toolbar-side">
          <div className="calendar-view-switch" role="group" aria-label="Vista del calendario">
            <button type="button" aria-pressed={calendarView === "month"} onClick={() => changeCalendarView("month")}>Mes</button>
            <button type="button" aria-pressed={calendarView === "week"} onClick={() => changeCalendarView("week")}>Semana</button>
            <button type="button" aria-pressed={calendarView === "list"} onClick={() => changeCalendarView("list")}>Lista</button>
          </div>
          {canEdit && <button className="calendar-delete-button" type="button" disabled={!allSemesterSessionIds.length || deleting} onClick={() => void deleteSemesterSessions()}>Borrar semestre</button>}
          <span className="incomplete-legend"><i /> Incompleta: sin práctica</span>
          {calendarView !== "list" && (
            <div className="calendar-navigation" aria-label={calendarView === "month" ? "Navegar por meses" : "Navegar por semanas"}>
              <button type="button" disabled={!canMovePrevious} onClick={() => moveCalendar(-1)} aria-label={calendarView === "month" ? "Mes anterior del semestre" : "Semana anterior del semestre"}>←</button>
              <button type="button" onClick={goToToday}>{semesterFromDate(referenceDate) === selectedSemester ? "Hoy" : "Inicio"}</button>
              <button type="button" disabled={!canMoveNext} onClick={() => moveCalendar(1)} aria-label={calendarView === "month" ? "Mes siguiente del semestre" : "Semana siguiente del semestre"}>→</button>
            </div>
          )}
        </div>
      </div>
      <div className={hasActiveFilters ? "calendar-filters active" : "calendar-filters"} aria-label="Filtros del calendario">
        <div className="calendar-filter-head">
          <span>Filtrar sesiones</span>
          <strong aria-live="polite">{filteredSemesterSessions.length} de {semesterSessions.length} {semesterSessions.length === 1 ? "sesión" : "sesiones"}</strong>
        </div>
        <div className="calendar-filter-controls">
          <label>
            <span>Laboratorio</span>
            <select aria-label="Filtrar por laboratorio" value={filters.laboratoryId} onChange={(event) => changeFilter("laboratoryId", event.target.value)}>
              <option value="">Todos los laboratorios</option>
              {laboratories.map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.code} · {laboratory.name}</option>)}
            </select>
          </label>
          <label>
            <span>Instalación</span>
            <select aria-label="Filtrar por instalación" value={filters.installationId} onChange={(event) => changeFilter("installationId", event.target.value)}>
              <option value="">Todas las instalaciones</option>
              {installations.map((installation) => <option key={installation.id} value={installation.id}>{installation.code} · {installation.name}</option>)}
            </select>
          </label>
          <label>
            <span>Grado</span>
            <select aria-label="Filtrar por grado" value={filters.degreeId} onChange={(event) => changeFilter("degreeId", event.target.value)}>
              <option value="">Todos los grados</option>
              {degrees.map((degree) => <option key={degree.id} value={degree.id}>{degree.code} · {degree.name}</option>)}
            </select>
          </label>
          <label>
            <span>Asignatura</span>
            <select aria-label="Filtrar por asignatura" value={filters.subjectId} disabled={Boolean(filters.degreeId) && !filterSubjects.length} onChange={(event) => changeFilter("subjectId", event.target.value)}>
              <option value="">{filters.degreeId ? filterSubjects.length ? "Todas las asignaturas del grado" : "Este grado no tiene asignaturas" : "Todas las asignaturas"}</option>
              {filterSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}
            </select>
          </label>
          <label>
            <span>Práctica</span>
            <select aria-label="Filtrar por práctica" value={filters.practiceId} onChange={(event) => changeFilter("practiceId", event.target.value)}>
              <option value="">Todas las prácticas</option>
              {practices.map((practice) => <option key={practice.id} value={practice.id}>{practice.code} · {practice.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={!hasActiveFilters} onClick={clearFilters}>Limpiar filtros</button>
        </div>
      </div>
      <div className={selectedIds.size ? "calendar-selection-bar active" : "calendar-selection-bar"}>
        {selectedIds.size ? (
          <>
            <strong>{selectedIds.size} {selectedIds.size === 1 ? "sesión seleccionada" : "sesiones seleccionadas"}</strong>
            <span>{canEdit
              ? calendarView === "list" ? "Shift + clic amplía el rango · Esc limpia" : "Arrastra para mover · Shift + clic amplía el rango"
              : "Exporta la selección en PDF o ICS · Esc limpia"}</span>
            <SessionSelectionActions
              sessions={selectedSessions}
              practices={practices}
              subjects={subjects}
              teachers={teachers}
              canEdit={canEdit}
              assigning={assigning}
              deleting={deleting}
              onAssignTeacher={(teacherId) => void assignTeacher(teacherId)}
              onAssignPractice={(practiceId) => void assignPractice(practiceId)}
              onDelete={() => void deleteSelectedSessions()}
              onClear={clearSelection}
            />
          </>
        ) : (
          <span>{canEdit
            ? calendarView === "list" ? "Selecciona una sesión para mostrar la barra de acciones. Shift + clic selecciona un rango y Esc limpia la selección." : "Selecciona una sesión para asignar práctica o profesor. Arrastra una sesión para cambiar su día y hora."
            : "Modo de solo lectura: selecciona sesiones para exportarlas en PDF o ICS."}</span>
        )}
      </div>
      {calendarView === "month" ? (
        <div className="calendar-scroll">
          <div className="calendar-body">
            <div className="calendar-weekdays" aria-hidden="true">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="calendar-grid" role="grid">
              {days.map((day) => {
                const date = localIsoDate(day);
                const dateSessions = sessionsByDate.get(date) ?? [];
                const holiday = holidaysByDate.get(date);
                const dayType = dayTypesByDate.get(date);
                const outsideMonth = day.getMonth() !== visibleMonth.getMonth();
                return (
                  <div
                    className={`calendar-day${outsideMonth ? " outside" : ""}${date === today ? " today" : ""}${holiday ? " holiday" : ""}${monthDropDate === date ? " drop-target" : ""}`}
                    key={date}
                    role="gridcell"
                    tabIndex={-1}
                    aria-disabled={Boolean(holiday)}
                    title={holiday ? "Día festivo · no se pueden programar sesiones" : undefined}
                    aria-label={`${day.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}${dayType ? `, tipo de día ${dayType}` : ""}${holiday ? ", día festivo" : ""}, ${dateSessions.length} ${dateSessions.length === 1 ? "sesión" : "sesiones"}`}
                    onDragOver={canEdit ? (event) => previewMonthDrop(event, date) : undefined}
                    onDrop={canEdit ? (event) => dropOnMonth(event, date) : undefined}
                  >
                    <span className="calendar-day-number">{day.getDate()}</span>
                    {dayType && <span className="calendar-day-type" aria-label={`Tipo de día ${dayType}`}>{dayType}</span>}
                    {holiday && <span className="calendar-holiday-label">Festivo</span>}
                    <div className="calendar-events">
                      {monthDropDate === date && draggedSession && draggedSession.sessionDate !== date && (
                        <div className={`session-event monthly-session calendar-month-drop-preview${draggedSession.practiceId === null ? " incomplete" : ""}`} aria-hidden="true">
                          <div className="session-event-main">
                            <span className="monthly-session-line">
                              <b>{draggedSession.startTime.replace(/^0/, "")}</b>
                              <strong>{draggedSession.practiceCode || "—"}</strong>
                              <small>{draggedSession.subjectAbbreviation || draggedSession.subjectCode}-{draggedSession.degreeCode} · {draggedSession.groupCode ? `G${draggedSession.groupCode}` : "G—"}</small>
                            </span>
                            <em>Soltar aquí</em>
                          </div>
                          <span className="session-drop-indicator">↳</span>
                        </div>
                      )}
                      {dateSessions.map((session) => renderSession(session))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : calendarView === "week" ? (
        <div className="calendar-week-scroll">
          <div
            className="calendar-week-grid"
            role="grid"
            aria-label="Vista semanal de 08:00 a 19:00"
            style={{ minWidth: `${weeklyGridMinWidth}px`, gridTemplateColumns: `58px repeat(${weekDays.length}, minmax(${weeklyDayMinWidth}px, 1fr))` }}
          >
            <div className="calendar-week-corner" style={{ gridColumn: 1, gridRow: 1 }}>Hora</div>
            {weekDays.map((day, dayIndex) => {
              const date = localIsoDate(day);
              const holiday = holidaysByDate.get(date);
              return (
                <div
                  className={`calendar-week-heading${date === today ? " today" : ""}${holiday ? " holiday" : ""}`}
                  style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                  key={`heading-${date}`}
                >
                  <span>{academicWeekdayLabel(day, date, dayTypesByDate, "short")}</span>
                  <strong>{day.getDate()}</strong>
                  {holiday && <small>Festivo</small>}
                </div>
              );
            })}
            <div className="calendar-week-times" style={{ height: `${(calendarWeekEndHour - calendarWeekStartHour) * calendarWeekHourHeight}px`, gridColumn: 1, gridRow: 2 }} aria-hidden="true">
              {weekHours.map((hour, index) => <span key={hour} style={{ top: `${index * calendarWeekHourHeight}px` }}>{String(hour).padStart(2, "0")}:00</span>)}
            </div>
            {weekDays.map((day, dayIndex) => {
              const date = localIsoDate(day);
              const positionedSessions = weeklyLayout.byDate.get(date) ?? [];
              const holiday = holidaysByDate.get(date);
              const dayType = dayTypesByDate.get(date);
              const outsideSemester = date < activeSemester.startDate || date > activeSemester.endDate;
              return (
                <div
                  className={`calendar-week-column${outsideSemester ? " outside" : ""}${date === today ? " today" : ""}${holiday ? " holiday" : ""}${weekDropPreview?.date === date ? " drop-target" : ""}`}
                  style={{ height: `${(calendarWeekEndHour - calendarWeekStartHour) * calendarWeekHourHeight}px`, gridColumn: dayIndex + 2, gridRow: 2 }}
                  key={`column-${date}`}
                  role="gridcell"
                  tabIndex={-1}
                  aria-disabled={Boolean(holiday)}
                  title={holiday ? "Día festivo · no se pueden programar sesiones" : undefined}
                  aria-label={`${day.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}${dayType ? `, tipo de día ${dayType}` : ""}${holiday ? ", día festivo" : ""}, ${positionedSessions.length} ${positionedSessions.length === 1 ? "sesión" : "sesiones"} entre las 08:00 y las 19:00`}
                  onDragOver={canEdit ? (event) => previewWeekDrop(event, date) : undefined}
                  onDrop={canEdit ? (event) => dropOnWeek(event, date) : undefined}
                >
                  {weekDropPreview?.date === date && (
                    <div className="calendar-drop-preview" style={{ top: weekDropPreview.top, height: weekDropPreview.height }}>
                      <strong>{weekDropPreview.startTime}</strong>
                      <span>Soltar aquí</span>
                    </div>
                  )}
                  {positionedSessions.map((position) => renderSession(position.session, true, position))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="calendar-list" aria-label={`Sesiones de ${selectedSemester} ordenadas cronológicamente`}>
          {filteredSemesterSessions.length ? (
            [...sessionsByDate.entries()].map(([date, dateSessions]) => {
              const day = parseLocalDate(date);
              const dayNumber = day.toLocaleDateString("es-ES", { day: "numeric" });
              const month = day.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
              const weekday = academicWeekdayLabel(day, date, dayTypesByDate);
              return (
                <section className="calendar-list-day" key={date} aria-labelledby={`calendar-list-day-${date}`}>
                  <header className="calendar-list-day-header">
                    <time dateTime={date}>
                      <span className="calendar-list-day-number">{dayNumber}</span>
                      <span className="calendar-list-day-copy">
                        <strong id={`calendar-list-day-${date}`}>{weekday}</strong>
                        <small>{month} {day.getFullYear()}</small>
                      </span>
                    </time>
                    <span>{dateSessions.length} {dateSessions.length === 1 ? "sesión" : "sesiones"}</span>
                  </header>
                  <div className="calendar-list-day-sessions" role="list">
                    {dateSessions.map(renderListSession)}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="calendar-list-empty" role="status">
              <span aria-hidden="true">≡</span>
              <strong>No hay sesiones para mostrar</strong>
              <p>{hasActiveFilters ? "Prueba a limpiar los filtros del calendario." : `El semestre ${selectedSemester} no tiene sesiones programadas.`}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function IcsImportDialog({
  data,
  onClose,
  onImported,
}: {
  data: AppData;
  onClose: () => void;
  onImported: (result: IcsImportResult) => void | Promise<void>;
}) {
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<IcsPreview | null>(null);
  const [mappings, setMappings] = useState<Record<string, { teacherId: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function mappingKey(group: Pick<IcsPreviewGroup, "degreeCode" | "subjectCode">) {
    return `${group.degreeCode}:${group.subjectCode}`;
  }

  async function importResponse<T>(response: Response, fallbackMessage: string) {
    const body = await response.text();
    if (!body) throw new Error(fallbackMessage);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error(fallbackMessage);
    }
  }

  function friendlyImportError(problem: unknown, fallbackMessage: string) {
    const message = problem instanceof Error ? problem.message : fallbackMessage;
    if (/expected pattern|unexpected end|failed to fetch|networkerror|load failed/i.test(message)) {
      return "No se pudo transferir el archivo ICS. Vuelve a seleccionarlo y comprueba que sea un calendario válido.";
    }
    return message || fallbackMessage;
  }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      if (!file.name.toLowerCase().endsWith(".ics")) throw new Error("El archivo debe tener extensión .ics.");
      setFileName(file.name);
      setSelectedFile(file);
      const formData = new FormData();
      formData.append("action", "preview");
      formData.append("file", file, file.name);
      const response = await fetch(apiUrl("/api/import/ics"), {
        method: "POST",
        body: formData,
      });
      const result = await importResponse<IcsPreview & { error?: string }>(response, "El servidor no pudo analizar el archivo ICS.");
      if (!response.ok) throw new Error(result.error || "No se pudo analizar el calendario.");
      const initialMappings: Record<string, { teacherId: string }> = {};
      for (const group of result.groups) {
        initialMappings[mappingKey(group)] = {
          teacherId: "",
        };
      }
      setMappings(initialMappings);
      setPreview(result);
    } catch (problem) {
      setError(friendlyImportError(problem, "No se pudo analizar el calendario."));
    } finally {
      setBusy(false);
    }
  }

  async function importSessions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !selectedFile) return;
    setBusy(true);
    setError("");
    try {
      const importMappings = preview.groups.map((group) => ({
        degreeCode: group.degreeCode,
        subjectCode: group.subjectCode,
        teacherId: mappings[mappingKey(group)]?.teacherId
          ? Number(mappings[mappingKey(group)].teacherId)
          : null,
      }));
      const formData = new FormData();
      formData.append("action", "import");
      formData.append("file", selectedFile, selectedFile.name);
      formData.append("mappings", JSON.stringify(importMappings));
      const response = await fetch(apiUrl("/api/import/ics"), {
        method: "POST",
        body: formData,
      });
      const result = await importResponse<IcsImportResult & { error?: string }>(response, "El servidor no pudo importar el archivo ICS.");
      if (!response.ok) throw new Error(result.error || "No se pudieron importar las sesiones.");
      await onImported(result);
    } catch (problem) {
      setError(friendlyImportError(problem, "No se pudieron importar las sesiones."));
      setBusy(false);
    }
  }

  return (
    <div className="import-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="drawer-head">
          <div>
            <span className="entity-pill">ICS</span>
            <h2 id="import-title">Importar sesiones</h2>
            <p>Se importan las prácticas de laboratorio y se marcan los eventos cuyo SUMMARY comienza por “Día festivo”.</p>
          </div>
          <button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Cerrar importación">×</button>
        </div>

        <form className="ics-import-form" onSubmit={importSessions}>
          <label className="ics-file-picker">
            <input type="file" accept=".ics,text/calendar" disabled={busy} onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => void selectFile(event.target.files?.[0])} />
            <span>{busy && !preview ? "Analizando…" : fileName || "Seleccionar archivo ICS"}</span>
            <strong>Examinar</strong>
          </label>

          {error && <div className="ics-error" role="alert">{error}</div>}

          {preview && (
            <>
              <div className="ics-summary">
                <div><strong>{preview.eligibleCount}</strong><span>sesiones válidas</span></div>
                <div><strong>{preview.holidayCount}</strong><span>días festivos</span></div>
                <div><strong>{preview.ignoredCount}</strong><span>eventos omitidos</span></div>
                <div><strong>{preview.groups.length}</strong><span>asignaturas</span></div>
              </div>

              {preview.holidayConflictCount > 0 && (
                <div className="dependency-message">
                  {preview.holidayConflictCount === 1
                    ? "Una sesión coincide con un día festivo y no se importará."
                    : `${preview.holidayConflictCount} sesiones coinciden con días festivos y no se importarán.`}
                </div>
              )}

              {preview.groups.length === 0 ? (
                <div className="dependency-message">
                  {preview.holidayCount
                    ? "El archivo contiene únicamente días festivos; no es necesario configurar asignaturas."
                    : "No hay prácticas de laboratorio ni días festivos reconocibles en el archivo."}
                </div>
              ) : (
                <div className="ics-mapping-list">
                  {preview.groups.map((group) => {
                    const key = mappingKey(group);
                    const mapping = mappings[key] ?? { teacherId: "" };
                    return (
                      <fieldset className="ics-mapping" key={key}>
                        <legend><strong>{group.subjectCode}</strong> · {group.subjectName}</legend>
                        <p>{group.eventCount} sesiones · Grupos detectados: <b>{group.groupCodes.join(", ")}</b> · {group.firstDate} — {group.lastDate} · Grado detectado: <b>{group.degreeCode}</b></p>
                        <div className={`ics-auto-target${group.existingSubjectId ? " existing" : " new"}`}>
                          <span>{group.existingSubjectId ? "Asignatura encontrada" : "Creación automática"}</span>
                          <strong>{group.existingSubjectCode || group.subjectCode} · {group.existingSubjectName || group.subjectName}</strong>
                          <small>
                            {group.existingSubjectId
                              ? `Se asociará al grado ${group.existingSubjectDegreeCode} · ${group.existingSubjectDegreeName}`
                              : group.existingDegreeId
                                ? `Se creará en el grado existente ${group.existingDegreeCode} · ${group.existingDegreeName}`
                                : `También se creará el grado ${group.degreeCode} · Grado ${group.degreeCode}`}
                          </small>
                        </div>
                        <label>
                          <span>Profesor (opcional)</span>
                          <select
                            value={mapping.teacherId}
                            onChange={(event) => setMappings((current) => ({ ...current, [key]: { ...mapping, teacherId: event.target.value } }))}
                          >
                            <option value="">Sin profesor asignado</option>
                            {data.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.code} · {teacher.name}</option>)}
                          </select>
                        </label>
                      </fieldset>
                    );
                  })}
                </div>
              )}

              <div className="form-summary">
                <span aria-hidden="true">i</span>
                <p>El código de cinco dígitos de SUMMARY identifica la asignatura y el número que sigue a “Grupo:” se guarda en cada sesión. Si la asignatura no existe, se crea automáticamente; también se crea su grado usando los tres primeros dígitos cuando sea necesario. Las sesiones se importan sin práctica y, por defecto, sin profesor. Los eventos “Día festivo” se marcan directamente en el calendario y las sesiones coincidentes se excluyen.</p>
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={busy || !preview || preview.eligibleCount + preview.holidayCount === 0}>{busy && preview ? "Importando…" : "Importar calendario"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
