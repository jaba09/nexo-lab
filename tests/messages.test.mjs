import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("provides an authenticated teacher group email workflow without persisting SMTP credentials", async () => {
  const [page, route, email, smtp, styles, help] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/messages/send/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/email.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/smtp.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ayuda/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /key: "messages", label: "Mensajes", short: "MEN"/);
  assert.doesNotMatch(page, /adminOnly/);
  assert.match(page, /navigation\.map\(\(item\) =>/);
  assert.match(page, /function MessagesView/);
  assert.match(page, /Disponible para profesores/);
  assert.match(page, /Docencia en una asignatura/);
  assert.match(page, /Toda la docencia del semestre/);
  assert.match(page, /setSmtpPassword\(""\)/);
  assert.match(page, /Se conservará únicamente en memoria hasta que cierres sesión o recargues la aplicación/);
  assert.doesNotMatch(route, /isAdmin|readOnlyResponse/);
  assert.match(route, /messageAudienceTeacherIds\(sessions, semesterId, subjectId, semesterFromDate\)/);
  assert.match(route, /recipients\.length > 200/);
  assert.doesNotMatch(route, /INSERT|UPDATE|DELETE/i);
  assert.match(email, /bcc: blindCopyRecipients\.length \? blindCopyRecipients : undefined/);
  assert.match(email, /const authenticationUser = smtpUsernameFromEmail\(user\)/);
  assert.match(email, /auth: \{ user: authenticationUser, pass: password \}/);
  assert.match(smtp, /normalized\.endsWith\(suffix\) \? normalized\.slice\(0, -suffix\.length\) : normalized/);
  assert.match(page, /Usuario SMTP \{smtpUsernameFromEmail\(sender\.email\)\}/);
  assert.match(styles, /\.messages-layout/);
  assert.match(styles, /\.messages-access-badge/);
  assert.match(styles, /\.smtp-password-dialog/);
  assert.match(help, /<tr><td>Enviar mensajes a grupos<\/td><td><span className="yes">Sí<\/span><\/td><td><span className="yes">Sí<\/span><\/td><td><span className="yes">Sí<\/span><\/td><\/tr>/);
});
