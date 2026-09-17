export function appVersion(): string {
  return process.env.NEXO_LAB_APP_VERSION?.trim()
    || process.env.RENDER_GIT_COMMIT?.trim()
    || "development";
}
