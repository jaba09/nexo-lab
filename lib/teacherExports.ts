export type ExportableTeacher = {
  code: string;
  name: string;
};

function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function teachersToCsv(teachers: ExportableTeacher[]) {
  const rows = teachers.map((teacher) => `${csvField(teacher.code)},${csvField(teacher.name)}`);
  return `\uFEFF${["id,nombre", ...rows].join("\r\n")}\r\n`;
}

function exportDateSuffix() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export function downloadTeachersCsv(teachers: ExportableTeacher[]) {
  const content = teachersToCsv(teachers);
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `profesores-${exportDateSuffix()}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
