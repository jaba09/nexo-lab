import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildPizarraData } from "../lib/pizarraImport.mjs";
import { layoutPizarraClasses, pizarraAddDays, pizarraVisibleInterval, pizarraWeek } from "../lib/pizarra.ts";

test("Pizarra respects Admin hours without changing class times or durations", () => {
  const item = { startTime: "08:00", duration: 180 };
  assert.deepEqual(pizarraVisibleInterval(item, 9, 10), { offset: 0, duration: 60 });
  assert.deepEqual(pizarraVisibleInterval(item, 7, 10), { offset: 60, duration: 120 });
  assert.equal(pizarraVisibleInterval(item, 11, 19), null);
  assert.equal(pizarraVisibleInterval(item, 6, 8), null);
  assert.deepEqual(pizarraVisibleInterval(item, 8, 19), { offset: 0, duration: 180 });
  assert.deepEqual(item, { startTime: "08:00", duration: 180 });
});

const header = "\uFEFFcódigo,grupo,semestre,tipo_docen,profesor,horas\r\n";
const event = (summary, start = "20260922T080000Z", end = "20260922T090000Z", extra = "") => `BEGIN:VEVENT\r\nSUMMARY:${summary}\r\nDTSTART:${start}\r\nDTEND:${end}\r\n${extra}END:VEVENT\r\n`;
const calendar = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join("")}END:VCALENDAR\r\n`;

test("Pizarra joins subject, group, semester and teaching type, with Madrid time and folded SUMMARY", () => {
  const csv = header + [
    "30013,821,1,CM,Profesor CM,30",
    "30013,821,1,Prob_casos,Profesor problemas,20",
    "30013,822,1,Prob_casos,Otro grupo,20",
    "30013,821,2,Prob_casos,Otro semestre,20",
    "30018,821,1,CM,Otra asignatura,30",
    "30013,821,1,Lab (3A),Profesor laboratorio,100",
  ].join("\r\n");
  const result = buildPizarraData(calendar(
    event("30013 - Mecánica Grupo: 821 - Clase Magistral"),
    event("30013 - Mecánica Grupo: 8211 - Resolución de problemas y\r\n  casos", "20261103T080000Z", "20261103T100000Z"),
    event("30013 - Mecánica Grupo: 8211 - Prácticas de laboratorio"),
    event("30013 - Mecánica Grupo: 8211 - Pruebas de evaluación"),
  ), csv);
  assert.equal(result.classes.length, 2);
  assert.equal(result.classes[0].startTime, "10:00");
  assert.deepEqual(result.classes[0].teachers, ["Profesor CM"]);
  assert.equal(result.classes[1].startTime, "09:00");
  assert.equal(result.classes[1].duration, 120);
  assert.deepEqual(result.classes[1].teachers, ["Profesor problemas"]);
  assert.equal(result.summary.ignoredEvents, 2);
  assert.ok(!result.teachers.includes("Profesor laboratorio"));
});

test("Pizarra retains a shared teaching team without inventing dates and ignores repeated CSV rows", () => {
  const csv = header + [
    "29729,532,1,CM,S. Martínez,15",
    "29729,532,1,CM,J. Murillo,15",
    "29729,532,1,CM,J. Murillo,15",
  ].join("\n");
  const lecture = event("29729 - Máquinas Grupo: 532 - Clase Magistral");
  const result = buildPizarraData(calendar(lecture, lecture), csv);
  assert.equal(result.classes.length, 1);
  assert.deepEqual(result.classes[0].teachers, ["S. Martínez", "J. Murillo"]);
  assert.equal(result.summary.sharedClasses, 1);
  assert.equal(result.summary.duplicateEvents, 1);
  assert.equal(result.summary.duplicateRows, 1);
});

test("Pizarra handles blank groups, abbreviated ranges and exact subgroup overrides without matching unrelated groups", () => {
  const csv = header + [
    "29917,,2,Prob_casos,J. Blasco,40",
    "60870,872-3,2,CM,F. Alcrudo,9",
    "30013,821,1,Prob_casos,Grupo principal,20",
    "30013,8212,1,Prob_casos,Subgrupo explícito,20",
    "67030,127,1,CM,P. García,5",
  ].join("\n");
  const result = buildPizarraData(calendar(
    event("29917 - Fluidos Grupo: 7211 - Resolución de problemas y casos", "20270308T080000Z", "20270308T090000Z"),
    event("60870 - Ingeniería Grupo: 873 - Clase Magistral", "20270308T080000Z", "20270308T090000Z"),
    event("30013 - Fluidos Grupo: 8212 - Resolución de problemas y casos"),
    event("67030 - Modelos Grupo: 881 - Clase Magistral"),
  ), csv);
  assert.deepEqual(result.classes.find((item) => item.subjectCode === "29917").teachers, ["J. Blasco"]);
  assert.deepEqual(result.classes.find((item) => item.subjectCode === "60870").teachers, ["F. Alcrudo"]);
  assert.deepEqual(result.classes.find((item) => item.subjectCode === "30013").teachers, ["Subgrupo explícito"]);
  assert.deepEqual(result.classes.find((item) => item.subjectCode === "67030").teachers, []);
  assert.equal(result.summary.unmatchedClasses, 1);
  assert.deepEqual(result.summary.classesWithoutAssignments, ["67030 · G881 · CM"]);
});

test("Pizarra rejects incomplete sources and unsupported recurrence rather than silently omitting classes", () => {
  const csv = header + "30013,821,1,CM,Profesor,30";
  assert.throws(() => buildPizarraData("not a calendar", csv), /calendario completo/);
  assert.throws(() => buildPizarraData(calendar(event("30013 - Fluidos Grupo: 821 - Clase Magistral", undefined, undefined, "RRULE:FREQ=WEEKLY\r\n")), csv), /recurrencias/);
  assert.throws(() => buildPizarraData(calendar(), "codigo,profesor\n30013,Profesor"), /CSV debe incluir/);
});

test("Pizarra separates overlapping classes and treats adjacent end/start times as non-overlapping", () => {
  const items = [
    { id: "one", startTime: "09:00", duration: 120 },
    { id: "two", startTime: "10:00", duration: 120 },
    { id: "three", startTime: "11:00", duration: 60 },
    { id: "four", startTime: "12:00", duration: 60 },
  ];
  const layout = layoutPizarraClasses(items);
  assert.deepEqual(layout.map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2], [0, 2], [0, 1]]);
  assert.equal(pizarraWeek("2026-09-22"), "2026-09-21");
  assert.equal(pizarraAddDays("2026-10-25", 1), "2026-10-26");
});

test("the supplied Pizarra snapshot contains only the requested teaching types and preserves unmapped groups", async () => {
  const data = JSON.parse(await readFile(new URL("../data/pizarra.json", import.meta.url), "utf8"));
  assert.equal(data.classes.length, 1326);
  assert.equal(data.teachers.length, 17);
  assert.equal(new Set(data.classes.map((item) => item.id)).size, data.classes.length);
  assert.ok(data.classes.every((item) => ["CM", "Prob_casos"].includes(item.teachingType)));
  assert.ok(data.classes.filter((item) => item.subjectCode === "29917").every((item) => item.teachers.length === 1 && item.teachers[0] === "J. Blasco"));
  assert.equal(data.summary.unmatchedClasses, 8);
  assert.ok(data.classes.filter((item) => !item.teachers.length).every((item) => item.subjectCode === "67030" && item.groupCode === "881"));
});
