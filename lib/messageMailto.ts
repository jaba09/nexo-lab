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
  const normalizedRecipients = normalizedEmails(recipients);
  const normalizedSender = normalizedEmails([senderEmail])[0] ?? "";
  const to = blindCopy ? (normalizedSender ? [normalizedSender] : []) : normalizedRecipients;
  const bcc = blindCopy
    ? normalizedRecipients.filter((email) => email !== normalizedSender)
    : [];
  const parameters: [string, string][] = [];
  if (bcc.length) parameters.push(["bcc", bcc.join(",")]);
  parameters.push(["subject", subject], ["body", body]);
  const query = parameters
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `mailto:${to.map(encodeURIComponent).join(",")}?${query}`;
}
