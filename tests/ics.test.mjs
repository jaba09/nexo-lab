import assert from "node:assert/strict";
import test from "node:test";

import { parseIcsLabSessions } from "../lib/ics.ts";

const calendar = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:lab-summer\r
SUMMARY:30013 - Mecánica de fluidos Grupo: 17 - Prácticas de labo\r
 ratorio\r
DTSTART:20261001T090000Z\r
DTEND:20261001T120000Z\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:lab-winter\r
SUMMARY:30013 - Mecánica de fluidos Grupo: 36 - Prácticas de laboratorio\r
DTSTART:20261126T100000Z\r
DTEND:20261126T130000Z\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:lecture\r
SUMMARY:30013 - Mecánica de fluidos Grupo: 823 - Clase Magistral\r
DTSTART:20261104T150000Z\r
DTEND:20261104T170000Z\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:holiday\r
SUMMARY:Día festivo - \r
DTSTART;VALUE=DATE:20261208\r
DTEND;VALUE=DATE:20261209\r
END:VEVENT\r
END:VCALENDAR\r
`;

test("extracts only laboratory sessions and derives degree and subject codes", () => {
  const result = parseIcsLabSessions(calendar);

  assert.equal(result.totalEvents, 4);
  assert.equal(result.sessions.length, 2);
  assert.equal(result.holidays.length, 1);
  assert.equal(result.ignoredCount, 1);
  assert.deepEqual(result.sessions[0], {
    sourceUid: "lab-summer",
    summary: "30013 - Mecánica de fluidos Grupo: 17 - Prácticas de laboratorio",
    subjectCode: "30013",
    subjectName: "Mecánica de fluidos",
    degreeCode: "300",
    groupCode: "17",
    sessionDate: "2026-10-01",
    startTime: "11:00",
    duration: 180,
  });
  assert.equal(result.sessions[1].startTime, "11:00");
  assert.equal(result.sessions[1].groupCode, "36");
  assert.deepEqual(result.holidays[0], {
    sourceUid: "holiday",
    summary: "Día festivo - ",
    holidayDate: "2026-12-08",
    name: "Día festivo",
  });
});
