export type ExportableSession = {
  id: number;
  sessionDate: string;
  startTime: string;
  duration: number;
  subjectCode: string;
  subjectName: string;
  subjectAbbreviation: string;
  degreeCode: string;
  degreeName: string;
  practiceCode: string | null;
  practiceName: string | null;
  installationName: string | null;
  teacherCode: string | null;
  teacherName: string | null;
  groupCode: string | null;
};

function orderedSessions(sessions: ExportableSession[]) {
  return [...sessions].sort((left, right) => (
    left.sessionDate.localeCompare(right.sessionDate)
    || left.startTime.localeCompare(right.startTime)
    || left.id - right.id
  ));
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = "";
  for (const character of line) {
    if (chunk && encoder.encode(`${chunk}${character}`).length > 73) {
      chunks.push(chunk);
      chunk = ` ${character}`;
    } else {
      chunk += character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks.join("\r\n");
}

function localIcsDateTime(sessionDate: string, startTime: string, extraMinutes = 0) {
  const [year, month, day] = sessionDate.split("-").map(Number);
  const [hour, minute] = startTime.split(":").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute + extraMinutes));
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
    "T",
    String(value.getUTCHours()).padStart(2, "0"),
    String(value.getUTCMinutes()).padStart(2, "0"),
    "00",
  ].join("");
}

