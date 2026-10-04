import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { teacherGroupEmailAddressing } from "../lib/smtp.ts";

test("chooses hidden or visible addressing for teacher group messages", () => {
  assert.deepEqual(
    teacherGroupEmailAddressing("sender@unizar.es", ["one@unizar.es", "sender@unizar.es", "two@unizar.es"], true),
    { to: "sender@unizar.es", bcc: ["one@unizar.es", "two@unizar.es"] },
  );
  assert.deepEqual(
    teacherGroupEmailAddressing("sender@unizar.es", ["one@unizar.es", "two@unizar.es"], false),
    { to: ["one@unizar.es", "two@unizar.es"], bcc: undefined },
  );
});

test("provides SMTP and operating-system email workflows without persisting credentials", async () => {
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
  assert.match(page, /setSmtpPassword\(""\)/);
  assert.match(page, /Se conservará únicamente en memoria hasta que cierres sesión o recargues la aplicación/);
  assert.match(page, /Enviar con copia oculta \(CCO\)/);
  assert.match(page, /const \[blindCopy, setBlindCopy\] = useState\(true\)/);
  assert.match(page, /blindCopy,/);
  assert.match(page, /Abrir en mi correo/);
  assert.match(page, /Enviar desde la web/);
  assert.match(page, /messageMailtoUrl/);
  assert.match(page, /window\.location\.assign\(mailto\)/);
  assert.doesNotMatch(route, /isAdmin|readOnlyResponse/);
  assert.match(route, /messageAudienceTeacherIds\(sessions, semesterId, subjectId, semesterFromDate\)/);
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
  assert.match(page, /Usuario SMTP \{smtpUsernameFromEmail\(sender\.email\)\}/);
  assert.match(styles, /\.messages-layout/);
  assert.match(styles, /\.messages-access-badge/);
  assert.match(styles, /\.messages-copy-option/);
  assert.match(styles, /\.messages-send-actions/);
  assert.match(styles, /\.smtp-password-dialog/);
  assert.match(help, /esta opción está activada por defecto/);
  assert.match(help, /<tr><td>Enviar mensajes a grupos<\/td><td><span className="yes">Sí<\/span><\/td><td><span className="yes">Sí<\/span><\/td><td><span className="yes">Sí<\/span><\/td><\/tr>/);
});
