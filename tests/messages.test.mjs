import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { teacherGroupEmailAddressing } from "../lib/smtp.ts";

test("chooses hidden or visible addressing for teacher group messages", () => {
  assert.deepEqual(
    teacherGroupEmailAddressing("sender@unizar.es", ["one@unizar.es", "sender@unizar.es", "two@unizar.es"], true),
    { to: undefined, bcc: ["one@unizar.es", "two@unizar.es"] },
  );
  assert.deepEqual(
    teacherGroupEmailAddressing("sender@unizar.es", ["one@unizar.es", "sender@unizar.es", "two@unizar.es"], false),
    { to: ["one@unizar.es", "two@unizar.es"], bcc: undefined },
  );
});

test("opens teacher group messages in the system email app without requesting credentials", async () => {
  const [page, route, email, smtp, mailto, styles, help] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/messages/send/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/email.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/smtp.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/messageMailto.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ayuda/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /key: "messages", label: "Mensajes", short: "MEN"/);
  assert.doesNotMatch(page, /adminOnly/);
  assert.match(page, /navigation\.filter\([\s\S]*?\.map\(\(item\) =>/);
  assert.match(page, /function MessagesView/);
  assert.match(page, /Disponible para profesores/);
  assert.match(page, /Docencia en una asignatura/);
  assert.match(page, /Toda la docencia del semestre/);
  assert.match(page, /Enviar con copia oculta \(CCO\)/);
  assert.match(page, /const \[blindCopy, setBlindCopy\] = useState\(false\)/);
  assert.match(page, /blindCopy,/);
  assert.match(page, /Abrir en mi correo/);
  assert.doesNotMatch(page, /Enviar desde la web/);
  assert.doesNotMatch(page, /smtpPassword|smtp-password-title|Contraseña del correo/);
  assert.match(page, /messageMailtoUrl/);
  assert.match(page, /window\.location\.assign\(mailto\)/);
  assert.doesNotMatch(route, /isAdmin|readOnlyResponse/);
  assert.match(route, /messageAudienceTeacherIds\(sessions, semesterId, subjectId, semesterFromDate, authenticatedTeacher\.id\)/);
  assert.match(page, /messageAudienceTeacherIds\(data\.sessions, selectedSemester, audienceSubjectId, semesterFromDate, sender\.id\)/);
  assert.match(route, /email !== senderEmail/);
  assert.match(route, /recipients\.length > 200/);
  assert.doesNotMatch(route, /INSERT|UPDATE|DELETE/i);
  assert.match(route, /const blindCopy = payload\.blindCopy !== false/);
  assert.match(email, /teacherGroupEmailAddressing\(user, normalizedRecipients, blindCopy\)/);
  assert.match(email, /\.\.\.addressing/);
  assert.match(email, /const authenticationUser = smtpUsernameFromEmail\(user\)/);
  assert.match(email, /auth: \{ user: authenticationUser, pass: password \}/);
  assert.match(smtp, /normalized\.endsWith\(suffix\) \? normalized\.slice\(0, -suffix\.length\) : normalized/);
  assert.match(mailto, /mailto:/);
  assert.match(mailto, /\["bcc", bcc\.join\(","\)\]/);
  assert.match(styles, /\.messages-layout/);
  assert.match(styles, /\.messages-access-badge/);
  assert.match(styles, /\.messages-copy-option/);
  assert.match(styles, /\.messages-mail-status/);
  assert.match(styles, /\.messages-send-actions/);
  assert.match(help, /Por defecto, los destinatarios aparecen en el campo Para/);
  assert.match(help, /sin solicitar ni almacenar contraseñas/);
  assert.match(help, /<tr><td>Enviar mensajes a grupos<\/td><td><span className="yes">Sí<\/span><\/td><td><span className="yes">Sí<\/span><\/td><td><span className="yes">Sí<\/span><\/td><\/tr>/);
});
