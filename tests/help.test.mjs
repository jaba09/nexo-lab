import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("includes a protected, integrated user manual", async () => {
  const [application, help, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ayuda/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(application, /href="\/ayuda"/);
  assert.match(application, />Manual de uso</);
  assert.match(help, /getAuthenticatedTeacher/);
  assert.match(help, /if \(!teacher\) redirect\("\/"\)/);
  assert.match(help, /Manual de uso — Nexo Lab/);
  assert.match(help, /id="calendario"/);
  assert.match(help, /id="importaciones"/);
  assert.match(help, /id="permisos"/);
  assert.match(help, /Shift \+ clic/);
  assert.match(help, /He olvidado mi contraseña/);
  assert.match(help, /<strong>Mensajes<\/strong>/);
  assert.match(help, /Enviar mensajes a grupos/);
  assert.match(styles, /\.help-frame/);
  assert.match(styles, /\.help-permission-table/);
  assert.match(styles, /\.help-faq/);
});
