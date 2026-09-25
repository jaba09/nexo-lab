export function smtpUsernameFromEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const suffix = "@unizar.es";
  return normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length) : normalized;
}

export function teacherGroupEmailAddressing(user: string, recipients: string[], blindCopy: boolean) {
  if (!blindCopy) return { to: recipients, bcc: undefined };
  const blindCopyRecipients = recipients.filter((email) => email !== user);
  return {
    to: user,
    bcc: blindCopyRecipients.length ? blindCopyRecipients : undefined,
  };
}