function utcIcsDateTime(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function summaryForSession(session: ExportableSession) {
  const group = session.groupCode ? `Grupo: ${session.groupCode}` : "Grupo sin asignar";
  const practice = session.practiceName
    ? ` - ${session.practiceCode ? `${session.practiceCode} · ` : ""}${session.practiceName}`
    : "";
  return `${session.subjectCode} - ${session.subjectName} ${group} - Prácticas de laboratorio${practice}`;
}

function descriptionForSession(session: ExportableSession) {
  return [
    `Grado: ${session.degreeCode} · ${session.degreeName}`,
    `Asignatura: ${session.subjectAbbreviation || session.subjectCode} · ${session.subjectName}`,
    `Práctica: ${session.practiceName ?? "Sin práctica asignada"}`,
    `Profesor: ${session.teacherName ?? "Sin profesor asignado"}`,
    `Grupo: ${session.groupCode ?? "Sin asignar"}`,
    `Duración: ${session.duration} min`,
    `Instalación: ${session.installationName ?? "Sin instalación asignada"}`,
  ].join("\n");
}

export function sessionsToIcs(sessions: ExportableSession[], generatedAt = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nexo Lab//Sesiones seleccionadas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Nexo Lab · Sesiones seleccionadas",
    "X-WR-TIMEZONE:Europe/Madrid",
  ];
  for (const session of orderedSessions(sessions)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:nexo-lab-session-${session.id}@nexo-lab`,
      `DTSTAMP:${utcIcsDateTime(generatedAt)}`,
      `DTSTART;TZID=Europe/Madrid:${localIcsDateTime(session.sessionDate, session.startTime)}`,
      `DTEND;TZID=Europe/Madrid:${localIcsDateTime(session.sessionDate, session.startTime, session.duration)}`,
      `SUMMARY:${escapeIcsText(summaryForSession(session))}`,
      `DESCRIPTION:${escapeIcsText(descriptionForSession(session))}`,
    );
    if (session.installationName) lines.push(`LOCATION:${escapeIcsText(session.installationName)}`);
    if (!session.practiceName) lines.push("STATUS:TENTATIVE");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function exportDateSuffix() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

function escapeCsvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function sessionsToCsv(sessions: ExportableSession[]) {
  const rows = orderedSessions(sessions).map((session) => [
    session.subjectCode,
    session.sessionDate,
    session.startTime,
    String(session.duration),
  ].map(escapeCsvField).join(","));
  return `\uFEFF${["codigo,fecha,hora_ini,duracion", ...rows].join("\r\n")}\r\n`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadSessionsIcs(sessions: ExportableSession[]) {
  const content = sessionsToIcs(sessions);
  downloadBlob(new Blob([content], { type: "text/calendar;charset=utf-8" }), `sesiones-seleccionadas-${exportDateSuffix()}.ics`);
}

export function downloadSessionsCsv(sessions: ExportableSession[], semesterId: string) {
  const content = sessionsToCsv(sessions);
  const semester = semesterId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const filename = `sesiones-${semester || exportDateSuffix()}.csv`;
  downloadBlob(new Blob([content], { type: "text/csv;charset=utf-8" }), filename);
}

async function createSessionsPdf(sessions: ExportableSession[]) {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 12;
  const columns = [
    { label: "Fecha", width: 29, value: (session: ExportableSession) => session.sessionDate.split("-").reverse().join("/") },
    { label: "Hora", width: 21, value: (session: ExportableSession) => session.startTime },
    { label: "Dur.", width: 18, value: (session: ExportableSession) => `${session.duration} min` },
    { label: "Grado / asignatura", width: 39, value: (session: ExportableSession) => `${session.degreeCode} · ${session.subjectAbbreviation || session.subjectCode}` },
    { label: "Grupo", width: 17, value: (session: ExportableSession) => session.groupCode ? `G${session.groupCode}` : "—" },
    { label: "Práctica", width: 59, value: (session: ExportableSession) => session.practiceName ? `${session.practiceCode ? `${session.practiceCode} · ` : ""}${session.practiceName}` : "Sin práctica asignada" },
    { label: "Profesor", width: 49, value: (session: ExportableSession) => session.teacherName ? `${session.teacherCode ? `${session.teacherCode} · ` : ""}${session.teacherName}` : "Sin profesor asignado" },
    { label: "Instalación", width: 41, value: (session: ExportableSession) => session.installationName ?? "—" },
  ];
  const rows = orderedSessions(sessions);

  function drawPageHeader(continuation = false) {
    document.setTextColor("#17201d");
    document.setFont("helvetica", "bold");
    document.setFontSize(16);
    document.text(continuation ? "Sesiones seleccionadas · continuación" : "Sesiones seleccionadas", margin, 14);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.setTextColor("#68716d");
    document.text(`${rows.length} ${rows.length === 1 ? "sesión" : "sesiones"} · Exportado desde Nexo Lab`, margin, 20);
    let x = margin;
    const headerY = 26;
    document.setFillColor("#17201d");
    document.rect(margin, headerY, pageWidth - margin * 2, 8, "F");
    document.setTextColor("#ffffff");
    document.setFont("helvetica", "bold");
    document.setFontSize(7);
    for (const column of columns) {
      document.text(column.label, x + 2, headerY + 5.2);
      x += column.width;
    }
    return headerY + 8;
  }

  let y = drawPageHeader();
  rows.forEach((session, rowIndex) => {
    const cellLines = columns.map((column) => document.splitTextToSize(column.value(session), column.width - 4) as string[]);
    const rowHeight = Math.max(10, ...cellLines.map((lines) => lines.length * 3.5 + 4));
    if (y + rowHeight > pageHeight - 12) {
      document.addPage();
      y = drawPageHeader(true);
    }
    if (rowIndex % 2 === 0) {
      document.setFillColor("#f4f2eb");
      document.rect(margin, y, pageWidth - margin * 2, rowHeight, "F");
    }
    document.setDrawColor("#d9d8d0");
    document.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    document.setTextColor("#17201d");
    document.setFont("helvetica", "normal");
    document.setFontSize(7.5);
    let x = margin;
    cellLines.forEach((lines, columnIndex) => {
      document.text(lines, x + 2, y + 4.7);
      x += columns[columnIndex].width;
    });
    y += rowHeight;
  });

  const totalPages = document.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    document.setPage(page);
    document.setTextColor("#68716d");
    document.setFontSize(7);
    document.text(`Página ${page} de ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  }
  return document;
}

export async function sessionsToPdfArrayBuffer(sessions: ExportableSession[]) {
  const document = await createSessionsPdf(sessions);
  return document.output("arraybuffer");
}

export async function downloadSessionsPdf(sessions: ExportableSession[]) {
  const content = await sessionsToPdfArrayBuffer(sessions);
  downloadBlob(new Blob([content], { type: "application/pdf" }), `sesiones-seleccionadas-${exportDateSuffix()}.pdf`);
}
