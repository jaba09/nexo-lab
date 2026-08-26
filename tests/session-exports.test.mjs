import assert from "node:assert/strict";
import test from "node:test";
import { sessionsToCsv, sessionsToIcs, sessionsToPdfArrayBuffer } from "../lib/sessionExports.ts";

const sampleSession = {
  id: 42,
  sessionDate: "2026-09-14",
  startTime: "10:00",
  duration: 120,
  subjectCode: "30013",
  subjectName: "Mecánica de fluidos",
  subjectAbbreviation: "MF",
  degreeCode: "GIQ",
  degreeName: "Grado en Ingeniería Química",
  practiceCode: "VIS",
  practiceName: "Viscosidad",
  installationName: "Laboratorio de fluidos",
  teacherCode: "JBA",
  teacherName: "J. Blasco",
  groupCode: "36",
};

test("exports selected sessions as an interoperable ICS calendar", () => {
  const content = sessionsToIcs([sampleSession], new Date("2026-08-23T18:00:00Z"));

  assert.match(content, /^BEGIN:VCALENDAR\r\n/);
  assert.match(content, /DTSTART;TZID=Europe\/Madrid:20260914T100000/);
  assert.match(content, /DTEND;TZID=Europe\/Madrid:20260914T120000/);
  assert.match(content, /SUMMARY:30013 - Mecánica de fluidos Grupo: 36 - Prácticas de laborat/);
  assert.match(content, /LOCATION:Laboratorio de fluidos/);
  assert.match(content, /UID:nexo-lab-session-42@nexo-lab/);
  assert.match(content, /END:VCALENDAR\r\n$/);
});

test("exports selected sessions as a valid PDF document", async () => {
  const content = await sessionsToPdfArrayBuffer([sampleSession]);
  const signature = new TextDecoder().decode(new Uint8Array(content, 0, 4));
  assert.equal(signature, "%PDF");
  assert.ok(content.byteLength > 1_000);
});

test("exports semester sessions as chronological CSV rows", () => {
  const laterSession = { ...sampleSession, id: 43, sessionDate: "2026-09-15", startTime: "09:00", duration: 90, subjectCode: "30018" };
  const content = sessionsToCsv([laterSession, sampleSession]);

  assert.equal(
    content,
    "\uFEFFcodigo,fecha,hora_ini,duracion\r\n30013,2026-09-14,10:00,120\r\n30018,2026-09-15,09:00,90\r\n",
  );
});
