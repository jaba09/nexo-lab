import { createHash } from "node:crypto";

const RULES_REVISION = "v2";

export const laboratoryRulesIntroduction = "La realización de prácticas de laboratorio o taller conllevan riesgos de los que hay que ser consciente con el fin de prevenir accidentes, por lo que es imprescindible adoptar las medidas de seguridad necesarias.";

export const laboratoryRulesCommitments = [
  "En función del tipo de prácticas, los riesgos pueden ser de muy distinta naturaleza (químicos, biológicos, mecánicos, eléctricos, etc.) y una misma práctica puede conllevar riesgos de varios tipos.",
  "Las normas generales de trabajo en los laboratorios de la U.Z. y en el centro (Adjunto) deben de cumplirse con el fin de prevenir accidentes",
  "Cada asignatura, actividad o práctica puede presentar riesgos específicos, que vendrán recogidos, en su caso, en los correspondientes guiones. Hay que acceder al laboratorio/taller habiendo leído el guión de la práctica que se va a realizar.",
  "Los equipos de protección individual son necesarios para la realización de las prácticas y es mi responsabilidad llevarlos siempre puestos y utilizarlos adecuadamente, según se me indique, en el laboratorio o taller. (Los equipos están señalizados en la entrada del laboratorio/taller y relacionados en los guiones de las prácticas)",
  "Es mi responsabilidad observar las medidas preventivas y de seguridad que hay que aplicar de forma general y las específicas que se me indiquen en cada práctica (señalizadas en la entrada del laboratorio/taller y relacionados en los guiones de las prácticas)",
];

export const laboratoryRulesClosing = "Así mismo, soy conocedor de que el incumplimiento de las normas establecidas por la U.Z. en el laboratorio y/o taller conlleva la imposibilidad de la entrada al laboratorio hasta subsanar las deficiencias o la expulsión del recinto por parte del responsable de las prácticas si se incumple alguna medida de seguridad colectiva o personal.";

export const laboratoryWorkshopTitle = "NORMAS DE TRABAJO EN LABORATORIOS Y TALLERES DE LA UNIVERSIDAD DE ZARAGOZA.";

export const laboratoryWorkshopRules = [
  {
    text: "Las normas a cumplir en cada laboratorio/taller, deberán estar señalizadas a la entrada del mismo.",
  },
  {
    text: "Serán de obligado cumplimiento, al menos, las normas marcadas por la Unidad de Prevención de Riesgos Laborales",
    link: "https://uprl.unizar.es/seguridad-laboral/seguridad-laboral",
    suffix: ", debiendo cada Departamento proponer las suyas en función del tipo de práctica a realizar.",
  },
  {
    text: "Se seguirán los Procedimientos de la Unidad de Prevención de Riesgos Laborales en referencia a la retirada de residuos Sanitarios y Peligrosos.",
    link: "https://uprl.unizar.es/inicio/manual-de-procedimientos",
  },
  {
    text: "Se recomienda, en el caso específico de trabajo en Laboratorios, la atenta lectura del siguiente manual:",
    link: "https://uprl.unizar.es/sites/uprl.unizar.es/files/archivos/Procedimientos/manual_de_seguridad_en_los_laboratorios_de_la_universidad_de_zaragoza.pdf",
  },
];

export function laboratoryRules(academicYear: string) {
  const title = "Normas generales de seguridad y uso de los laboratorios docentes";
  const version = `${academicYear}-${RULES_REVISION}`;
  const hash = createHash("sha256")
    .update(JSON.stringify({
      title,
      academicYear,
      version,
      introduction: laboratoryRulesIntroduction,
      commitments: laboratoryRulesCommitments,
      closing: laboratoryRulesClosing,
      workshopTitle: laboratoryWorkshopTitle,
      workshopRules: laboratoryWorkshopRules,
    }))
    .digest("hex");
  return {
    academicYear,
    version,
    title,
    introduction: laboratoryRulesIntroduction,
    commitments: laboratoryRulesCommitments,
    closing: laboratoryRulesClosing,
    workshopTitle: laboratoryWorkshopTitle,
    workshopRules: laboratoryWorkshopRules,
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
  const pageHeight = 297;
  const bottom = 20;
  let y = 22;

  function ensureSpace(height: number) {
    if (y + height <= pageHeight - bottom) return;
    document.addPage();
    y = 20;
  }

  function addText(text: string, options: { indent?: number; bold?: boolean; size?: number; gap?: number } = {}) {
    const indent = options.indent ?? 0;
    const size = options.size ?? 10;
    const lineHeight = size * 0.5;
    document.setFont("helvetica", options.bold ? "bold" : "normal");
    document.setFontSize(size);
    document.setTextColor(23, 32, 29);
    const lines = document.splitTextToSize(text, width - indent) as string[];
    ensureSpace(lines.length * lineHeight + (options.gap ?? 3));
    document.text(lines, left + indent, y);
    y += lines.length * lineHeight + (options.gap ?? 3);
  }

  function addBullet(text: string) {
    const size = 9.5;
    const lineHeight = 4.8;
    document.setFont("helvetica", "normal");
    document.setFontSize(size);
    document.setTextColor(23, 32, 29);
    const lines = document.splitTextToSize(text, width - 8) as string[];
    ensureSpace(lines.length * lineHeight + 3);
    document.text("-", left + 1, y);
    document.text(lines, left + 7, y);
    y += lines.length * lineHeight + 3;
  }

  function addLink(url: string) {
    const size = 8;
    const lineHeight = 4.3;
    document.setFont("helvetica", "normal");
    document.setFontSize(size);
    document.setTextColor(47, 92, 135);
    const lines = document.splitTextToSize(url, width - 12) as string[];
    ensureSpace(lines.length * lineHeight + 3);
    for (const line of lines) {
      document.text(line, left + 7, y);
      document.link(left + 7, y - 3.2, Math.min(document.getTextWidth(line), width - 12), 4.2, { url });
      y += lineHeight;
    }
    y += 3;
    document.setTextColor(23, 32, 29);
  }

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

  addText(data.rules.title, { bold: true, size: 12, gap: 6 });
  addText(data.rules.introduction, { gap: 5 });
  for (const rule of data.rules.commitments) addBullet(rule);
  addText(data.rules.closing, { gap: 7 });
  addText(data.rules.workshopTitle, { bold: true, size: 11, gap: 6 });
  for (const rule of data.rules.workshopRules) {
    addBullet(rule.text);
    if (rule.link) addLink(rule.link);
    if (rule.suffix) addText(rule.suffix, { indent: 7, size: 9.5, gap: 3 });
  }

  ensureSpace(94);
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

  const pages = document.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    document.setPage(page);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.setTextColor(112, 119, 115);
    document.text(`Nexo Lab · Página ${page} de ${pages}`, 190, 289, { align: "right" });
  }

  return document.output("arraybuffer");
}
