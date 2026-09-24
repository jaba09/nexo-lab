import { getAuthenticatedTeacher, unauthorizedResponse } from "../../../../lib/auth";
import { publishDataChange } from "../../../../lib/dataEvents";
import { getDatabase } from "../../../../lib/database";
import { semesterDefinition } from "../../../../lib/semesters";
import { importStudentRoster, previewStudentRoster } from "../../../../lib/studentRosterImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo procesar el archivo CSV.";
}

export async function POST(request: Request) {
  const authenticatedTeacher = await getAuthenticatedTeacher();
  if (!authenticatedTeacher) return unauthorizedResponse();
  try {
    const formData = await request.formData();
    const subjectId = positiveInteger(formData.get("subjectId"));
    const semesterId = String(formData.get("semesterId") ?? "").trim();
    const action = String(formData.get("action") ?? "preview");
    const uploadedFile = formData.get("file");
    const content = uploadedFile && typeof uploadedFile === "object" && "text" in uploadedFile
      ? await (uploadedFile as Blob).text()
      : "";
    if (!subjectId) return Response.json({ error: "La asignatura no es válida." }, { status: 400 });
    semesterDefinition(semesterId);
    if (!content || content.length > 2_000_000) {
      return Response.json({ error: "Selecciona un archivo CSV válido de menos de 2 MB." }, { status: 400 });
    }

    const database = getDatabase();
    const subject = database.prepare("SELECT id, code, name FROM subjects WHERE id = ?").get(subjectId);
    if (!subject) return Response.json({ error: "La asignatura ya no existe." }, { status: 404 });
    if (!authenticatedTeacher.isAdmin) {
      const canEdit = database.prepare("SELECT 1 FROM subject_editors WHERE subject_id = ? AND teacher_id = ?")
        .get(subjectId, authenticatedTeacher.id);
      if (!canEdit) return Response.json({ error: "Solo puedes importar alumnado de las asignaturas que editas." }, { status: 403 });
    }

    const preview = previewStudentRoster(database, subjectId, semesterId, content);
    if (action !== "import") return Response.json(preview);
    if (preview.invalidCount) {
      return Response.json({ error: "Corrige las filas no válidas antes de importar el alumnado.", ...preview }, { status: 400 });
    }
    if (!preview.studentCount) {
      return Response.json({ error: "El CSV no contiene alumnos para importar." }, { status: 400 });
    }
    const result = importStudentRoster(database, subjectId, semesterId, content);
    publishDataChange();
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}
