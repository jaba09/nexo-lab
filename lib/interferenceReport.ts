export type InterferenceReportSession = {
  id: number;
  subjectCode: string;
  groupCode: string | null;
  practiceCode: string | null;
  practiceName: string | null;
  startTime: string;
  endTime: string;
};

export type InterferenceReportItem = {
  kind: "Profesor" | "Instalación";
  resourceCode: string;
  resourceName: string;
  sessionDate: string;
  first: InterferenceReportSession;
  second: InterferenceReportSession;
};

function reportDate(date: string) {
  return date.split("-").reverse().join("/");
}

function sessionLines(session: InterferenceReportSession) {
  const subject = `${session.subjectCode}${session.groupCode ? ` - G${session.groupCode}` : ""}`;
  const schedule = `${session.startTime} - ${session.endTime}`;
  const practice = session.practiceName
    ? `${session.practiceName}${session.practiceCode ? ` - ${session.practiceCode}` : ""}`
    : "Sin práctica asignada";
  return [subject, schedule, practice, `Sesión #${session.id}`];
}

async function createInterferenceReportPdf(
  items: InterferenceReportItem[],
  checkedSessionCount: number,
  generatedAt: Date,
) {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 12;
  const teacherCount = items.filter(({ kind }) => kind === "Profesor").length;
  const installationCount = items.length - teacherCount;
  const columns = [
    { label: "Recurso", width: 56 },
    { label: "Fecha", width: 25 },
    { label: "Primera sesión", width: 90 },
    { label: "Segunda sesión", width: 90 },
  ];

  function drawHeader(continuation = false) {
    document.setTextColor("#17201d");
    document.setFont("helvetica", "bold");
    document.setFontSize(continuation ? 13 : 17);
    document.text(continuation ? "Informe de interferencias - continuación" : "Informe de interferencias", margin, 14);
    document.setFont("helvetica", "normal");
    document.setTextColor("#68716d");
    document.setFontSize(7.5);
    const generatedLabel = generatedAt.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
    document.text(`Nexo Lab - Generado el ${generatedLabel}`, margin, 20);

    if (!continuation) {
      document.setFillColor("#f1f6e4");
      document.roundedRect(margin, 24, pageWidth - (margin * 2), 15, 2, 2, "F");
      document.setFont("helvetica", "bold");
      document.setTextColor("#334416");
      document.setFontSize(9);
      document.text(`${checkedSessionCount} sesiones comprobadas`, margin + 6, 33.3);
      document.text(`${items.length} ${items.length === 1 ? "interferencia" : "interferencias"}`, margin + 70, 33.3);
      document.setFont("helvetica", "normal");
      document.setFontSize(8);
      document.text(`${teacherCount} de profesor`, margin + 121, 33.3);
      document.text(`${installationCount} de instalación`, margin + 163, 33.3);
    }

    const tableY = continuation ? 25 : 45;
    document.setFillColor("#17201d");
    document.rect(margin, tableY, pageWidth - (margin * 2), 8, "F");
    document.setTextColor("#ffffff");
    document.setFont("helvetica", "bold");
    document.setFontSize(7);
    let x = margin;
    for (const column of columns) {
      document.text(column.label, x + 2, tableY + 5.2);
      x += column.width;
    }
    return tableY + 8;
  }

  let y = drawHeader();
  if (!items.length) {
    document.setFillColor("#eef6d9");
    document.setDrawColor("#b9cf83");
    document.roundedRect(margin, y + 7, pageWidth - (margin * 2), 34, 3, 3, "FD");
    document.setTextColor("#4c6611");
    document.setFont("helvetica", "bold");
    document.setFontSize(14);
    document.text("Sin interferencias detectadas", margin + 8, y + 21);
    document.setFont("helvetica", "normal");
    document.setFontSize(9);
    document.text("No hay profesores ni instalaciones asignados a sesiones con horarios superpuestos.", margin + 8, y + 31);
  } else {
    items.forEach((item, rowIndex) => {
      const resourceLines = document.splitTextToSize(`${item.kind}\n${item.resourceName} - ${item.resourceCode}`, columns[0].width - 4) as string[];
      const firstLines = sessionLines(item.first).flatMap((line) => document.splitTextToSize(line, columns[2].width - 4) as string[]);
      const secondLines = sessionLines(item.second).flatMap((line) => document.splitTextToSize(line, columns[3].width - 4) as string[]);
      const rowHeight = Math.max(20, resourceLines.length * 3.6 + 6, firstLines.length * 3.6 + 6, secondLines.length * 3.6 + 6);
      if (y + rowHeight > pageHeight - 12) {
        document.addPage();
        y = drawHeader(true);
      }
      if (rowIndex % 2 === 0) {
        document.setFillColor("#f5f5ef");
        document.rect(margin, y, pageWidth - (margin * 2), rowHeight, "F");
      }
      document.setDrawColor("#d9dbd3");
      document.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
      document.setTextColor("#17201d");
      document.setFont("helvetica", "normal");
      document.setFontSize(7.5);
      let x = margin;
      document.text(resourceLines, x + 2, y + 5);
      x += columns[0].width;
      document.text(reportDate(item.sessionDate), x + 2, y + 5);
      x += columns[1].width;
      document.text(firstLines, x + 2, y + 5);
      x += columns[2].width;
      document.text(secondLines, x + 2, y + 5);
      y += rowHeight;
    });
  }

  const totalPages = document.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    document.setPage(page);
    document.setTextColor("#68716d");
    document.setFont("helvetica", "normal");
    document.setFontSize(7);
    document.text(`Página ${page} de ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  }
  return document;
}

function exportDateSuffix() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export async function interferenceReportToPdfArrayBuffer(
  items: InterferenceReportItem[],
  checkedSessionCount: number,
  generatedAt = new Date(),
) {
  const document = await createInterferenceReportPdf(items, checkedSessionCount, generatedAt);
  return document.output("arraybuffer");
}

export async function downloadInterferenceReportPdf(items: InterferenceReportItem[], checkedSessionCount: number) {
  const content = await interferenceReportToPdfArrayBuffer(items, checkedSessionCount);
  const url = URL.createObjectURL(new Blob([content], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `informe-interferencias-${exportDateSuffix()}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
