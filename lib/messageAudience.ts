export type MessageAudienceSession = {
  sessionDate: string;
  subjectId: number;
  teacherId: number | null;
};

export function messageAudienceTeacherIds(
  sessions: ReadonlyArray<MessageAudienceSession>,
  semesterId: string,
  subjectId: number | null,
  semesterForDate: (date: string) => string,
) {
  const teacherIds = new Set<number>();
  for (const session of sessions) {
    if (session.teacherId === null) continue;
    if (semesterForDate(session.sessionDate) !== semesterId) continue;
    if (subjectId !== null && Number(session.subjectId) !== subjectId) continue;
    teacherIds.add(Number(session.teacherId));
  }
  return [...teacherIds];
}
