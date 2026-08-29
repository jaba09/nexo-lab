import assert from "node:assert/strict";
import test from "node:test";
import { mostFrequentGroupSchedule } from "../lib/sessionSchedules.ts";

test("shows only the most frequent weekday and schedule for a subgroup", () => {
  const monday = {
    count: 4,
    firstDate: "2027-02-01",
    weekdayIndex: 0,
    startTime: "15:00",
    endTime: "17:00",
    label: "Lunes-A 15:00–17:00",
  };
  const wednesday = {
    count: 1,
    firstDate: "2027-03-10",
    weekdayIndex: 2,
    startTime: "15:00",
    endTime: "17:00",
    label: "Miércoles-A 15:00–17:00",
  };

  assert.equal(mostFrequentGroupSchedule([wednesday, monday]), monday);
});

test("uses the earliest occurrence as a stable tie breaker", () => {
  const later = {
    count: 2,
    firstDate: "2027-03-10",
    weekdayIndex: 2,
    startTime: "15:00",
    endTime: "17:00",
  };
  const earlier = {
    count: 2,
    firstDate: "2027-02-01",
    weekdayIndex: 0,
    startTime: "15:00",
    endTime: "17:00",
  };

  assert.equal(mostFrequentGroupSchedule([later, earlier]), earlier);
});
