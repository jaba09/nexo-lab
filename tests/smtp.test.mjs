import assert from "node:assert/strict";
import test from "node:test";

import { smtpUsernameFromEmail } from "../lib/smtp.ts";

test("uses the local part as the SMTP username for Unizar accounts", () => {
  assert.equal(smtpUsernameFromEmail("jablasal@unizar.es"), "jablasal");
  assert.equal(smtpUsernameFromEmail(" JABLASAL@UNIZAR.ES "), "jablasal");
});

test("preserves non-Unizar SMTP usernames", () => {
  assert.equal(smtpUsernameFromEmail("teacher@example.test"), "teacher@example.test");
  assert.equal(smtpUsernameFromEmail("local-user"), "local-user");
});
