import { NextResponse } from "next/server";
import { createPasswordResetToken, sessionTokenHash } from "../../../../../lib/auth";
import { getDatabase } from "../../../../../lib/database";
import { passwordEmailConfigurationError, sendPasswordResetEmail } from "../../../../../lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const acceptedMessage = "Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.";

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function publicApplicationUrl(request: Request) {
  const configuredUrl = process.env.NEXO_LAB_PUBLIC_URL?.trim();
  const fallback = process.env.NODE_ENV === "production"
    ? "https://nexo-lab.onrender.com"
    : new URL(request.url).origin;
  const publicUrl = new URL(configuredUrl || fallback);
  if (!["http:", "https:"].includes(publicUrl.protocol)) throw new Error("INVALID_PUBLIC_URL");
  return publicUrl;
}

export async function POST(request: Request) {
  const configurationError = passwordEmailConfigurationError();
  if (configurationError) return NextResponse.json({ error: configurationError }, { status: 503 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "La solicitud de recuperación no es válida." }, { status: 400 });
  }
  const email = normalizedEmail(payload.email);
  if (!email || email.length > 254 || !email.includes("@")) {
    return NextResponse.json({ error: "Introduce una dirección de correo válida." }, { status: 400 });
  }

  let publicUrl: URL;
  try {
    publicUrl = publicApplicationUrl(request);
  } catch {
    return NextResponse.json({ error: "La dirección pública de la aplicación no está bien configurada." }, { status: 503 });
  }

  const database = getDatabase();
  const teacher = database.prepare(`SELECT id, name, email FROM teachers
    WHERE email = ? COLLATE NOCASE`).get(email) as { id: number; name: string; email: string } | undefined;
  if (!teacher) return NextResponse.json({ message: acceptedMessage });

  const recentRequest = database.prepare(`SELECT 1 FROM password_reset_tokens
    WHERE teacher_id = ? AND created_at > ?`).get(teacher.id, Date.now() - 60_000);
  if (recentRequest) return NextResponse.json({ message: acceptedMessage });

  const reset = createPasswordResetToken(teacher.id);
  const resetUrl = new URL("/", publicUrl);
  resetUrl.searchParams.set("resetToken", reset.token);
  try {
    await sendPasswordResetEmail({
      to: teacher.email,
      teacherName: teacher.name,
      resetUrl: resetUrl.toString(),
    });
  } catch (error) {
    database.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?")
      .run(sessionTokenHash(reset.token));
    console.error("No se pudo enviar el correo de recuperación de Nexo Lab.", error);
  }
  return NextResponse.json({ message: acceptedMessage });
}
