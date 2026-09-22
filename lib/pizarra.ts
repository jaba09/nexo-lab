export type PizarraClass = {
  id: string;
  subjectCode: string;
  subjectName: string;
  groupCode: string;
  teachingType: "CM" | "Prob_casos" | "LAB";
  date: string;
  startTime: string;
  duration: number;
  location: string;
  teachers: string[];
  practiceName?: string;
};

export type PizarraLabSession = {
  id: number;
  subjectCode: string;
  subjectName: string;
  sessionDate: string;
  startTime: string;
  duration: number;
  groupCode: string | null;
  teacherName: string | null;
  installationName: string | null;
  practiceName: string | null;
};

const normalizedTeacher = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}]/gu, "");

export function pizarraLabClasses(sessions: PizarraLabSession[], teachers: string[]): PizarraClass[] {
  return sessions.map((session) => ({
    id: `lab-${session.id}`,
    subjectCode: session.subjectCode,
    subjectName: session.subjectName,
    date: session.sessionDate,
    startTime: session.startTime,
    duration: session.duration,
    groupCode: session.groupCode ?? "—",
    teachingType: "LAB",
    teachers: session.teacherName ? [teachers.find((name) => normalizedTeacher(name) === normalizedTeacher(session.teacherName!)) ?? session.teacherName] : [],
    location: session.installationName ?? "",
    practiceName: session.practiceName ?? "Sin práctica",
  }));
}

export type PizarraData = {
  sources: { calendar: string; assignments: string };
  classes: PizarraClass[];
  teachers: string[];
  summary: {
    calendarEvents: number;
    ignoredEvents: number;
    duplicateEvents: number;
    duplicateRows: number;
    sharedClasses: number;
    unmatchedClasses: number;
    assignmentsWithoutClasses: string[];
    classesWithoutAssignments: string[];
  };
};

export function pizarraMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function pizarraTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function pizarraVisibleInterval(item: Pick<PizarraClass, "startTime" | "duration">, startHour: number, endHour: number) {
  const start = Math.max(pizarraMinutes(item.startTime), startHour * 60);
  const end = Math.min(pizarraMinutes(item.startTime) + item.duration, endHour * 60);
  return end > start ? { offset: start - startHour * 60, duration: end - start } : null;
}

export function pizarraDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function pizarraAddDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return pizarraDate(value);
}

export function pizarraWeek(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return pizarraAddDays(date, -((value.getDay() + 6) % 7));
}

// Connected overlap clusters share a lane count, so simultaneous classes never cover each other.
export function layoutPizarraClasses(classes: PizarraClass[]) {
  const result: { item: PizarraClass; lane: number; lanes: number }[] = [];
  let cluster: PizarraClass[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    const positioned = cluster.map((item) => {
      const start = pizarraMinutes(item.startTime);
      let lane = ends.findIndex((end) => end <= start);
      if (lane === -1) lane = ends.length;
      ends[lane] = start + item.duration;
      return { item, lane };
    });
    result.push(...positioned.map((item) => ({ ...item, lanes: ends.length })));
  };
  for (const item of [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))) {
    const start = pizarraMinutes(item.startTime);
    if (cluster.length && start >= clusterEnd) {
      flush();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, start + item.duration);
  }
  if (cluster.length) flush();
  return result;
}
