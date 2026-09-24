import { createHash } from "node:crypto";

const RULES_REVISION = "v1";

export const laboratoryRulesContent = [
  "Seguir en todo momento las indicaciones del profesorado y del personal de laboratorio.",
  "Utilizar correctamente los equipos de protección y no manipular instalaciones sin autorización.",
  "Comunicar inmediatamente cualquier accidente, avería, derrame o situación de riesgo.",
  "Mantener el puesto de trabajo ordenado y dejar el material en las condiciones indicadas.",
  "No comer ni beber en el laboratorio y respetar las normas específicas de cada instalación.",
];

export function laboratoryRules(academicYear: string) {
  const title = "Normas generales de seguridad y uso de los laboratorios docentes";
  const version = `${academicYear}-${RULES_REVISION}`;
  const hash = createHash("sha256")
    .update(JSON.stringify({ title, academicYear, version, content: laboratoryRulesContent }))
    .digest("hex");
  return {
    academicYear,
    version,
    title,
    content: laboratoryRulesContent,
    hash,
  };
}

export function academicYearFromSemester(semesterId: string) {
  return semesterId.replace(/\s+S[12]$/i, "").trim();
}

export type LabRulesAcceptancePdfData = {
  studentName: string;
  studentEmail: string;
  signedAt: string;
  teacherName: string;
  sessionDate: string;
  sessionTime: string;
  subjectCode: string;
  groupCode: string | null;
  signaturePng: Uint8Array;
  rules: ReturnType<typeof laboratoryRules>;
};

export async function createLabRulesAcceptancePdf(data: LabRulesAcceptancePdfData) {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const left = 20;
  const width = 170;
  let y = 22;

  document.setFont("helvetica", "bold");
  document.setFontSize(18);
  document.text("Aceptación de normas de laboratorio", left, y);
  y += 10;
  document.setFont("helvetica", "normal");
  document.setFontSize(10);
  document.text(`Curso académico: ${data.rules.academicYear}`, left, y);
  y += 6;
  document.text(`Versión: ${data.rules.version}`, left, y);
  y += 6;
  document.text(`Huella del documento: ${data.rules.hash}`, left, y, { maxWidth: width });
  y += 12;

  document.setFont("helvetica", "bold");
  document.setFontSize(12);
  document.text(data.rules.title, left, y, { maxWidth: width });
  y += 9;
  document.setFont("helvetica", "normal");
  document.setFontSize(10);
  for (const rule of data.rules.content) {
    const lines = document.splitTextToSize(`- ${rule}`, width - 4) as string[];
    document.text(lines, left + 2, y);
    y += lines.length * 5 + 2;
  }

  y += 4;
  document.setDrawColor(190, 194, 184);
  document.line(left, y, left + width, y);
  y += 9;
  document.setFont("helvetica", "bold");
  document.text("Alumno", left, y);
  document.setFont("helvetica", "normal");
  document.text(`${data.studentName} · ${data.studentEmail}`, left + 25, y);
  y += 7;
  document.setFont("helvetica", "bold");
  document.text("Aceptación", left, y);
  document.setFont("helvetica", "normal");
  const signedAt = new Date(`${data.signedAt.replace(" ", "T")}Z`);
  const signedAtLabel = Number.isNaN(signedAt.getTime())
    ? data.signedAt
    : new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      dateStyle: "long",
      timeStyle: "short",
    }).format(signedAt);
  document.text(signedAtLabel, left + 25, y);
  y += 7;
  document.setFont("helvetica", "bold");
  document.text("Sesión", left, y);
  document.setFont("helvetica", "normal");
  document.text(`${data.sessionDate} · ${data.sessionTime} · ${data.subjectCode}${data.groupCode ? ` · G${data.groupCode.replace(/^G/i, "")}` : ""}`, left + 25, y);
  y += 7;
  document.setFont("helvetica", "bold");
  document.text("Supervisada por", left, y);
  document.setFont("helvetica", "normal");
  document.text(data.teacherName, left + 35, y);
  y += 13;

  document.setFont("helvetica", "bold");
  document.text("Firma del alumno", left, y);
  y += 5;
  document.setDrawColor(210, 212, 205);
  document.rect(left, y, 100, 38);
  document.addImage(data.signaturePng, "PNG", left + 3, y + 3, 94, 32);
  y += 46;
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  const certification = "El profesor identificado en este justificante certifica que la firma se recogió presencialmente. Este documento registra la aceptación de las normas y no constituye una firma electrónica cualificada.";
  document.text(document.splitTextToSize(certification, width), left, y);

  return document.output("arraybuffer");
}
