import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("provides an admin-only teacher group email workflow without persisting SMTP credentials", async () => {
  const [page, route, email, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/messages/send/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/email.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /key: "messages", label: "Mensajes", short: "MEN", adminOnly: true/);
  assert.match(page, /navigation\.filter\(\(item\) => !item\.adminOnly \|\| authenticatedTeacher\.isAdmin\)/);
  assert.match(page, /function MessagesView/);
  assert.match(page, /Docencia en una asignatura/);
  assert.match(page, /Toda la docencia del semestre/);
  assert.match(page, /setSmtpPassword\(""\)/);
  assert.match(page, /Se conservará únicamente en memoria hasta que cierres sesión o recargues la aplicación/);
  assert.match(route, /if \(!authenticatedTeacher\.isAdmin\) return readOnlyResponse\(\)/);
  assert.match(route, /messageAudienceTeacherIds\(sessions, semesterId, subjectId, semesterFromDate\)/);
  assert.match(route, /recipients\.length > 200/);
  assert.doesNotMatch(route, /INSERT|UPDATE|DELETE/i);
  assert.match(email, /bcc: blindCopyRecipients\.length \? blindCopyRecipients : undefined/);
  assert.match(email, /auth: \{ user, pass: password \}/);
  assert.match(styles, /\.messages-layout/);
  assert.match(styles, /\.smtp-password-dialog/);
});
