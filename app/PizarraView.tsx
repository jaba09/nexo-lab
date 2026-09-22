"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./pizarra.css";
import { semesterDefinition, semesterFromDate, semesterOptions } from "../lib/semesters";
import { layoutPizarraClasses, pizarraAddDays, pizarraDate, pizarraMinutes, pizarraTime, pizarraWeek, type PizarraClass, type PizarraData } from "../lib/pizarra";

const dayFormatter = new Intl.DateTimeFormat("es", { weekday: "long" });
const dateFormatter = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric" });
const normalizedName = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}]/gu, "");
const typeLabel = (item: PizarraClass) => item.teachingType === "CM" ? "Clase magistral" : "Problemas";
const endTime = (item: PizarraClass) => pizarraTime(pizarraMinutes(item.startTime) + item.duration);
const inSemester = (item: PizarraClass, semester: string) => semesterFromDate(item.date) === semester;

export default function PizarraView({ teacherName, startHour, endHour }: { teacherName: string; startHour: number; endHour: number }) {
  const [data, setData] = useState<PizarraData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [semester, setSemester] = useState("");
  const [teacher, setTeacher] = useState("");
  const [subject, setSubject] = useState("");
  const [teachingType, setTeachingType] = useState("");
  const [date, setDate] = useState(() => pizarraDate(new Date()));
  const [detail, setDetail] = useState<PizarraClass | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    async function load() {
    try {
      const response = await fetch("/api/pizarra", { cache: "no-store", signal });
      const result = await response.json() as PizarraData & { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo cargar Pizarra.");
      if (signal?.aborted) return;
      const today = pizarraDate(new Date());
      const currentSemester = semesterFromDate(today);
      const selectedSemester = result.classes.some((item) => inSemester(item, currentSemester)) ? currentSemester : semesterFromDate(result.classes[0].date);
      const selectedTeacher = result.teachers.find((name) => normalizedName(name) === normalizedName(teacherName)) ?? "";
      const firstClass = result.classes.find((item) => inSemester(item, selectedSemester) && (!selectedTeacher || item.teachers.includes(selectedTeacher)));
      setData(result);
      setSemester(selectedSemester);
      setTeacher(selectedTeacher);
      setDate(selectedSemester === currentSemester ? today : firstClass?.date ?? semesterDefinition(selectedSemester).startDate);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "No se pudo cargar Pizarra.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
    }
    void load();
    return () => controller.abort();
  }, [teacherName, retry]);

  const semesterClasses = useMemo(() => data?.classes.filter((item) => inSemester(item, semester)) ?? [], [data, semester]);
  const filtered = useMemo(() => semesterClasses.filter((item) => (
    (!teacher || (teacher === "__unmatched" ? !item.teachers.length : item.teachers.includes(teacher)))
    && (!subject || item.subjectCode === subject)
    && (!teachingType || item.teachingType === teachingType)
  )), [semesterClasses, teacher, subject, teachingType]);
  const week = pizarraWeek(date);
  const lastDate = pizarraAddDays(week, 6);
  const weekClasses = filtered.filter((item) => item.date >= week && item.date <= lastDate);

  if (loading) return <div className="loading-state" role="status">Cargando las clases de pizarra…</div>;
  if (error || !data) return <div className="pizarra-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={() => { setError(""); setLoading(true); setRetry((value) => value + 1); }}>Reintentar</button></div>;

  const definition = semesterDefinition(semester);
  const semesters = semesterOptions(data.classes.map((item) => item.date), data.classes[0].date).filter((option) => data.classes.some((item) => inSemester(item, option.id)));
  const subjects = [...new Map(semesterClasses.filter((item) => !teacher || (teacher === "__unmatched" ? !item.teachers.length : item.teachers.includes(teacher))).map((item) => [item.subjectCode, item.subjectName])).entries()].sort(([a], [b]) => a.localeCompare(b));
  const hasWeekend = weekClasses.some((item) => [0, 6].includes(new Date(`${item.date}T12:00:00`).getDay()));
  const days = Array.from({ length: hasWeekend ? 7 : 5 }, (_, index) => pizarraAddDays(week, index));
  const positions = days.map((day) => layoutPizarraClasses(weekClasses.filter((item) => item.date === day)));
  const firstHour = Math.min(startHour, ...weekClasses.map((item) => Math.floor(pizarraMinutes(item.startTime) / 60)));
  const finalHour = Math.max(endHour, ...weekClasses.map((item) => Math.ceil((pizarraMinutes(item.startTime) + item.duration) / 60)));
  const hours = Array.from({ length: finalHour - firstHour + 1 }, (_, index) => firstHour + index);
  const hourHeight = 88;
  const gridHeight = (finalHour - firstHour) * hourHeight;
  const columnWidths = positions.map((items) => Math.max(144, ...items.map((item) => item.lanes * 124)));
  const gridColumns = `64px ${columnWidths.map((width) => `minmax(${width}px, 1fr)`).join(" ")}`;
  const shared = weekClasses.filter((item) => item.teachers.length > 1).length;

  function changeSemester(value: string) {
    setSemester(value);
    setSubject("");
    const first = data!.classes.find((item) => inSemester(item, value) && (!teacher || (teacher === "__unmatched" ? !item.teachers.length : item.teachers.includes(teacher))));
    setDate(first?.date ?? semesterDefinition(value).startDate);
  }

  function moveWeek(offset: number) {
    const target = pizarraAddDays(week, offset * 7);
    setDate(target < definition.startDate ? definition.startDate : target > definition.endDate ? definition.endDate : target);
  }

  return (
    <section className="pizarra-view">
      <div className="pizarra-heading">
        <div><span className="section-kicker">Docencia de pizarra</span><h1>Pizarra</h1><p>Clases magistrales y resolución de problemas por profesor.</p></div>
        <label><span>Semestre</span><select value={semester} onChange={(event) => changeSemester(event.target.value)}>{semesters.map((item) => <option key={item.id} value={item.id}>Semestre {item.number} · {item.academicYear}</option>)}</select></label>
      </div>

      <div className="pizarra-filters">
        <label><span>Profesor</span><select value={teacher} onChange={(event) => { setTeacher(event.target.value); setSubject(""); }}>
          <option value="">Todos los profesores</option>
          {data.teachers.map((name) => <option key={name} value={name}>{name}</option>)}
          <option value="__unmatched">Sin correspondencia en el reparto</option>
        </select></label>
        <label><span>Asignatura</span><select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="">Todas las asignaturas</option>{subjects.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
        <label><span>Tipo de clase</span><select value={teachingType} onChange={(event) => setTeachingType(event.target.value)}><option value="">Todos los tipos</option><option value="CM">Clase magistral</option><option value="Prob_casos">Resolución de problemas</option></select></label>
      </div>

      <div className="pizarra-week-toolbar">
        <div><h2>{dateFormatter.format(new Date(`${week}T12:00:00`))} – {dateFormatter.format(new Date(`${days.at(-1)}T12:00:00`))}</h2><p>{weekClasses.length} clases esta semana · {filtered.length} en el semestre{shared > 0 ? ` · ${shared} con reparto compartido` : ""}</p></div>
        <div className="pizarra-week-controls">
          <button type="button" aria-label="Semana anterior" disabled={week <= pizarraWeek(definition.startDate)} onClick={() => moveWeek(-1)}>‹</button>
          <button type="button" onClick={() => { const today = pizarraDate(new Date()); const target = semesterFromDate(today); if (semesters.some((item) => item.id === target)) { setSemester(target); setSubject(""); setDate(today); } }} disabled={!semesters.some((item) => item.id === semesterFromDate(pizarraDate(new Date())))}>Hoy</button>
          <input type="date" aria-label="Ir a una fecha de Pizarra" min={definition.startDate} max={definition.endDate} value={date} onChange={(event) => { const value = event.target.value; if (value >= definition.startDate && value <= definition.endDate) setDate(value); }} />
          <button type="button" aria-label="Semana siguiente" disabled={week >= pizarraWeek(definition.endDate)} onClick={() => moveWeek(1)}>›</button>
        </div>
      </div>
      <div className="pizarra-legend"><span className="pizarra-legend-cm">Clase magistral</span><span className="pizarra-legend-problems">Problemas</span><span>Calendario independiente de las sesiones de laboratorio</span></div>
      {shared > 0 && <p className="pizarra-shared-note">Borde discontinuo: reparto compartido. Se muestran los profesores asociados al grupo; el CSV no indica cuál imparte cada fecha.</p>}
      {!weekClasses.length && <div className="pizarra-empty" role="status"><span>No hay clases con estos filtros esta semana.</span>{filtered[0] && <button type="button" onClick={() => setDate(filtered[0].date)}>Ir a la primera clase</button>}</div>}

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The scroll region must be focusable for keyboard scrolling, including empty weeks. */}
      <div className="pizarra-scroll" role="region" aria-label="Calendario semanal de clases de pizarra" tabIndex={0}>
        <div className="pizarra-grid" style={{ gridTemplateColumns: gridColumns, minWidth: 64 + columnWidths.reduce((sum, width) => sum + width, 0) }}>
          <div className="pizarra-grid-corner">Hora</div>
          {days.map((day) => <div key={day} className={`pizarra-day-heading${day === pizarraDate(new Date()) ? " today" : ""}`}><span>{dayFormatter.format(new Date(`${day}T12:00:00`))}</span><strong>{Number(day.slice(-2))}</strong></div>)}
          <div className="pizarra-hours" style={{ height: gridHeight }}>{hours.map((hour) => <span key={hour} style={{ top: (hour - firstHour) * hourHeight }}>{pizarraTime(hour * 60)}</span>)}</div>
          {positions.map((items, index) => <div key={days[index]} className="pizarra-day-column" style={{ height: gridHeight, backgroundSize: `100% ${hourHeight}px` }}>
            {items.map(({ item, lane, lanes }) => (
              <button type="button" key={item.id} className={`pizarra-class ${item.teachingType === "CM" ? "lecture" : "problems"}${!item.teachers.length ? " unmatched" : ""}${item.teachers.length > 1 ? " shared" : ""}`}
                style={{ top: (pizarraMinutes(item.startTime) - firstHour * 60) / 60 * hourHeight + 2, height: Math.max(24, item.duration / 60 * hourHeight - 4), left: `calc(${lane / lanes * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                title={`${item.startTime}–${endTime(item)} · ${typeLabel(item)}\n${item.teachers.join(" / ") || "Sin correspondencia en el reparto"}\n${item.subjectCode} · ${item.subjectName}\nGrupo ${item.groupCode}${item.location ? `\n${item.location}` : ""}${item.teachers.length > 1 ? "\nReparto compartido: fechas individuales no determinadas." : ""}`}
                onClick={() => setDetail(item)}>
                <small>{item.startTime}–{endTime(item)} · {item.teachingType === "CM" ? "CM" : "Prob."}</small>
                <strong>{item.subjectCode} <span>G{item.groupCode}</span></strong>
                <span className="pizarra-teacher-names">{item.teachers.join(" / ") || "Sin profesor identificado"}</span>
              </button>
            ))}
          </div>)}
        </div>
      </div>

      <details className="pizarra-sources"><summary>Fuentes y correspondencias · {data.classes.length} clases · {data.teachers.length} profesores{data.summary.unmatchedClasses ? ` · ${data.summary.unmatchedClasses} clases sin correspondencia` : ""}</summary>
        <p>Calendario: {data.sources.calendar}. Reparto: {data.sources.assignments}.</p>
        <p>Se cruza código de asignatura, grupo, semestre y tipo de docencia. Los subgrupos de problemas se vinculan al grupo principal del CSV. Un grupo vacío en el CSV se aplica a todos los grupos de esa asignatura y tipo.</p>
        <p>Las horas totales del reparto no permiten atribuir fechas a un profesor cuando hay varios. Esas clases aparecen como reparto compartido, sin sumar las horas como docencia individual confirmada.</p>
        {data.summary.duplicateRows > 0 && <p>{data.summary.duplicateRows} filas idénticas del reparto se han considerado una sola vez.</p>}
        {!!data.summary.classesWithoutAssignments.length && <><h3>Clases sin correspondencia</h3><ul>{data.summary.classesWithoutAssignments.map((label) => <li key={label}>{label}</li>)}</ul></>}
        {!!data.summary.assignmentsWithoutClasses.length && <><h3>Repartos sin clases coincidentes en el ICS</h3><ul>{data.summary.assignmentsWithoutClasses.map((label) => <li key={label}>{label}</li>)}</ul></>}
      </details>

      {detail && <PizarraDetails detail={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

function PizarraDetails({ detail, onClose }: { detail: PizarraClass; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
      <dialog ref={dialog} aria-labelledby="pizarra-detail-title" className="pizarra-detail" onCancel={onClose}>
        <button type="button" className="pizarra-close" aria-label="Cerrar detalle de clase" onClick={onClose}>×</button>
        <span className="section-kicker">{typeLabel(detail)} · G{detail.groupCode}</span><h2 id="pizarra-detail-title">{detail.subjectCode} · {detail.subjectName}</h2>
        <p>{dateFormatter.format(new Date(`${detail.date}T12:00:00`))} · {detail.startTime}–{endTime(detail)}</p>
        <h3>{detail.teachers.length > 1 ? "Profesores del reparto" : "Profesor"}</h3><p>{detail.teachers.join(" / ") || "No se ha encontrado un reparto para este grupo, tipo y semestre."}</p>
        {detail.teachers.length > 1 && <p className="pizarra-shared-note">El reparto no especifica qué profesor imparte esta fecha.</p>}
        {detail.location && <><h3>Aula</h3><p>{detail.location}</p></>}
      </dialog>
  );
}
