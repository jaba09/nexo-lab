export type MessageAudienceSession = {
  sessionDate: string;
  subjectId: number;
  teacherId: number | null;
};

export type MessageAudienceTeacher = {
  id: number;
  isLabStaff: boolean;
};

export function messageAudienceTeacherIds(
  sessions: ReadonlyArray<MessageAudienceSession>,
  semesterId: string,
  subjectId: number | null,
  semesterForDate: (date: string) => string,
  excludedTeacherId?: number,
) {
  const teacherIds = new Set<number>();
  for (const session of sessions) {
    if (session.teacherId === null) continue;
    if (Number(session.teacherId) === excludedTeacherId) continue;
    if (semesterForDate(session.sessionDate) !== semesterId) continue;
    if (subjectId !== null && Number(session.subjectId) !== subjectId) continue;
    teacherIds.add(Number(session.teacherId));
  }
  return [...teacherIds];
}

export function laboratoryStaffAudienceTeacherIds(
  teachers: ReadonlyArray<MessageAudienceTeacher>,
  excludedTeacherId?: number,
) {
  return teachers
    .filter((teacher) => teacher.isLabStaff && Number(teacher.id) !== excludedTeacherId)
    .map((teacher) => Number(teacher.id));
}
