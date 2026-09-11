export type ScheduledSession = {
  id: number;
  sessionDate: string;
  startTime: string;
  duration: number;
  teacherId: number | null;
  installationIds: number[];
};

export type SessionConflict = {
  kind: "teacher" | "installation";
  resourceId: number;
  first: ScheduledSession;
  second: ScheduledSession;
};

function timeInMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60) + minutes;
}

function sessionsOverlap(first: ScheduledSession, second: ScheduledSession) {
  if (first.sessionDate !== second.sessionDate) return false;
  const firstStart = timeInMinutes(first.startTime);
  const secondStart = timeInMinutes(second.startTime);
  return firstStart < secondStart + second.duration
    && secondStart < firstStart + first.duration;
}

function conflictKey(conflict: SessionConflict) {
  const firstId = Math.min(conflict.first.id, conflict.second.id);
  const secondId = Math.max(conflict.first.id, conflict.second.id);
  return `${conflict.kind}:${conflict.resourceId}:${firstId}:${secondId}`;
}

function conflictsFor(
  sessions: ScheduledSession[],
  affectedIds: ReadonlySet<number>,
) {
  const conflicts: SessionConflict[] = [];
  const sessionsByDate = new Map<string, ScheduledSession[]>();

  for (const session of sessions) {
    const sameDate = sessionsByDate.get(session.sessionDate) ?? [];
    sameDate.push(session);
    sessionsByDate.set(session.sessionDate, sameDate);
  }

  for (const sameDate of sessionsByDate.values()) {
    for (let firstIndex = 0; firstIndex < sameDate.length; firstIndex += 1) {
      const first = sameDate[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < sameDate.length; secondIndex += 1) {
        const second = sameDate[secondIndex];
        if (!affectedIds.has(first.id) && !affectedIds.has(second.id)) continue;
        if (!sessionsOverlap(first, second)) continue;

        if (first.teacherId !== null && first.teacherId === second.teacherId) {
          conflicts.push({
            kind: "teacher",
            resourceId: first.teacherId,
            first,
            second,
          });
        }

        const secondInstallations = new Set(second.installationIds);
        for (const installationId of first.installationIds) {
          if (!secondInstallations.has(installationId)) continue;
          conflicts.push({
            kind: "installation",
            resourceId: installationId,
            first,
            second,
          });
        }
      }
    }
  }

  return conflicts;
}

export function findSessionConflicts(sessions: ScheduledSession[]) {
  return conflictsFor(sessions, new Set(sessions.map(({ id }) => id)));
}

/**
 * Returns the first conflict introduced by a proposed change. Conflicts that
 * already existed are deliberately ignored so legacy data does not block an
 * otherwise unrelated edit.
 */
export function findNewSessionConflict(
  before: ScheduledSession[],
  after: ScheduledSession[],
  affectedIds: ReadonlySet<number>,
) {
  const existingConflictKeys = new Set(
    conflictsFor(before, affectedIds).map(conflictKey),
  );
  return conflictsFor(after, affectedIds)
    .find((conflict) => !existingConflictKeys.has(conflictKey(conflict))) ?? null;
}
