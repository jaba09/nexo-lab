export function smtpUsernameFromEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const suffix = "@unizar.es";
  return normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length) : normalized;
}

export function teacherGroupEmailAddressing(user: string, recipients: string[], blindCopy: boolean) {
  const externalRecipients = recipients.filter((email) => email !== user);
  if (!blindCopy) return { to: externalRecipients, bcc: undefined };
  return {
    to: undefined,
    bcc: externalRecipients.length ? externalRecipients : undefined,
  };
}
