import nodemailer from "nodemailer";

const defaultSmtpHost = "smtp.unizar.es";
const defaultSmtpPort = 587;

type PasswordResetEmail = {
  to: string;
  teacherName: string;
  resetUrl: string;
};

function smtpSettings() {
  const user = process.env.SMTP_USER?.trim() ?? "";
  const password = process.env.SMTP_PASSWORD ?? "";
  const host = process.env.SMTP_HOST?.trim() || defaultSmtpHost;
  const parsedPort = Number(process.env.SMTP_PORT || defaultSmtpPort);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
    ? parsedPort
    : defaultSmtpPort;
  const from = process.env.EMAIL_FROM?.trim() || `Nexo Lab <${user}>`;
  return { user, password, host, port, from };
}

export function passwordEmailConfigurationError() {
  const { user, password } = smtpSettings();
  if (!user || !password) {
    return "El correo de recuperación todavía no está configurado en el servidor.";
  }
  return null;
}

function escapedHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export async function sendPasswordResetEmail({ to, teacherName, resetUrl }: PasswordResetEmail) {
  const { user, password, host, port, from } = smtpSettings();
  if (!user || !password) throw new Error("SMTP_NOT_CONFIGURED");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2", servername: host },
  });
  const safeName = escapedHtml(teacherName);
  const safeUrl = escapedHtml(resetUrl);
  await transporter.sendMail({
    from,
    to,
    subject: "Restablecer la contraseña de Nexo Lab",
    text: [
      `Hola, ${teacherName}:`,
      "",
      "Se ha solicitado restablecer tu contraseña de Nexo Lab.",
      `Abre este enlace durante los próximos 30 minutos: ${resetUrl}`,
      "",
      "Si no has realizado esta solicitud, puedes ignorar este mensaje.",
    ].join("\n"),
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f4f2eb;color:#17201d;font-family:Arial,sans-serif">
      <div style="max-width:560px;margin:32px auto;padding:36px;background:#fffef9;border:1px solid #d9d8d0;border-radius:14px">
        <p style="font-size:12px;font-weight:700;letter-spacing:.12em">NEXO LAB</p>
        <h1 style="font-size:28px;line-height:1.1">Restablecer contraseña</h1>
        <p>Hola, ${safeName}:</p>
        <p>Se ha solicitado restablecer tu contraseña. El enlace solo puede utilizarse una vez y caduca en 30 minutos.</p>
        <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 20px;border-radius:8px;background:#17201d;color:#fff;text-decoration:none;font-weight:700">Elegir nueva contraseña</a></p>
        <p style="font-size:13px;color:#68716d">Si no has realizado esta solicitud, puedes ignorar este mensaje.</p>
      </div>
    </body></html>`,
  });
}
