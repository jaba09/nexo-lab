import { NextResponse } from "next/server";
import {
  authenticationCookie,
  clearedAuthenticationCookie,
  createAuthenticationSession,
  deleteCurrentAuthenticationSession,
  getAuthenticatedTeacher,
  hashPassword,
  passwordValidationError,
  secureStringEqual,
  verifyPassword,
} from "../../../../lib/auth";
import { getDatabase } from "../../../../lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultBootstrapEmail = "jablasal@unizar.es";

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function GET() {
  const teacher = await getAuthenticatedTeacher();
  if (!teacher) return NextResponse.json({ error: "No hay una sesión activa." }, { status: 401 });
  return NextResponse.json({ teacher });
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "La solicitud de acceso no es válida." }, { status: 400 });
  }

  const email = normalizedEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Introduce tu correo electrónico y tu contraseña." }, { status: 400 });
  }
  if ([...password.normalize("NFKC")].length > 128) {
    return NextResponse.json({ error: "La contraseña no puede superar los 128 caracteres." }, { status: 400 });
  }

  const database = getDatabase();
  const teacher = database.prepare(`SELECT id, code, name, email, password_hash AS passwordHash
    FROM teachers WHERE email = ? COLLATE NOCASE`
  ).get(email) as (AuthenticatedTeacherRow & { passwordHash: string }) | undefined;

  if (!teacher) {
    return NextResponse.json({ error: "El correo o la contraseña no son correctos." }, { status: 401 });
  }

  if (!teacher.passwordHash) {
    const bootstrapEmail = normalizedEmail(process.env.NEXO_LAB_BOOTSTRAP_EMAIL) || defaultBootstrapEmail;
    const bootstrapPassword = process.env.NEXO_LAB_BOOTSTRAP_PASSWORD ?? "";
    if (email !== bootstrapEmail) {
      return NextResponse.json({ error: "Este usuario todavía no tiene contraseña. Solicita al administrador que la configure." }, { status: 403 });
    }
    if (!bootstrapPassword) {
      return NextResponse.json({ error: "El acceso inicial todavía no está configurado. Define NEXO_LAB_BOOTSTRAP_PASSWORD en el servidor." }, { status: 503 });
    }
    if (!secureStringEqual(password, bootstrapPassword)) {
      return NextResponse.json({ error: "El correo o la contraseña no son correctos." }, { status: 401 });
    }
    const validationError = passwordValidationError(password);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    database.prepare("UPDATE teachers SET password_hash = ? WHERE id = ? AND password_hash = ''")
      .run(hashPassword(password), teacher.id);
  } else if (!verifyPassword(password, teacher.passwordHash)) {
    return NextResponse.json({ error: "El correo o la contraseña no son correctos." }, { status: 401 });
  }

  const session = createAuthenticationSession(teacher.id);
  const response = NextResponse.json({
    teacher: { id: teacher.id, code: teacher.code, name: teacher.name, email: teacher.email },
  });
  response.cookies.set(authenticationCookie(session.token));
  return response;
}

export async function DELETE() {
  await deleteCurrentAuthenticationSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearedAuthenticationCookie());
  return response;
}

type AuthenticatedTeacherRow = {
  id: number;
  code: string;
  name: string;
  email: string;
};
