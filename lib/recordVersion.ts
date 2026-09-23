export type EditableEntity = "laboratories" | "installations" | "practices" | "degrees" | "subjects" | "teachers" | "sessions";

function numericIds(value: unknown, sorted = false): number[] {
  const ids = Array.isArray(value) ? value.map(Number) : [];
  return sorted ? ids.sort((left, right) => left - right) : ids;
}

// The token covers editable values only, not derived labels or session counts.
// It needs no database migration and is compared with a fresh database read at save time.
export function recordVersion(entity: EditableEntity, record: Record<string, unknown>): string {
  let values: unknown[];
  switch (entity) {
    case "laboratories":
      values = [record.code, record.name, record.location];
      break;
    case "installations":
      values = [record.code, record.name, record.laboratoryId, record.category, record.capacity, record.status, record.materialsDescription];
      break;
    case "practices":
      values = [record.code, record.name, record.duration, numericIds(record.installationIds, true)];
      break;
    case "degrees":
      values = [record.code, record.icsCode, record.name, record.level];
      break;
    case "subjects":
      values = [record.code, record.abbreviation, record.name, record.degreeId, numericIds(record.practiceIds), numericIds(record.editorIds, true)];
      break;
    case "teachers":
      values = [record.code, record.name, record.email, Boolean(record.isAdmin), Boolean(record.isLabStaff)];
      break;
    case "sessions":
      values = [record.sessionDate, record.startTime, record.duration, record.subjectId, record.teacherId ?? null, record.practiceId ?? null, record.groupCode ?? null];
      break;
  }
  return JSON.stringify(values);
}
