import assert from "node:assert/strict";
import test from "node:test";
import {
  findNewSessionConflict,
  findSessionConflicts,
  installationIncludedInConflictChecks,
} from "../lib/sessionConflicts.ts";

function session(overrides) {
  return {
    id: 1,
    sessionDate: "2026-09-14",
    startTime: "09:00",
    duration: 120,
    teacherId: 1,
    installationIds: [10],
    ...overrides,
  };
}

test("detects a newly introduced teacher overlap", () => {
  const before = [
    session({ id: 1, teacherId: 1 }),
    session({ id: 2, startTime: "10:00", teacherId: 2, installationIds: [20] }),
  ];
  const after = before.map((item) => item.id === 2 ? { ...item, teacherId: 1 } : item);

  const conflict = findNewSessionConflict(before, after, new Set([2]));
  assert.equal(conflict?.kind, "teacher");
  assert.equal(conflict?.resourceId, 1);
});

test("excludes Sala ordenadores EINA from installation conflict checks", () => {
  assert.equal(installationIncludedInConflictChecks({
    id: 10,
    code: "INS-ORD",
    name: "Aula de informática",
  }), false);
  assert.equal(installationIncludedInConflictChecks({
    id: 11,
    code: "INS-OTRA",
    name: "Sala ordenadores EINA",
  }), false);
  assert.equal(installationIncludedInConflictChecks({
    id: 12,
    code: "INS-VIS",
    name: "Viscosidad",
  }), true);
});

test("detects an overlap through any installation used by a practice", () => {
  const before = [
    session({ id: 1, teacherId: 1, installationIds: [10, 11] }),
    session({ id: 2, startTime: "10:30", teacherId: 2, installationIds: [20] }),
  ];
  const after = before.map((item) => item.id === 2
    ? { ...item, installationIds: [11, 20] }
    : item);

  const conflict = findNewSessionConflict(before, after, new Set([2]));
  assert.equal(conflict?.kind, "installation");
  assert.equal(conflict?.resourceId, 11);
});

test("allows sessions whose time intervals only touch", () => {
  const before = [session({ id: 1 })];
  const after = [
    ...before,
    session({ id: -1, startTime: "11:00" }),
  ];

  assert.equal(findNewSessionConflict(before, after, new Set([-1])), null);
});

test("detects conflicts introduced between sessions in the same batch", () => {
  const before = [
    session({ id: 1, teacherId: 1, installationIds: [10] }),
    session({ id: 2, startTime: "10:00", teacherId: 2, installationIds: [20] }),
  ];
  const after = before.map((item) => ({ ...item, teacherId: 3 }));

  const conflict = findNewSessionConflict(before, after, new Set([1, 2]));
  assert.equal(conflict?.kind, "teacher");
  assert.equal(conflict?.resourceId, 3);
});

test("does not block an edit because of a pre-existing conflict", () => {
  const before = [
    session({ id: 1 }),
    session({ id: 2, startTime: "10:00" }),
  ];
  const after = before.map((item) => item.id === 1
    ? { ...item, installationIds: [10, 30] }
    : item);

  assert.equal(findNewSessionConflict(before, after, new Set([1])), null);
});

test("audits every existing teacher and installation conflict", () => {
  const sessions = [
    session({ id: 1, teacherId: 7, installationIds: [10, 11] }),
    session({ id: 2, startTime: "10:00", teacherId: 7, installationIds: [11] }),
    session({ id: 3, sessionDate: "2026-09-15", teacherId: 7, installationIds: [11] }),
  ];

  const conflicts = findSessionConflicts(sessions);
  assert.deepEqual(
    conflicts.map(({ kind, resourceId }) => ({ kind, resourceId })),
    [
      { kind: "teacher", resourceId: 7 },
      { kind: "installation", resourceId: 11 },
    ],
  );
});
