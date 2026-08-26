import assert from "node:assert/strict";
import test from "node:test";
import { teachersToCsv } from "../lib/teacherExports.ts";

test("exports professor identifiers and names as CSV", () => {
  const content = teachersToCsv([
    { code: "JBA", name: "J. Blasco" },
    { code: "PGN", name: "P. García Nav., Jr." },
    { code: "AC", name: 'A. "Cubero"' },
  ]);

  assert.equal(
    content,
    '\uFEFFid,nombre\r\nJBA,J. Blasco\r\nPGN,"P. García Nav., Jr."\r\nAC,"A. ""Cubero"""\r\n',
  );
});
