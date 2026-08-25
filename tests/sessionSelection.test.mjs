import assert from "node:assert/strict";
import test from "node:test";
import { sessionSelectionRangeIds } from "../lib/sessionSelection.ts";

test("limits shift-click selection to the visible subgroup", () => {
  const subjectSessions = Array.from({ length: 8 }, (_, index) => ({ id: index + 1 }));
  const visibleSubgroupSessions = [subjectSessions[2], subjectSessions[6]];

  assert.deepEqual(
    sessionSelectionRangeIds(visibleSubgroupSessions, 3, 7),
    [3, 7],
  );
  assert.deepEqual(
    sessionSelectionRangeIds(subjectSessions, 3, 7),
    [3, 4, 5, 6, 7],
  );
});

test("returns no range when the anchor belongs to another subgroup", () => {
  assert.equal(sessionSelectionRangeIds([{ id: 4 }, { id: 8 }], 3, 8), null);
});
