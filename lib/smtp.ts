export function smtpUsernameFromEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const suffix = "@unizar.es";
  return normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length) : normalized;
}
