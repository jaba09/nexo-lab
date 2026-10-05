import assert from "node:assert/strict";
import test from "node:test";
import { messageMailtoUrl, recommendedMailtoLength } from "../lib/messageMailto.ts";

test("prepares visible recipients for the operating system mail application", () => {
  assert.equal(
    messageMailtoUrl({
      senderEmail: "sender@unizar.es",
      recipients: ["one@unizar.es", "sender@unizar.es", "two@unizar.es"],
      blindCopy: false,
      subject: "Aviso de prácticas",
      body: "Primera línea\nSegunda línea",
    }),
    "mailto:one%40unizar.es,two%40unizar.es?subject=Aviso%20de%20pr%C3%A1cticas&body=Primera%20l%C3%ADnea%0ASegunda%20l%C3%ADnea",
  );
});

test("excludes the sender and uses only the group as BCC when hidden copy is selected", () => {
  assert.equal(
    messageMailtoUrl({
      senderEmail: "SENDER@UNIZAR.ES",
      recipients: ["one@unizar.es", "sender@unizar.es", "ONE@UNIZAR.ES"],
      blindCopy: true,
      subject: "Reunión",
      body: "Hola",
    }),
    "mailto:?bcc=one%40unizar.es&subject=Reuni%C3%B3n&body=Hola",
  );
  assert.equal(recommendedMailtoLength, 8_000);
});
