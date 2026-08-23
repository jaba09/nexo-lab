import { NextResponse } from "next/server";
import { consumePasswordResetToken, passwordValidationError } from "../../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "La solicitud no es válida." }, { status: 400 });
  }
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ error: "El enlace no es válido o ha caducado." }, { status: 400 });
  }
  const passwordError = passwordValidationError(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  if (!consumePasswordResetToken(token, password)) {
    return NextResponse.json({ error: "El enlace no es válido o ha caducado." }, { status: 400 });
  }
  return NextResponse.json({ message: "La contraseña se ha actualizado correctamente." });
}
