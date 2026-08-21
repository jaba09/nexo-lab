export type SemesterNumber = 1 | 2;

export type SemesterDefinition = {
  id: string;
  academicYear: string;
  number: SemesterNumber;
  startDate: string;
  endDate: string;
  startYear: number;
  startMonthIndex: number;
  endYear: number;
  endMonthIndex: number;
};

function twoDigitYear(year: number) {
  return String(year).slice(-2).padStart(2, "0");
}

export function semesterId(startYear: number, number: SemesterNumber) {
  return `${startYear}-${twoDigitYear(startYear + 1)} S${number}`;
}

export function semesterFromDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("La fecha no tiene un formato válido para calcular el semestre.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("El mes no es válido.");
  const startYear = month >= 9 ? year : year - 1;
  const number: SemesterNumber = month >= 9 || month === 1 ? 1 : 2;
  return semesterId(startYear, number);
}

export function semesterDefinition(id: string): SemesterDefinition {
  const match = /^(\d{4})-(\d{2}) S([12])$/.exec(id);
  if (!match) throw new Error("El semestre no tiene un formato válido.");
  const startYear = Number(match[1]);
  const number = Number(match[3]) as SemesterNumber;
  const academicYear = `${startYear}-${twoDigitYear(startYear + 1)}`;
  if (match[2] !== twoDigitYear(startYear + 1)) throw new Error("El curso académico del semestre no es válido.");

  return number === 1
    ? {
      id: semesterId(startYear, number),
      academicYear,
      number,
      startDate: `${startYear}-09-01`,
      endDate: `${startYear + 1}-01-31`,
      startYear,
      startMonthIndex: 8,
      endYear: startYear + 1,
      endMonthIndex: 0,
    }
    : {
      id: semesterId(startYear, number),
      academicYear,
      number,
      startDate: `${startYear + 1}-02-01`,
      endDate: `${startYear + 1}-08-31`,
      startYear: startYear + 1,
      startMonthIndex: 1,
      endYear: startYear + 1,
      endMonthIndex: 7,
    };
}

export function semesterOptions(dates: string[], referenceDate: string) {
  const academicYears = new Set<number>();
  for (const date of [...dates, referenceDate]) {
    const semester = semesterDefinition(semesterFromDate(date));
    academicYears.add(Number(semester.academicYear.slice(0, 4)));
  }
  return [...academicYears]
    .sort((left, right) => right - left)
    .flatMap((startYear) => [semesterDefinition(semesterId(startYear, 1)), semesterDefinition(semesterId(startYear, 2))]);
}
