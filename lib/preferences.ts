import type { DatabaseSync } from "node:sqlite";

export type AppPreferences = {
  calendarStartHour: number;
  calendarEndHour: number;
};

export const defaultAppPreferences: AppPreferences = {
  calendarStartHour: 8,
  calendarEndHour: 19,
};

const preferenceKeys = {
  calendarStartHour: "preference_calendar_start_hour",
  calendarEndHour: "preference_calendar_end_hour",
} as const;

function storedHour(value: string | undefined, fallback: number) {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

export function validateAppPreferences(value: unknown): AppPreferences | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const calendarStartHour = Number(payload.calendarStartHour);
  const calendarEndHour = Number(payload.calendarEndHour);
  if (
    !Number.isInteger(calendarStartHour)
    || !Number.isInteger(calendarEndHour)
    || calendarStartHour < 0
    || calendarStartHour > 22
    || calendarEndHour < 1
    || calendarEndHour > 23
    || calendarEndHour <= calendarStartHour
  ) return null;
  return { calendarStartHour, calendarEndHour };
}

export function readAppPreferences(database: DatabaseSync): AppPreferences {
  const rows = database.prepare(`SELECT key, value FROM app_meta
    WHERE key IN (?, ?)`)
    .all(preferenceKeys.calendarStartHour, preferenceKeys.calendarEndHour) as { key: string; value: string }[];
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const preferences = {
    calendarStartHour: storedHour(values.get(preferenceKeys.calendarStartHour), defaultAppPreferences.calendarStartHour),
    calendarEndHour: storedHour(values.get(preferenceKeys.calendarEndHour), defaultAppPreferences.calendarEndHour),
  };
  return preferences.calendarEndHour > preferences.calendarStartHour ? preferences : { ...defaultAppPreferences };
}

export function saveAppPreferences(database: DatabaseSync, preferences: AppPreferences) {
  const save = database.prepare(`INSERT INTO app_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  database.exec("BEGIN IMMEDIATE");
  try {
    save.run(preferenceKeys.calendarStartHour, String(preferences.calendarStartHour));
    save.run(preferenceKeys.calendarEndHour, String(preferences.calendarEndHour));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
