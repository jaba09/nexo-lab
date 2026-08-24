export const einaAcademicCalendarSource = "https://eina.unizar.es/sites/eina/files/archivos/2026-2027/calendario/calendario_academico_eina_2026-2027_presentado_junta_escuela.pdf";

function isoDateRange(firstDate, lastDate) {
  const dates = [];
  const current = new Date(`${firstDate}T00:00:00Z`);
  const end = new Date(`${lastDate}T00:00:00Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

const typeADates = [
  ...isoDateRange("2026-09-14", "2026-09-18"),
  ...isoDateRange("2026-09-28", "2026-10-02"),
  ...isoDateRange("2026-10-19", "2026-10-23"),
  ...isoDateRange("2026-11-03", "2026-11-06"),
  "2026-11-09",
  ...isoDateRange("2026-11-17", "2026-11-20"),
  "2026-11-23",
  ...isoDateRange("2026-12-01", "2026-12-04"),
  "2026-12-09",
  ...isoDateRange("2027-02-15", "2027-02-19"),
  ...isoDateRange("2027-03-01", "2027-03-04"),
  "2027-03-08",
  ...isoDateRange("2027-03-16", "2027-03-18"),
  ...isoDateRange("2027-03-22", "2027-03-23"),
  ...isoDateRange("2027-04-12", "2027-04-16"),
  ...isoDateRange("2027-04-27", "2027-04-30"),
  "2027-05-03",
  ...isoDateRange("2027-05-17", "2027-05-21"),
];

const typeBDates = [
  ...isoDateRange("2026-09-21", "2026-09-25"),
  ...isoDateRange("2026-10-05", "2026-10-09"),
  ...isoDateRange("2026-10-26", "2026-10-30"),
  ...isoDateRange("2026-11-10", "2026-11-13"),
  "2026-11-16",
  ...isoDateRange("2026-11-24", "2026-11-27"),
  "2026-11-30",
  ...isoDateRange("2026-12-10", "2026-12-11"),
  ...isoDateRange("2026-12-14", "2026-12-16"),
  ...isoDateRange("2027-02-22", "2027-02-26"),
  ...isoDateRange("2027-03-09", "2027-03-12"),
  "2027-03-15",
  ...isoDateRange("2027-04-05", "2027-04-09"),
  ...isoDateRange("2027-04-19", "2027-04-22"),
  "2027-04-26",
  ...isoDateRange("2027-05-10", "2027-05-14"),
  ...isoDateRange("2027-05-24", "2027-05-28"),
];

export const academicDayTypes2026_2027 = [
  ...typeADates.map((date) => ({ date, dayType: "A" })),
  ...typeBDates.map((date) => ({ date, dayType: "B" })),
].sort((left, right) => left.date.localeCompare(right.date));
