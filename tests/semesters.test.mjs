import assert from "node:assert/strict";
import test from "node:test";

import { semesterDefinition, semesterFromDate, semesterOptions } from "../lib/semesters.ts";

test("maps calendar dates to the two semesters of an academic year", () => {
  assert.equal(semesterFromDate("2026-09-01"), "2026-27 S1");
  assert.equal(semesterFromDate("2027-01-31"), "2026-27 S1");
  assert.equal(semesterFromDate("2027-02-01"), "2026-27 S2");
  assert.equal(semesterFromDate("2027-08-31"), "2026-27 S2");

  const secondSemester = semesterDefinition("2026-27 S2");
  assert.equal(secondSemester.startDate, "2027-02-01");
  assert.equal(secondSemester.endDate, "2027-08-31");
});

test("offers both semesters for every detected academic year", () => {
  const options = semesterOptions(["2026-10-01", "2027-03-15"], "2026-08-15");
  assert.deepEqual(options.map((semester) => semester.id), [
    "2026-27 S1",
    "2026-27 S2",
    "2025-26 S1",
    "2025-26 S2",
  ]);
});
