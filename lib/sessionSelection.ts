export function sessionSelectionRangeIds(
  sessions: ReadonlyArray<{ id: number }>,
  anchorId: number,
  targetId: number,
) {
  const anchorIndex = sessions.findIndex((session) => session.id === anchorId);
  const targetIndex = sessions.findIndex((session) => session.id === targetId);
  if (anchorIndex < 0 || targetIndex < 0) return null;

  const first = Math.min(anchorIndex, targetIndex);
  const last = Math.max(anchorIndex, targetIndex);
  return sessions.slice(first, last + 1).map((session) => session.id);
}
