import { getAuthenticatedTeacher, readOnlyResponse, unauthorizedResponse } from "../../../../lib/auth";
import { getDatabase } from "../../../../lib/database";
import {
  importSessionAssignments,
  previewSessionAssignments,
  type SessionAssignmentConflictMode,
} from "../../../../lib/sessionAssignmentImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requestPayload(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return await request.json() as Record<string, unknown>;
  }
  const formData = await request.formData();
  const uploadedFile = formData.get("file");
  const content = uploadedFile && typeof uploadedFile === "object" && "text" in uploadedFile
    ? await (uploadedFile as Blob).text()
    : "";
  return {
    action: formData.get("action"),
    conflictMode: formData.get("conflictMode"),
    content,
  } as Record<string, unknown>;
}

function importErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo procesar el archivo CSV.";
}

export async function POST(request: Request) {
  const authenticatedTeacher = await getAuthenticatedTeacher();
  if (!authenticatedTeacher) return unauthorizedResponse();
  if (!authenticatedTeacher.isAdmin) return readOnlyResponse();
  try {
    const payload = await requestPayload(request);
    const content = typeof payload.content === "string" ? payload.content : "";
    if (!content || content.length > 2_000_000) {
      return Response.json({ error: "Selecciona un archivo CSV válido de menos de 2 MB." }, { status: 400 });
    }
    const database = getDatabase();
    const preview = previewSessionAssignments(database, content);
    if (payload.action !== "import") return Response.json(preview);

    if (preview.invalidCount) {
      return Response.json({ error: "Corrige las filas no válidas antes de importar.", ...preview }, { status: 400 });
    }
    if (preview.unmatchedCount) {
      return Response.json({ error: "Todas las filas deben corresponder a una sesión existente.", ...preview }, { status: 409 });
    }
    if (preview.unknownTeacherCodes.length) {
      return Response.json({ error: `No existen los profesores: ${preview.unknownTeacherCodes.join(", ")}.`, ...preview }, { status: 409 });
    }
    if (!preview.matchedCount) {
      return Response.json({ error: "El CSV no contiene sesiones para asignar." }, { status: 400 });
    }

    const conflictMode = payload.conflictMode;
    if (conflictMode !== "keep-existing" && conflictMode !== "overwrite-existing") {
      return Response.json({ error: "Elige qué hacer con las sesiones que ya tienen profesor asignado." }, { status: 400 });
    }
    const result = importSessionAssignments(database, content, conflictMode as SessionAssignmentConflictMode);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: importErrorMessage(error) }, { status: 400 });
  }
}
