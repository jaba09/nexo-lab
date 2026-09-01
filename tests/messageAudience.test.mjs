import assert from "node:assert/strict";
import test from "node:test";

import { messageAudienceTeacherIds } from "../lib/messageAudience.ts";
import { semesterFromDate } from "../lib/semesters.ts";

const sessions = [
  { sessionDate: "2026-09-14", subjectId: 10, teacherId: 4 },
  { sessionDate: "2026-10-01", subjectId: 10, teacherId: 4 },
  { sessionDate: "2026-11-03", subjectId: 10, teacherId: 7 },
  { sessionDate: "2026-11-04", subjectId: 20, teacherId: 9 },
  { sessionDate: "2026-11-05", subjectId: 20, teacherId: null },
  { sessionDate: "2027-02-08", subjectId: 10, teacherId: 12 },
];

test("selects distinct teachers with teaching in one subject and semester", () => {
  assert.deepEqual(messageAudienceTeacherIds(sessions, "2026-27 S1", 10, semesterFromDate), [4, 7]);
});

test("selects all distinct teachers with teaching in the semester", () => {
  assert.deepEqual(messageAudienceTeacherIds(sessions, "2026-27 S1", null, semesterFromDate), [4, 7, 9]);
});

test("excludes unassigned sessions and sessions from another semester", () => {
  assert.deepEqual(messageAudienceTeacherIds(sessions, "2026-27 S2", 10, semesterFromDate), [12]);
});
