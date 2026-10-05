export const recommendedMailtoLength = 8_000;

type MessageMailtoInput = {
  senderEmail: string;
  recipients: string[];
  blindCopy: boolean;
  subject: string;
  body: string;
};

function normalizedEmails(values: string[]) {
  return [...new Set(values
    .map((value) => value.trim().toLocaleLowerCase("es"))
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}

export function messageMailtoUrl({ senderEmail, recipients, blindCopy, subject, body }: MessageMailtoInput) {
  const normalizedSender = normalizedEmails([senderEmail])[0] ?? "";
  const normalizedRecipients = normalizedEmails(recipients).filter((email) => email !== normalizedSender);
  const to = blindCopy ? [] : normalizedRecipients;
  const bcc = blindCopy ? normalizedRecipients : [];
  const parameters: [string, string][] = [];
  if (bcc.length) parameters.push(["bcc", bcc.join(",")]);
  parameters.push(["subject", subject], ["body", body]);
  const query = parameters
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `mailto:${to.map(encodeURIComponent).join(",")}?${query}`;
}
