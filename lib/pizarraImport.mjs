import { decodeText, parseDateTime, readProperty, unfoldLines } from "./ics.ts";
import { parseCsvRecords } from "./sessionAssignmentImport.ts";

const normalize = (value) => value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
const orderNames = (a, b) => a.replace(/^(?:\p{L}\.)+\s*/u, "").localeCompare(b.replace(/^(?:\p{L}\.)+\s*/u, ""), "es");

function groupsIn(value) {
  if (!value) return [];
  if (/^\d+$/.test(value)) return [value];
  // The source uses 872-3 for groups 872 and 873.
  const range = /^(\d+)-(\d+)$/.exec(value);
  if (!range) throw new Error(`Grupo CSV no reconocido: ${value}.`);
  const start = Number(range[1]);
  const end = Number(range[1].slice(0, range[1].length - range[2].length) + range[2]);
  if (end < start || end - start > 50) throw new Error(`Rango de grupos no válido: ${value}.`);
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
}

export function buildPizarraData(ics, csv, sources = { calendar: "calendario.ics", assignments: "reparto.csv" }) {
  const records = parseCsvRecords(csv.replace(/^\uFEFF/, ""));
  const headers = records.shift()?.values.map(normalize) ?? [];
  const required = ["codigo", "grupo", "semestre", "tipo_docen", "profesor", "horas"];
  if (required.some((name) => !headers.includes(name))) throw new Error(`El CSV debe incluir: ${required.join(", ")}.`);
  const assignments = [];
  const seenRows = new Set();
  let duplicateRows = 0;
  for (const record of records) {
    const row = Object.fromEntries(headers.map((header, index) => [header, (record.values[index] ?? "").trim()]));
    if (row.tipo_docen !== "CM" && row.tipo_docen !== "Prob_casos") continue;
    const hours = Number(row.horas.replace(",", "."));
    if (!/^\d{5}$/.test(row.codigo) || !/^[12]$/.test(row.semestre) || !row.profesor || !Number.isFinite(hours) || hours < 0) {
      throw new Error(`Fila ${record.rowNumber}: código, semestre, profesor u horas no válidos.`);
    }
    if (hours === 0) continue;
    const key = JSON.stringify(required.map((name) => row[name]));
    if (seenRows.has(key)) { duplicateRows++; continue; }
    seenRows.add(key);
    assignments.push({ ...row, groups: groupsIn(row.grupo), used: false });
  }
  if (!assignments.length) throw new Error("El CSV no contiene reparto de CM o Prob_casos con horas positivas.");
  if (!ics.includes("BEGIN:VCALENDAR") || !ics.includes("END:VCALENDAR")) throw new Error("El archivo ICS no es un calendario completo.");
  const events = [];
  let current = null;
  for (const line of unfoldLines(ics)) {
    if (line === "BEGIN:VEVENT") current = new Map();
    else if (line === "END:VEVENT") { if (current) events.push(current); current = null; }
    else if (current) {
      const parsed = readProperty(line);
      if (parsed && !current.has(parsed.name)) current.set(parsed.name, parsed.property);
    }
  }
  const classes = [];
  const seenClasses = new Set();
  let ignoredEvents = 0;
  let duplicateEvents = 0;
  for (const event of events) {
    const summary = decodeText(event.get("SUMMARY")?.value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
    const metadata = /^(\d{5})\s*-\s*(.+?)\s+Grupo\s*:\s*(\d+)\s*-\s*(Clase Magistral|Resolución de problemas.*)$/iu.exec(summary);
    if (!metadata || event.get("STATUS")?.value === "CANCELLED") { ignoredEvents++; continue; }
    if (event.has("RRULE") || event.has("RECURRENCE-ID") || event.has("EXDATE")) throw new Error(`El ICS contiene recurrencias sin expandir: ${summary}. Exporta las clases con sus fechas individuales.`);
    const start = event.has("DTSTART") ? parseDateTime(event.get("DTSTART")) : null;
    const end = event.has("DTEND") ? parseDateTime(event.get("DTEND")) : null;
    const duration = start && end ? (end.timestamp - start.timestamp) / 60_000 : 0;
    if (!start || !end || start.sessionDate !== end.sessionDate || !Number.isInteger(duration) || duration <= 0) throw new Error(`Horario no válido: ${summary}.`);
    const subjectCode = metadata[1];
    const groupCode = metadata[3];
    const teachingType = normalize(metadata[4]) === "clase magistral" ? "CM" : "Prob_casos";
    const month = Number(start.sessionDate.slice(5, 7));
    const semester = month >= 9 || month === 1 ? "1" : "2";
    const id = [subjectCode, groupCode, teachingType, start.sessionDate, start.startTime, duration].join(":");
    if (seenClasses.has(id)) { duplicateEvents++; continue; }
    seenClasses.add(id);
    const candidates = assignments.filter((row) => row.codigo === subjectCode && row.semestre === semester && row.tipo_docen === teachingType);
    const scored = candidates.map((row) => ({ row, score: row.groups.length ? Math.max(-1, ...row.groups.map((group) => (
      group === groupCode ? group.length + 100 : teachingType === "Prob_casos" && groupCode.startsWith(group) ? group.length : -1
    ))) : 0 })).filter(({ score }) => score >= 0);
    const best = Math.max(-1, ...scored.map(({ score }) => score));
    const matching = scored.filter(({ score }) => score === best).map(({ row }) => row);
    matching.forEach((row) => { row.used = true; });
    // Totals do not identify dates. Keep the complete teaching team without inventing a chronological allocation.
    const teachers = [...new Set(matching.map((row) => row.profesor))].sort(orderNames);
    classes.push({ id, subjectCode, subjectName: metadata[2].trim(), groupCode, teachingType,
      date: start.sessionDate, startTime: start.startTime, duration,
      location: decodeText(event.get("LOCATION")?.value ?? ""), teachers });
  }
  if (!classes.length) throw new Error("El ICS no contiene clases magistrales ni resolución de problemas.");
  classes.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  return {
    sources,
    classes,
    teachers: [...new Set(assignments.map((row) => row.profesor))].sort(orderNames),
    summary: {
      calendarEvents: events.length, ignoredEvents, duplicateEvents, duplicateRows,
      sharedClasses: classes.filter((item) => item.teachers.length > 1).length,
      unmatchedClasses: classes.filter((item) => item.teachers.length === 0).length,
      assignmentsWithoutClasses: [...new Set(assignments.filter((row) => !row.used).map((row) => `${row.codigo} · ${row.profesor} · ${row.tipo_docen} · S${row.semestre}${row.grupo ? ` · G${row.grupo}` : ""}`))],
      classesWithoutAssignments: [...new Set(classes.filter((item) => !item.teachers.length).map((item) => `${item.subjectCode} · G${item.groupCode} · ${item.teachingType}`))],
    },
  };
}
