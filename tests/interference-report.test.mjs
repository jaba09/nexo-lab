import assert from "node:assert/strict";
import test from "node:test";
import { interferenceReportToPdfArrayBuffer } from "../lib/interferenceReport.ts";

const conflict = {
  kind: "Profesor",
  resourceCode: "JBA",
  resourceName: "J. Blasco",
  sessionDate: "2026-09-14",
  first: {
    id: 10,
    subjectCode: "30013",
    groupCode: "11",
    practiceCode: "VIS",
    practiceName: "P2 Viscosidad",
    startTime: "09:00",
    endTime: "11:00",
  },
  second: {
    id: 20,
    subjectCode: "30018",
    groupCode: null,
    practiceCode: null,
    practiceName: null,
    startTime: "10:00",
    endTime: "12:00",
  },
};

test("exports a complete interference report as a valid PDF", async () => {
  const content = await interferenceReportToPdfArrayBuffer(
    [conflict],
    274,
    new Date("2026-09-11T10:30:00+02:00"),
  );
  const signature = new TextDecoder().decode(new Uint8Array(content, 0, 4));
  assert.equal(signature, "%PDF");
  assert.ok(content.byteLength > 2_000);
});

test("exports a valid PDF when no conflicts exist", async () => {
  const content = await interferenceReportToPdfArrayBuffer(
    [],
    42,
    new Date("2026-09-11T10:30:00+02:00"),
  );
  const signature = new TextDecoder().decode(new Uint8Array(content, 0, 4));
  assert.equal(signature, "%PDF");
  assert.ok(content.byteLength > 1_000);
});
