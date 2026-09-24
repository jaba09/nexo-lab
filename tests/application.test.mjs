import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`Estado HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("El servidor no respondió.");
}

test("serves the web app and persists CRUD operations through its own API", async (context) => {
  const port = await availablePort();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "nexo-lab-app-"));
  const databasePath = join(temporaryDirectory, "nexo-lab.sqlite");
  const origin = `http://127.0.0.1:${port}`;
  const bootstrapEmail = "elena.martin@example.test";
  const bootstrapPassword = "Clave inicial segura 2026";
  let sessionCookie = "";
  async function fetch(input, init = {}) {
    const headers = new Headers(init.headers);
    if (sessionCookie) headers.set("cookie", sessionCookie);
    return globalThis.fetch(input, { ...init, headers });
  }
  const server = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NEXO_LAB_DB_PATH: databasePath,
      NEXO_LAB_BOOTSTRAP_EMAIL: bootstrapEmail,
      NEXO_LAB_BOOTSTRAP_PASSWORD: bootstrapPassword,
      NEXO_LAB_APP_VERSION: "test-deployment-2026",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  context.after(() => server.kill("SIGTERM"));
  const pageResponse = await waitForServer(origin);
  const html = await pageResponse.text();
  assert.match(html, /Nexo Lab — Gestión de laboratorios docentes/);
  assert.match(html, /Comprobando el acceso/);
  assert.match(html, /test-deployment-2026/);

  const versionResponse = await fetch(`${origin}/api/version`);
  assert.equal(versionResponse.status, 200);
  assert.match(versionResponse.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await versionResponse.json(), { version: "test-deployment-2026" });

  const unauthorizedDataResponse = await fetch(`${origin}/api/data`);
  assert.equal(unauthorizedDataResponse.status, 401);
  assert.equal((await fetch(`${origin}/api/notifications`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "read-all" }),
  })).status, 401);
  assert.equal((await fetch(`${origin}/api/pizarra`)).status, 401);
  assert.equal((await fetch(`${origin}/api/attendance`)).status, 401);
  assert.equal((await fetch(`${origin}/api/import/student-roster`, { method: "POST" })).status, 401);
  const unauthorizedEventsResponse = await fetch(`${origin}/api/events`);
  assert.equal(unauthorizedEventsResponse.status, 401);

  const unauthorizedHelpResponse = await fetch(`${origin}/ayuda`, { redirect: "manual" });
  assert.equal(unauthorizedHelpResponse.status, 307);
  assert.equal(new URL(unauthorizedHelpResponse.headers.get("location"), origin).pathname, "/");

  const wrongLoginResponse = await fetch(`${origin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: bootstrapEmail, password: "contraseña incorrecta" }),
  });
  assert.equal(wrongLoginResponse.status, 401);

  const loginResponse = await fetch(`${origin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: bootstrapEmail, password: bootstrapPassword }),
  });
  assert.equal(loginResponse.status, 200);
  sessionCookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  assert.match(sessionCookie, /^nexo_lab_session=/);
  const loginPayload = await loginResponse.json();
  assert.equal(loginPayload.teacher.email, bootstrapEmail);
  assert.equal(loginPayload.teacher.isAdmin, true);
  const authenticatedSessionResponse = await fetch(`${origin}/api/auth/session`);
  assert.equal(authenticatedSessionResponse.status, 200);
  assert.equal((await authenticatedSessionResponse.json()).teacher.isAdmin, true);

  const helpResponse = await fetch(`${origin}/ayuda`);
  assert.equal(helpResponse.status, 200);
  const helpHtml = await helpResponse.text();
  assert.match(helpHtml, /Manual de uso/);
  assert.match(helpHtml, /Todo lo necesario para organizar/);
  assert.match(helpHtml, /Administrador/);

  const initialData = await (await fetch(`${origin}/api/data`)).json();
  const anotherTeachersSession = initialData.sessions.find((session) => session.teacherId && session.teacherId !== loginPayload.teacher.id);
  assert.ok(anotherTeachersSession);
  const forbiddenAttendanceResponse = await fetch(`${origin}/api/attendance?sessionId=${anotherTeachersSession.id}`);
  assert.equal(forbiddenAttendanceResponse.status, 404);
  assert.match((await forbiddenAttendanceResponse.json()).error, /no está asignada a tu usuario/i);
  const pizarraResponse = await fetch(`${origin}/api/pizarra`);
  assert.equal(pizarraResponse.status, 200);
  assert.match(pizarraResponse.headers.get("cache-control"), /private, no-store/);
  const pizarraData = await pizarraResponse.json();
  assert.ok(pizarraData.classes.length > 0);
  assert.ok(pizarraData.classes.every((item) => ["CM", "Prob_casos"].includes(item.teachingType)));
  assert.deepEqual((await (await fetch(`${origin}/api/data`)).json()).sessions, initialData.sessions);
  assert.ok(initialData.laboratories[0].editVersion);
  assert.ok(initialData.sessions[0].editVersion);
  const eventAbort = new AbortController();
  const eventsResponse = await fetch(`${origin}/api/events`, { signal: eventAbort.signal });
  assert.equal(eventsResponse.status, 200);
  assert.match(eventsResponse.headers.get("content-type") ?? "", /text\/event-stream/);
  const eventReader = eventsResponse.body.getReader();
  assert.match(new TextDecoder().decode((await eventReader.read()).value), /connected/);
  assert.equal(initialData.laboratories.length, 3);
  assert.equal(initialData.installations.length, 4);
  assert.ok(initialData.installations.every((installation) => installation.materialsDescription === ""));
  assert.equal(initialData.practices.length, 5);
  assert.ok(initialData.practices.every((practice) => !Object.hasOwn(practice, "riskLevel")));
  assert.deepEqual(
    initialData.practices.map((practice) => practice.name),
    [...initialData.practices.map((practice) => practice.name)].sort((left, right) => (
      left.localeCompare(right, "es", { sensitivity: "base" })
    )),
  );
  assert.equal(initialData.degrees.length, 3);
  assert.ok(initialData.degrees.every((degree) => degree.icsCode === ""));
  assert.equal(initialData.subjects.length, 4);
  assert.ok(initialData.subjects.every((subject) => subject.abbreviation === ""));
  assert.deepEqual(initialData.studentRosters, []);
  assert.equal(initialData.teachers.length, 3);
  assert.deepEqual(initialData.teachers.map((teacher) => teacher.email).sort(), [
    "ana.beltran@example.test",
    "elena.martin@example.test",
    "sergio.lozano@example.test",
  ]);
  assert.ok(initialData.teachers.every((teacher) => !("passwordHash" in teacher) && !("password_hash" in teacher)));
  assert.equal(initialData.teachers.find((teacher) => teacher.email === bootstrapEmail).isAdmin, true);
  assert.ok(initialData.teachers.filter((teacher) => teacher.email !== bootstrapEmail).every((teacher) => teacher.isAdmin === false));
  assert.ok(initialData.teachers.every((teacher) => teacher.isLabStaff === false));
  assert.deepEqual(initialData.notifications, []);
  assert.deepEqual(
    initialData.teachers.map((teacher) => teacher.name),
    [...initialData.teachers.map((teacher) => teacher.name)].sort((left, right) => (
      left.replace(/^(?:\p{L}\.)+\s*/u, "").localeCompare(right.replace(/^(?:\p{L}\.)+\s*/u, ""), "es", { sensitivity: "base" })
      || left.localeCompare(right, "es", { sensitivity: "base" })
    )),
  );
  assert.deepEqual(initialData.preferences, { calendarStartHour: 8, calendarEndHour: 19 });
  const invalidPreferencesResponse = await fetch(`${origin}/api/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendarStartHour: 18, calendarEndHour: 8 }),
  });
  assert.equal(invalidPreferencesResponse.status, 400);
  const updatePreferencesResponse = await fetch(`${origin}/api/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendarStartHour: 7, calendarEndHour: 20 }),
  });
  assert.equal(updatePreferencesResponse.status, 200);
  assert.deepEqual((await updatePreferencesResponse.json()).preferences, { calendarStartHour: 7, calendarEndHour: 20 });
  const eventTimeout = setTimeout(() => eventAbort.abort(), 5000);
  const changeEvent = await eventReader.read();
  clearTimeout(eventTimeout);
  assert.match(new TextDecoder().decode(changeEvent.value), /event: data-changed/);
  eventAbort.abort();
  assert.deepEqual((await (await fetch(`${origin}/api/data`)).json()).preferences, { calendarStartHour: 7, calendarEndHour: 20 });
  const restorePreferencesResponse = await fetch(`${origin}/api/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendarStartHour: 8, calendarEndHour: 19 }),
  });
  assert.equal(restorePreferencesResponse.status, 200);
  assert.equal(initialData.sessions.length, 4);
  assert.equal(initialData.sessions.find((session) => session.subjectId === 1 && session.practiceId === 1).practiceOrder, 1);
  assert.deepEqual(
    initialData.sessions.find((session) => session.subjectId === 1).degreePracticeIds.sort((left, right) => left - right),
    [1, 2, 5],
  );
  assert.equal(initialData.holidays.length, 0);
  assert.equal(initialData.academicDayTypes.length, 120);
  assert.deepEqual(
    initialData.academicDayTypes.find((item) => item.date === "2026-11-10"),
    { date: "2026-11-10", dayType: "B" },
  );
  assert.deepEqual(
    initialData.academicDayTypes.find((item) => item.date === "2027-03-08"),
    { date: "2027-03-08", dayType: "A" },
  );

  const studentRosterCsv = `\uFEFFNombre,Apellido(s),"Dirección de correo",Grupos
Lorena,"Abad Sanz",924740@unizar.es,"G32 - Lunes-B 11:00-13:00"
Clara,"Agustín Sanz",868411@unizar.es,
Alumno,"Un grupo",999999@unizar.es,"G22 - Martes-B 09:00-11:00"
`;
  function studentRosterFormData(subjectId, action = "preview") {
    const formData = new FormData();
    formData.append("action", action);
    formData.append("subjectId", String(subjectId));
    formData.append("semesterId", "2026-27 S1");
    formData.append("file", new Blob([studentRosterCsv], { type: "text/csv" }), "alumnado.csv");
    return formData;
  }
  const studentRosterPreviewResponse = await fetch(`${origin}/api/import/student-roster`, {
    method: "POST",
    body: studentRosterFormData(1),
  });
  assert.equal(studentRosterPreviewResponse.status, 200);
  const studentRosterPreview = await studentRosterPreviewResponse.json();
  assert.equal(studentRosterPreview.studentCount, 3);
  assert.equal(studentRosterPreview.subgroupCount, 2);
  assert.equal(studentRosterPreview.unassignedStudentCount, 1);
  const studentRosterImportResponse = await fetch(`${origin}/api/import/student-roster`, {
    method: "POST",
    body: studentRosterFormData(1, "import"),
  });
  assert.equal(studentRosterImportResponse.status, 200);
  const studentRosterImport = await studentRosterImportResponse.json();
  assert.equal(studentRosterImport.studentCount, 3);
  assert.equal(studentRosterImport.replacedStudentCount, 0);
  const dataWithStudentRoster = await (await fetch(`${origin}/api/data`)).json();
  assert.deepEqual(dataWithStudentRoster.studentRosters, [{
    subjectId: 1,
    semesterId: "2026-27 S1",
    studentCount: 3,
    subgroupCount: 2,
  }]);

  const attendanceDatabase = new DatabaseSync(databasePath);
  const attendanceSessionResult = attendanceDatabase.prepare(`INSERT INTO sessions
    (session_date, start_time, duration, subject_id, teacher_id, practice_id, source_uid, subject_code, group_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("2026-12-15", "09:00", 120, 1, 1, 1, "attendance-test", "ASI-01", "32");
  const attendanceSessionId = Number(attendanceSessionResult.lastInsertRowid);
  attendanceDatabase.close();

  const attendanceSessionsResponse = await fetch(`${origin}/api/attendance`);
  assert.equal(attendanceSessionsResponse.status, 200);
  assert.match(attendanceSessionsResponse.headers.get("cache-control"), /private, no-store/);
  const attendanceSessions = await attendanceSessionsResponse.json();
  const attendanceSummary = attendanceSessions.sessions.find((session) => session.id === attendanceSessionId);
  assert.ok(attendanceSummary);
  assert.equal(attendanceSummary.studentCount, 1);
  assert.equal(attendanceSummary.attendedCount, 0);
  assert.equal(attendanceSummary.attendanceTaken, false);

  const attendanceDetailResponse = await fetch(`${origin}/api/attendance?sessionId=${attendanceSessionId}`);
  assert.equal(attendanceDetailResponse.status, 200);
  const attendanceDetail = await attendanceDetailResponse.json();
  assert.equal(attendanceDetail.students.length, 1);
  assert.equal(attendanceDetail.students[0].email, "924740@unizar.es");
  assert.equal(attendanceDetail.students[0].attended, false);

  const saveAttendanceResponse = await fetch(`${origin}/api/attendance`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: attendanceSessionId,
      studentIds: attendanceDetail.students.map((student) => student.id),
      attendedStudentIds: [attendanceDetail.students[0].id],
    }),
  });
  assert.equal(saveAttendanceResponse.status, 200);
  const savedAttendance = await saveAttendanceResponse.json();
  assert.equal(savedAttendance.attendanceTaken, true);
  assert.equal(savedAttendance.attendedCount, 1);
  assert.equal(savedAttendance.students[0].attended, true);

  const changedRosterResponse = await fetch(`${origin}/api/attendance`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: attendanceSessionId, studentIds: [], attendedStudentIds: [] }),
  });
  assert.equal(changedRosterResponse.status, 409);
  assert.match((await changedRosterResponse.json()).error, /lista de alumnos ha cambiado/i);

  const savedAttendanceDatabase = new DatabaseSync(databasePath);
  assert.deepEqual(
    savedAttendanceDatabase.prepare(`SELECT session_id AS sessionId, student_id AS studentId,
      attended, marked_by_teacher_id AS markedByTeacherId
      FROM session_attendance WHERE session_id = ?`).all(attendanceSessionId).map((row) => ({ ...row })),
    [{ sessionId: attendanceSessionId, studentId: attendanceDetail.students[0].id, attended: 1, markedByTeacherId: 1 }],
  );
  savedAttendanceDatabase.prepare("DELETE FROM sessions WHERE id = ?").run(attendanceSessionId);
  assert.equal(savedAttendanceDatabase.prepare("SELECT COUNT(*) AS total FROM session_attendance WHERE session_id = ?").get(attendanceSessionId).total, 0);
  savedAttendanceDatabase.close();

  const assignmentSession = initialData.sessions[0];
  const originalAssignmentTeacher = initialData.teachers.find((teacher) => teacher.id === assignmentSession.teacherId);
  const importedAssignmentTeacher = initialData.teachers.find((teacher) => teacher.id !== assignmentSession.teacherId);
  assert.ok(originalAssignmentTeacher && importedAssignmentTeacher);
  function assignmentCsv(teacherCode, duration = assignmentSession.duration + 1) {
    return `codigo,fecha,hora_ini,duracion,siglas\n${assignmentSession.subjectCode},${assignmentSession.sessionDate},${assignmentSession.startTime},${duration},${teacherCode}\n`;
  }
  function assignmentFormData(action, teacherCode, conflictMode) {
    const formData = new FormData();
    formData.append("action", action);
    if (conflictMode) formData.append("conflictMode", conflictMode);
    formData.append("file", new Blob([assignmentCsv(teacherCode)], { type: "text/csv" }), "asignaciones.csv");
    return formData;
  }

  const assignmentPreviewResponse = await fetch(`${origin}/api/import/session-assignments`, {
    method: "POST",
    body: assignmentFormData("preview", importedAssignmentTeacher.code),
  });
  assert.equal(assignmentPreviewResponse.status, 200);
  const assignmentPreview = await assignmentPreviewResponse.json();
  assert.equal(assignmentPreview.totalRows, 1);
  assert.equal(assignmentPreview.matchedCount, 1);
  assert.equal(assignmentPreview.alreadyAssignedCount, 1);
  assert.equal(assignmentPreview.conflictingAssignmentCount, 1);
  assert.equal(assignmentPreview.durationMismatchCount, 1);

  const assignmentWithoutDecisionResponse = await fetch(`${origin}/api/import/session-assignments`, {
    method: "POST",
    body: assignmentFormData("import", importedAssignmentTeacher.code),
  });
  assert.equal(assignmentWithoutDecisionResponse.status, 400);
  assert.match((await assignmentWithoutDecisionResponse.json()).error, /Elige qué hacer/);

  const keepAssignmentResponse = await fetch(`${origin}/api/import/session-assignments`, {
    method: "POST",
    body: assignmentFormData("import", importedAssignmentTeacher.code, "keep-existing"),
  });
  assert.equal(keepAssignmentResponse.status, 200);
  assert.deepEqual(await keepAssignmentResponse.json(), {
    matchedCount: 1,
    updatedCount: 0,
    assignedCount: 0,
    clearedCount: 0,
    preservedCount: 1,
    unchangedCount: 0,
    durationMismatchCount: 1,
  });

  const overwriteAssignmentResponse = await fetch(`${origin}/api/import/session-assignments`, {
    method: "POST",
    body: assignmentFormData("import", importedAssignmentTeacher.code, "overwrite-existing"),
  });
  assert.equal(overwriteAssignmentResponse.status, 200);
  assert.equal((await overwriteAssignmentResponse.json()).updatedCount, 1);
  const dataWithImportedAssignment = await (await fetch(`${origin}/api/data`)).json();
  assert.equal(
    dataWithImportedAssignment.sessions.find((session) => session.id === assignmentSession.id).teacherId,
    importedAssignmentTeacher.id,
  );

  const restoreAssignmentResponse = await fetch(`${origin}/api/import/session-assignments`, {
    method: "POST",
    body: assignmentFormData("import", originalAssignmentTeacher.code, "overwrite-existing"),
  });
  assert.equal(restoreAssignmentResponse.status, 200);

  const protectedSubjectResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "subjects",
      id: 1,
      code: "ASI-01",
      name: "Mecánica de materiales",
      degreeId: 1,
      practiceIds: [2, 4],
    }),
  });
  assert.equal(protectedSubjectResponse.status, 409);
  const protectedSubjectError = await protectedSubjectResponse.json();
  assert.match(protectedSubjectError.error, /sesiones programadas/);
  assert.match(protectedSubjectError.error, /Primero cambia la práctica de esas sesiones/);

  const updates = [
    {
      entity: "laboratories",
      id: 1,
      code: "LAB-01A",
      name: "Materiales avanzados",
      location: "Edificio Norte · Planta 3",
    },
    {
      entity: "installations",
      id: 1,
      code: "INS-01A",
      name: "Banco universal renovado",
      laboratoryId: 2,
      category: "Docente",
      capacity: 20,
      status: "Planificada",
      materialsDescription: "Probetas normalizadas, mordazas y gafas de protección.",
    },
    {
      entity: "practices",
      id: 1,
      code: "PRA-01A",
      name: "Ensayo avanzado de tracción",
      installationIds: [3, 4],
      duration: 150,
    },
    {
      entity: "degrees",
      id: 1,
      code: "GRA-01A",
      name: "Ingeniería Mecánica actualizada",
      level: "Máster",
      icsCode: "101",
    },
    {
      entity: "subjects",
      id: 1,
      code: "ASI-01A",
      abbreviation: "mma",
      name: "Mecánica de materiales avanzada",
      degreeId: 1,
      practiceIds: [4, 2, 1],
    },
    {
      entity: "teachers",
      id: 1,
      code: "PRO-01A",
      name: "Dra. Elena Martín actualizada",
      email: "Elena.Martin@Universidad.es",
      isAdmin: true,
      isLabStaff: true,
    },
  ];

  const entityEventAbort = new AbortController();
  const entityEventsResponse = await fetch(`${origin}/api/events`, { signal: entityEventAbort.signal });
  assert.equal(entityEventsResponse.status, 200);
  const entityEventReader = entityEventsResponse.body.getReader();
  assert.match(new TextDecoder().decode((await entityEventReader.read()).value), /connected/);

  for (const update of updates) {
    const updateResponse = await fetch(`${origin}/api/data`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...update,
        expectedVersion: initialData[update.entity].find((item) => item.id === update.id).editVersion,
      }),
    });
    assert.equal(updateResponse.status, 200, `No se pudo editar ${update.entity}`);
    if (update.entity === "laboratories") {
      const timeout = setTimeout(() => entityEventAbort.abort(), 5000);
      const entityChangeEvent = await entityEventReader.read();
      clearTimeout(timeout);
      assert.match(new TextDecoder().decode(entityChangeEvent.value), /event: data-changed/);
      entityEventAbort.abort();
    }
  }

  const staleLaboratoryResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "laboratories", id: 1, code: "LAB-01A", name: "Edición antigua",
      location: "Edificio Norte · Planta 3", expectedVersion: initialData.laboratories[0].editVersion,
    }),
  });
  assert.equal(staleLaboratoryResponse.status, 409);
  assert.equal((await staleLaboratoryResponse.json()).code, "STALE_RECORD");

  const editedData = await (await fetch(`${origin}/api/data`)).json();
  const editedLaboratory = editedData.laboratories.find((laboratory) => laboratory.id === 1);
  assert.equal(editedLaboratory.name, "Materiales avanzados");
  const editedInstallation = editedData.installations.find((installation) => installation.id === 1);
  const editedPractice = editedData.practices.find((practice) => practice.id === 1);
  const editedDegree = editedData.degrees.find((degree) => degree.id === 1);
  const editedSubject = editedData.subjects.find((subject) => subject.id === 1);
  const editedTeacher = editedData.teachers.find((teacher) => teacher.id === 1);
  assert.equal(editedLaboratory.code, "LAB-01A");
  assert.equal(editedLaboratory.location, "Edificio Norte · Planta 3");
  assert.equal(Object.hasOwn(editedLaboratory, "manager"), false);
  const legacyLaboratoryDatabase = new DatabaseSync(databasePath);
  assert.equal(legacyLaboratoryDatabase.prepare("SELECT manager FROM laboratories WHERE id = 1").get().manager, "Dra. Elena Martín");
  legacyLaboratoryDatabase.close();
  assert.equal(editedInstallation.laboratoryId, 2);
  assert.equal(editedInstallation.status, "Planificada");
  assert.equal(editedInstallation.materialsDescription, "Probetas normalizadas, mordazas y gafas de protección.");
  assert.deepEqual(editedPractice.installationIds, [3, 4]);
  assert.equal(editedPractice.installationCount, 2);
  assert.equal(Object.hasOwn(editedPractice, "riskLevel"), false);
  const legacyPracticeDatabase = new DatabaseSync(databasePath);
  assert.equal(legacyPracticeDatabase.prepare("SELECT risk_level FROM practices WHERE id = 1").get().risk_level, "Medio");
  legacyPracticeDatabase.close();
  assert.equal(editedDegree.level, "Máster");
  assert.equal(editedDegree.icsCode, "101");
  assert.equal(editedSubject.degreeCode, "GRA-01A");
  assert.equal(editedSubject.abbreviation, "MMA");
  assert.deepEqual(editedSubject.practiceIds, [4, 2, 1]);
  assert.deepEqual(editedSubject.practiceCodes, ["PRA-04", "PRA-02", "PRA-01A"]);
  assert.equal(editedData.sessions.find((session) => session.subjectId === 1 && session.practiceId === 1).practiceOrder, 3);
  assert.equal(editedTeacher.code, "PRO-01A");
  assert.equal(editedTeacher.name, "Dra. Elena Martín actualizada");
  assert.equal(editedTeacher.email, "elena.martin@universidad.es");
  assert.equal(editedTeacher.isAdmin, true);
  assert.equal(editedTeacher.isLabStaff, true);

  const removeLastAdministratorResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "teachers",
      id: editedTeacher.id,
      code: editedTeacher.code,
      name: editedTeacher.name,
      email: editedTeacher.email,
      isAdmin: false,
    }),
  });
  assert.equal(removeLastAdministratorResponse.status, 409);
  assert.match((await removeLastAdministratorResponse.json()).error, /al menos un profesor administrador/);

  const incompatibleSessionResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      sessionDate: "2099-09-17",
      startTime: "13:45",
      duration: 90,
      subjectId: 3,
      teacherId: 1,
      practiceId: 2,
    }),
  });
  assert.equal(incompatibleSessionResponse.status, 409);

  const createSessionResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      sessionDate: "2099-09-17",
      startTime: "13:45",
      duration: 90,
      subjectId: 1,
      teacherId: 1,
      practiceId: 4,
    }),
  });
  assert.equal(createSessionResponse.status, 201);

  const dataWithSession = await (await fetch(`${origin}/api/data`)).json();
  const createdSession = dataWithSession.sessions.find((session) => session.sessionDate === "2099-09-17");
  assert.ok(createdSession);
  assert.equal(createdSession.degreeCode, "GRA-01A");
  assert.equal(createdSession.subjectCode, "ASI-01A");
  assert.equal(createdSession.subjectAbbreviation, "MMA");
  assert.equal(createdSession.teacherCode, "PRO-01A");
  assert.equal(createdSession.practiceCode, "PRA-04");
  assert.deepEqual(createdSession.degreePracticeIds.sort((left, right) => left - right), [1, 2, 4]);
  assert.equal(dataWithSession.notifications.length, 1);
  assert.equal(dataWithSession.notifications[0].eventType, "session-created");
  assert.equal(dataWithSession.notifications[0].sessionId, createdSession.id);
  assert.equal(dataWithSession.notifications[0].readAt, null);
  assert.match(dataWithSession.notifications[0].message, /ASI-01A/);
  const notificationDatabase = new DatabaseSync(databasePath);
  assert.equal(notificationDatabase.prepare("SELECT COUNT(*) AS total FROM notifications").get().total, 1);
  assert.equal(notificationDatabase.prepare("SELECT recipient_teacher_id AS recipientTeacherId FROM notifications").get().recipientTeacherId, editedTeacher.id);
  notificationDatabase.close();
  const createdNotificationId = dataWithSession.notifications[0].id;
  const readNotificationResponse = await fetch(`${origin}/api/notifications`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "read", id: createdNotificationId }),
  });
  assert.equal(readNotificationResponse.status, 200);
  assert.equal((await readNotificationResponse.json()).updatedCount, 1);
  assert.ok((await (await fetch(`${origin}/api/data`)).json()).notifications.find((notification) => notification.id === createdNotificationId).readAt);

  const createOverlapCandidateResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      sessionDate: "2099-09-17",
      startTime: "14:00",
      duration: 60,
      subjectId: 1,
      teacherId: 2,
      practiceId: 2,
    }),
  });
  assert.equal(createOverlapCandidateResponse.status, 201);
  const overlapCandidate = (await (await fetch(`${origin}/api/data`)).json()).sessions
    .find((session) => session.sessionDate === "2099-09-17" && session.startTime === "14:00");
  assert.ok(overlapCandidate);

  const overlappingTeacherResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      action: "assign-teacher",
      ids: [overlapCandidate.id],
      teacherId: 1,
    }),
  });
  assert.equal(overlappingTeacherResponse.status, 409);
  assert.match((await overlappingTeacherResponse.json()).error, /profesor.*sesiones superpuestas/i);

  const overlappingInstallationResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      ids: [overlapCandidate.id],
      practiceId: 4,
    }),
  });
  assert.equal(overlappingInstallationResponse.status, 409);
  assert.match((await overlappingInstallationResponse.json()).error, /instalación.*sesiones superpuestas/i);

  const unchangedOverlapCandidate = (await (await fetch(`${origin}/api/data`)).json()).sessions
    .find((session) => session.id === overlapCandidate.id);
  assert.equal(unchangedOverlapCandidate.teacherId, 2);
  assert.equal(unchangedOverlapCandidate.practiceId, 2);

  const deleteOverlapCandidateResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "sessions", id: overlapCandidate.id }),
  });
  assert.equal(deleteOverlapCandidateResponse.status, 200);

  const editSessionResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      id: createdSession.id,
      expectedVersion: createdSession.editVersion,
      sessionDate: "2099-09-18",
      startTime: "14:15",
      duration: 999,
      subjectId: 3,
      teacherId: 2,
      practiceId: 3,
    }),
  });
  assert.equal(editSessionResponse.status, 200);

  const staleSessionResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions", id: createdSession.id, expectedVersion: createdSession.editVersion,
      sessionDate: "2099-09-18", startTime: "15:00", duration: 120,
      subjectId: 3, teacherId: 2, practiceId: 3,
    }),
  });
  assert.equal(staleSessionResponse.status, 409);
  assert.equal((await staleSessionResponse.json()).code, "STALE_RECORD");

  const staleMoveResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions", action: "move", id: createdSession.id,
      sessionDate: "2099-09-19", startTime: "16:30", expectedVersion: createdSession.editVersion,
    }),
  });
  assert.equal(staleMoveResponse.status, 409);
  assert.equal((await staleMoveResponse.json()).code, "STALE_RECORD");

  const editedSessionData = await (await fetch(`${origin}/api/data`)).json();
  const editedSession = editedSessionData.sessions.find((session) => session.id === createdSession.id);
  assert.equal(editedSession.sessionDate, "2099-09-18");
  assert.equal(editedSession.startTime, "14:15");
  assert.equal(editedSession.duration, 120);
  assert.equal(editedSession.degreeCode, "GRA-02");
  assert.equal(editedSession.subjectCode, "ASI-03");
  assert.equal(editedSession.teacherCode, "PRO-02");
  assert.equal(editedSession.practiceCode, "PRA-03");
  assert.equal(editedSessionData.notifications[0].eventType, "session-updated");
  assert.equal(editedSessionData.notifications[0].sessionId, editedSession.id);
  assert.equal(editedSessionData.notifications[0].readAt, null);

  const moveSessionResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      action: "move",
      id: createdSession.id,
      sessionDate: "2099-09-19",
      startTime: "16:30",
      expectedVersion: editedSession.editVersion,
    }),
  });
  assert.equal(moveSessionResponse.status, 200);

  const movedSessionData = await (await fetch(`${origin}/api/data`)).json();
  const movedSession = movedSessionData.sessions.find((session) => session.id === createdSession.id);
  assert.equal(movedSession.sessionDate, "2099-09-19");
  assert.equal(movedSession.startTime, "16:30");
  assert.equal(movedSession.duration, 120);
  assert.equal(movedSession.practiceCode, "PRA-03");

  const deleteSessionResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "sessions", id: createdSession.id }),
  });
  assert.equal(deleteSessionResponse.status, 200);

  const icsContent = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:integration-lab-session\r
SUMMARY:30013 - Mecánica de fluidos Grupo: 36 - Prácticas de laboratorio\r
DTSTART:20261001T090000Z\r
DTEND:20261001T120000Z\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:integration-lecture\r
SUMMARY:30013 - Mecánica de fluidos Grupo: 823 - Clase Magistral\r
DTSTART:20261104T150000Z\r
DTEND:20261104T170000Z\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:integration-holiday\r
SUMMARY:Día festivo - \r
DTSTART:20261208T070000Z\r
DTEND:20261208T190000Z\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:integration-holiday-session\r
SUMMARY:30013 - Mecánica de fluidos Grupo: 18 - Prácticas de laboratorio\r
DTSTART:20261208T100000Z\r
DTEND:20261208T130000Z\r
END:VEVENT\r
END:VCALENDAR\r
`;
  function icsFormData(action, mappings) {
    const formData = new FormData();
    formData.append("action", action);
    formData.append("file", new Blob([icsContent], { type: "text/calendar" }), "calendar.ics");
    if (mappings) formData.append("mappings", JSON.stringify(mappings));
    return formData;
  }
  const previewIcsResponse = await fetch(`${origin}/api/import/ics`, {
    method: "POST",
    body: icsFormData("preview"),
  });
  assert.equal(previewIcsResponse.status, 200);
  const icsPreview = await previewIcsResponse.json();
  assert.equal(icsPreview.eligibleCount, 1);
  assert.equal(icsPreview.holidayCount, 1);
  assert.equal(icsPreview.holidayConflictCount, 1);
  assert.equal(icsPreview.ignoredCount, 1);
  assert.equal(icsPreview.groups[0].degreeCode, "300");
  assert.equal(icsPreview.groups[0].subjectCode, "30013");
  assert.deepEqual(icsPreview.groups[0].groupCodes, ["36"]);
  assert.equal(icsPreview.groups[0].existingSubjectId, null);
  assert.equal(icsPreview.groups[0].existingDegreeId, null);

  const icsMappings = [{ degreeCode: "300", subjectCode: "30013", teacherId: null }];
  const importIcsResponse = await fetch(`${origin}/api/import/ics`, {
    method: "POST",
    body: icsFormData("import", icsMappings),
  });
  assert.equal(importIcsResponse.status, 200);
  const importIcsResult = await importIcsResponse.json();
  assert.equal(importIcsResult.importedCount, 1);
  assert.equal(importIcsResult.importedHolidayCount, 1);
  assert.equal(importIcsResult.existingHolidayCount, 0);
  assert.equal(importIcsResult.holidayConflictCount, 1);
  assert.equal(importIcsResult.createdSubjectCount, 1);
  assert.equal(importIcsResult.createdDegreeCount, 1);

  const duplicateImportResponse = await fetch(`${origin}/api/import/ics`, {
    method: "POST",
    body: icsFormData("import", icsMappings),
  });
  const duplicateImport = await duplicateImportResponse.json();
  assert.equal(duplicateImportResponse.status, 200);
  assert.equal(duplicateImport.importedCount, 0);
  assert.equal(duplicateImport.existingCount, 1);
  assert.equal(duplicateImport.importedHolidayCount, 0);
  assert.equal(duplicateImport.existingHolidayCount, 1);
  assert.equal(duplicateImport.holidayConflictCount, 1);
  assert.equal(duplicateImport.createdSubjectCount, 0);
  assert.equal(duplicateImport.createdDegreeCount, 0);

  const createResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "laboratories",
      code: "LAB-99",
      name: "Laboratorio temporal",
      location: "Pruebas",
    }),
  });
  assert.equal(createResponse.status, 201);

  const updatedData = await (await fetch(`${origin}/api/data`)).json();
  assert.equal(updatedData.laboratories.length, 4);
  const createdLaboratory = updatedData.laboratories.find((laboratory) => laboratory.code === "LAB-99");
  assert.ok(createdLaboratory);
  assert.equal(Object.hasOwn(createdLaboratory, "manager"), false);
  const newLaboratoryDatabase = new DatabaseSync(databasePath);
  assert.equal(newLaboratoryDatabase.prepare("SELECT manager FROM laboratories WHERE id = ?").get(createdLaboratory.id).manager, "");
  newLaboratoryDatabase.close();

  const deleteResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "laboratories", id: createdLaboratory.id }),
  });
  assert.equal(deleteResponse.status, 200);

  const createAdministratorPracticeResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "practices",
      code: "PRA-ADMIN",
      name: "Práctica independiente creada por administrador",
      subjectId: initialData.subjects[0].id,
      installationIds: [initialData.installations[0].id],
      duration: 120,
    }),
  });
  assert.equal(createAdministratorPracticeResponse.status, 201);
  const dataWithAdministratorPractice = await (await fetch(`${origin}/api/data`)).json();
  const administratorPractice = dataWithAdministratorPractice.practices.find((practice) => practice.code === "PRA-ADMIN");
  assert.ok(administratorPractice);
  assert.equal(administratorPractice.subjectCount, 0);
  assert.equal(Object.hasOwn(administratorPractice, "riskLevel"), false);
  const newPracticeDatabase = new DatabaseSync(databasePath);
  assert.equal(newPracticeDatabase.prepare("SELECT risk_level FROM practices WHERE id = ?").get(administratorPractice.id).risk_level, "");
  newPracticeDatabase.close();
  assert.ok(dataWithAdministratorPractice.subjects.every((subject) => !subject.practiceIds.includes(administratorPractice.id)));
  const deleteAdministratorPracticeResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "practices", id: administratorPractice.id }),
  });
  assert.equal(deleteAdministratorPracticeResponse.status, 200);

  const invalidTeacherEmailResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "teachers", code: "PRO-BAD", name: "Correo no válido", email: "correo-invalido" }),
  });
  assert.equal(invalidTeacherEmailResponse.status, 400);

  const shortTeacherPasswordResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "teachers", code: "PRO-SHORT", name: "Clave corta", email: "corta@universidad.es", password: "muy-corta" }),
  });
  assert.equal(shortTeacherPasswordResponse.status, 400);
  assert.match((await shortTeacherPasswordResponse.json()).error, /12 caracteres/);

  const createTeacherResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "teachers", code: "PRO-99", name: "Profesor temporal", email: "temporal@universidad.es", password: "Contraseña temporal 2026" }),
  });
  assert.equal(createTeacherResponse.status, 201);
  const dataWithTemporaryTeacher = await (await fetch(`${origin}/api/data`)).json();
  const temporaryTeacher = dataWithTemporaryTeacher.teachers.find((teacher) => teacher.code === "PRO-99");
  assert.ok(temporaryTeacher);
  assert.equal(temporaryTeacher.email, "temporal@universidad.es");
  assert.equal(temporaryTeacher.isAdmin, false);
  assert.equal(temporaryTeacher.isLabStaff, false);
  const subjectForEditor = dataWithTemporaryTeacher.subjects.find((subject) => subject.id === 1);
  const grantSubjectEditorResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "subjects",
      id: subjectForEditor.id,
      code: subjectForEditor.code,
      abbreviation: subjectForEditor.abbreviation,
      name: subjectForEditor.name,
      degreeId: subjectForEditor.degreeId,
      practiceIds: subjectForEditor.practiceIds,
      editorIds: [temporaryTeacher.id],
    }),
  });
  assert.equal(grantSubjectEditorResponse.status, 200);
  const dataWithSubjectEditor = await (await fetch(`${origin}/api/data`)).json();
  assert.deepEqual(dataWithSubjectEditor.subjects.find((subject) => subject.id === 1).editorIds, [temporaryTeacher.id]);
  assert.deepEqual(dataWithSubjectEditor.subjects.find((subject) => subject.id === 1).editorCodes, [temporaryTeacher.code]);
  const administratorCookie = sessionCookie;
  const temporaryTeacherLogin = await fetch(`${origin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: temporaryTeacher.email, password: "Contraseña temporal 2026" }),
  });
  assert.equal(temporaryTeacherLogin.status, 200);
  sessionCookie = temporaryTeacherLogin.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  const temporaryTeacherSession = await (await fetch(`${origin}/api/auth/session`)).json();
  assert.equal(temporaryTeacherSession.teacher.id, temporaryTeacher.id);
  assert.equal(temporaryTeacherSession.teacher.isAdmin, false);
  const nonAdminMessageResponse = await fetch(`${origin}/api/messages/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(nonAdminMessageResponse.status, 400);
  assert.match((await nonAdminMessageResponse.json()).error, /grupo de destinatarios válido/);
  const readOnlyDataResponse = await fetch(`${origin}/api/data`);
  assert.equal(readOnlyDataResponse.status, 200);
  assert.equal((await fetch(`${origin}/api/pizarra`)).status, 200);
  const editorData = await readOnlyDataResponse.json();
  assert.deepEqual(editorData.editableSubjectIds, [subjectForEditor.id]);
  assert.deepEqual(editorData.notifications, []);
  assert.equal((await fetch(`${origin}/api/import/student-roster`, {
    method: "POST",
    body: studentRosterFormData(subjectForEditor.id),
  })).status, 200);
  const forbiddenRosterImportResponse = await fetch(`${origin}/api/import/student-roster`, {
    method: "POST",
    body: studentRosterFormData(3),
  });
  assert.equal(forbiddenRosterImportResponse.status, 403);
  const cannotReadOtherNotificationResponse = await fetch(`${origin}/api/notifications`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "read", id: createdNotificationId }),
  });
  assert.equal(cannotReadOtherNotificationResponse.status, 200);
  assert.equal((await cannotReadOtherNotificationResponse.json()).updatedCount, 0);
  const editorPreferencesResponse = await fetch(`${origin}/api/preferences`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendarStartHour: 7, calendarEndHour: 20 }),
  });
  assert.equal(editorPreferencesResponse.status, 403);

  const editorInstallationResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "installations",
      code: "INS-EDITOR",
      name: "Instalación creada por editor",
      laboratoryId: 1,
      category: "Docente",
      capacity: 12,
      status: "Operativa",
    }),
  });
  assert.equal(editorInstallationResponse.status, 201);
  const dataWithEditorInstallation = await (await fetch(`${origin}/api/data`)).json();
  const editorInstallation = dataWithEditorInstallation.installations.find((installation) => installation.code === "INS-EDITOR");
  assert.ok(editorInstallation);

  const editorPracticeResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "practices",
      code: "PRA-EDITOR",
      name: "Práctica creada por editor",
      subjectId: subjectForEditor.id,
      installationIds: [editorInstallation.id],
      duration: 120,
    }),
  });
  assert.equal(editorPracticeResponse.status, 201);
  const dataWithEditorPractice = await (await fetch(`${origin}/api/data`)).json();
  const editorPractice = dataWithEditorPractice.practices.find((practice) => practice.code === "PRA-EDITOR");
  assert.ok(editorPractice);
  assert.ok(dataWithEditorPractice.subjects.find((subject) => subject.id === subjectForEditor.id).practiceIds.includes(editorPractice.id));

  const editorSessionResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      sessionDate: "2099-10-01",
      startTime: "09:00",
      duration: 120,
      subjectId: subjectForEditor.id,
      teacherId: temporaryTeacher.id,
      practiceId: editorPractice.id,
    }),
  });
  assert.equal(editorSessionResponse.status, 201);
  const dataWithEditorSession = await (await fetch(`${origin}/api/data`)).json();
  const editorSession = dataWithEditorSession.sessions.find((session) => session.sessionDate === "2099-10-01");
  assert.ok(editorSession);

  const editorEditSessionResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      id: editorSession.id,
      sessionDate: editorSession.sessionDate,
      startTime: "10:00",
      duration: editorSession.duration,
      subjectId: editorSession.subjectId,
      teacherId: editorSession.teacherId,
      practiceId: editorSession.practiceId,
    }),
  });
  assert.equal(editorEditSessionResponse.status, 200);
  const editorMoveSessionResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      action: "move",
      id: editorSession.id,
      sessionDate: "2099-10-02",
      startTime: "11:00",
    }),
  });
  assert.equal(editorMoveSessionResponse.status, 200);

  const forbiddenEditorSessionResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      sessionDate: "2099-10-03",
      startTime: "09:00",
      duration: 120,
      subjectId: 3,
      teacherId: temporaryTeacher.id,
      practiceId: 3,
    }),
  });
  assert.equal(forbiddenEditorSessionResponse.status, 403);
  assert.match((await forbiddenEditorSessionResponse.json()).error, /No tienes permiso/);
  const forbiddenEditorSubjectResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "subjects", id: subjectForEditor.id }),
  });
  assert.equal(forbiddenEditorSubjectResponse.status, 403);
  const selfDeleteResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "teachers", id: temporaryTeacher.id }),
  });
  assert.equal(selfDeleteResponse.status, 403);
  assert.match((await selfDeleteResponse.json()).error, /Solo los administradores/);
  const readOnlyImportResponse = await fetch(`${origin}/api/import/ics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "preview", content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" }),
  });
  assert.equal(readOnlyImportResponse.status, 403);
  const readOnlyAssignmentImportResponse = await fetch(`${origin}/api/import/session-assignments`, {
    method: "POST",
    body: assignmentFormData("preview", originalAssignmentTeacher.code),
  });
  assert.equal(readOnlyAssignmentImportResponse.status, 403);
  sessionCookie = administratorCookie;
  const deleteEditorSessionResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "sessions", id: editorSession.id }),
  });
  assert.equal(deleteEditorSessionResponse.status, 200);
  const subjectAfterEditorCreates = (await (await fetch(`${origin}/api/data`)).json()).subjects.find((subject) => subject.id === subjectForEditor.id);
  const revokeSubjectEditorResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "subjects",
      id: subjectAfterEditorCreates.id,
      code: subjectAfterEditorCreates.code,
      abbreviation: subjectAfterEditorCreates.abbreviation,
      name: subjectAfterEditorCreates.name,
      degreeId: subjectAfterEditorCreates.degreeId,
      practiceIds: subjectAfterEditorCreates.practiceIds.filter((practiceId) => practiceId !== editorPractice.id),
      editorIds: [],
    }),
  });
  assert.equal(revokeSubjectEditorResponse.status, 200);
  const deleteEditorPracticeResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "practices", id: editorPractice.id }),
  });
  assert.equal(deleteEditorPracticeResponse.status, 200);
  const deleteEditorInstallationResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "installations", id: editorInstallation.id }),
  });
  assert.equal(deleteEditorInstallationResponse.status, 200);
  const deleteTeacherResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "teachers", id: temporaryTeacher.id }),
  });
  assert.equal(deleteTeacherResponse.status, 200);

  const finalData = await (await fetch(`${origin}/api/data`)).json();
  assert.equal(finalData.laboratories.length, 3);
  assert.equal(finalData.degrees.length, 4);
  assert.equal(finalData.subjects.length, 5);
  assert.equal(finalData.sessions.length, 5);
  assert.deepEqual(finalData.holidays, [{ id: 1, holidayDate: "2026-12-08", name: "Día festivo" }]);
  const importedDegree = finalData.degrees.find((degree) => degree.code === "300");
  const importedSubject = finalData.subjects.find((subject) => subject.code === "30013");
  assert.equal(importedDegree.name, "Grado 300");
  assert.equal(importedDegree.level, "Grado");
  assert.equal(importedDegree.icsCode, "300");
  assert.equal(importedSubject.name, "Mecánica de fluidos");
  assert.equal(importedSubject.abbreviation, "");
  assert.equal(importedSubject.degreeId, importedDegree.id);
  const importedSession = finalData.sessions.find((session) => session.groupCode === "36" && session.sessionDate === "2026-10-01");
  assert.equal(importedSession.sessionDate, "2026-10-01");
  assert.equal(importedSession.startTime, "11:00");
  assert.equal(importedSession.duration, 180);
  assert.equal(importedSession.groupCode, "36");
  assert.equal(importedSession.degreeId, importedDegree.id);
  assert.equal(importedSession.subjectId, importedSubject.id);
  assert.equal(importedSession.subjectCode, "30013");
  assert.equal(importedSession.subjectAbbreviation, "");
  assert.equal(importedSession.teacherId, null);
  assert.equal(importedSession.teacherCode, null);
  assert.equal(importedSession.teacherName, null);
  assert.equal(importedSession.practiceId, null);
  assert.equal(importedSession.practiceCode, null);
  assert.equal(importedSession.practiceName, null);

  const createHolidaySessionResponse = await fetch(`${origin}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      sessionDate: "2026-12-08",
      startTime: "09:00",
      duration: 150,
      subjectId: 1,
      teacherId: 1,
      practiceId: 1,
    }),
  });
  assert.equal(createHolidaySessionResponse.status, 409);
  assert.match((await createHolidaySessionResponse.json()).error, /día festivo/);

  const editSessionToHolidayResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      id: importedSession.id,
      sessionDate: "2026-12-08",
      startTime: importedSession.startTime,
      duration: importedSession.duration,
      subjectId: importedSession.subjectId,
      teacherId: null,
      practiceId: null,
    }),
  });
  assert.equal(editSessionToHolidayResponse.status, 409);
  assert.match((await editSessionToHolidayResponse.json()).error, /día festivo/);

  const moveSessionToHolidayResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      action: "move",
      id: importedSession.id,
      sessionDate: "2026-12-08",
      startTime: "12:00",
    }),
  });
  assert.equal(moveSessionToHolidayResponse.status, 409);
  assert.match((await moveSessionToHolidayResponse.json()).error, /día festivo/);
  const unchangedImportedSession = (await (await fetch(`${origin}/api/data`)).json()).sessions
    .find((session) => session.id === importedSession.id);
  assert.equal(unchangedImportedSession.sessionDate, "2026-10-01");

  const editIncompleteSessionResponse = await fetch(`${origin}/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      id: importedSession.id,
      sessionDate: importedSession.sessionDate,
      startTime: importedSession.startTime,
      duration: importedSession.duration,
      subjectId: importedSession.subjectId,
      teacherId: null,
      practiceId: null,
    }),
  });
  assert.equal(editIncompleteSessionResponse.status, 200);
  const dataAfterIncompleteEdit = await (await fetch(`${origin}/api/data`)).json();
  const editedIncompleteSession = dataAfterIncompleteEdit.sessions.find((session) => session.id === importedSession.id);
  assert.equal(editedIncompleteSession.degreeId, importedDegree.id);
  assert.equal(editedIncompleteSession.subjectId, importedSubject.id);
  assert.equal(editedIncompleteSession.teacherId, null);
  assert.equal(editedIncompleteSession.practiceId, null);

  const protectedTeacherDelete = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "teachers", id: 3 }),
  });
  assert.equal(protectedTeacherDelete.status, 409);

  const otherSubjectSession = finalData.sessions.find((session) => session.subjectId === 1);
  const assignBatchResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      ids: [otherSubjectSession.id],
      practiceId: 2,
    }),
  });
  assert.equal(assignBatchResponse.status, 200);
  assert.equal((await assignBatchResponse.json()).updatedCount, 1);
  const batchAssignedData = await (await fetch(`${origin}/api/data`)).json();
  const batchAssignedSession = batchAssignedData.sessions.find((session) => session.id === otherSubjectSession.id);
  assert.equal(batchAssignedSession.practiceId, 2);
  assert.equal(batchAssignedSession.duration, 150);

  const sessionFromAnotherDegree = batchAssignedData.sessions.find((session) => session.subjectId === 3);
  const incompatibleDegreeResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      ids: [sessionFromAnotherDegree.id],
      practiceId: 2,
    }),
  });
  assert.equal(incompatibleDegreeResponse.status, 409);
  assert.match((await incompatibleDegreeResponse.json()).error, /no pertenece al grado/);

  const sameDegreeSession = batchAssignedData.sessions.find((session) => session.subjectId === 2);
  const sameDegreeIds = [otherSubjectSession.id, sameDegreeSession.id];
  const subjectsToLink = new Set([otherSubjectSession.subjectId, sameDegreeSession.subjectId]);
  const expectedLinkedSubjectCount = [...subjectsToLink].filter((subjectId) => (
    !batchAssignedData.subjects.find((subject) => subject.id === subjectId).practiceIds.includes(1)
  )).length;
  const linkPracticeBatchResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      ids: sameDegreeIds,
      practiceId: 1,
    }),
  });
  assert.equal(linkPracticeBatchResponse.status, 200);
  assert.equal((await linkPracticeBatchResponse.json()).linkedSubjectCount, expectedLinkedSubjectCount);
  const automaticallyLinkedData = await (await fetch(`${origin}/api/data`)).json();
  const automaticallyLinkedSessions = sameDegreeIds
    .map((id) => automaticallyLinkedData.sessions.find((session) => session.id === id));
  assert.ok(automaticallyLinkedSessions.every((session) => session.practiceId === 1));
  const automaticallyLinkedSubjectIds = new Set(automaticallyLinkedSessions.map((session) => session.subjectId));
  assert.ok([...automaticallyLinkedSubjectIds].every((subjectId) => (
    automaticallyLinkedData.subjects.find((subject) => subject.id === subjectId).practiceIds.includes(1)
  )));

  const unassignResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "sessions", ids: [importedSession.id], practiceId: null }),
  });
  assert.equal(unassignResponse.status, 200);
  const unassignedData = await (await fetch(`${origin}/api/data`)).json();
  assert.equal(unassignedData.sessions.find((session) => session.id === importedSession.id).practiceId, null);

  const assignTeacherResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      action: "assign-teacher",
      ids: [importedSession.id],
      teacherId: 2,
    }),
  });
  assert.equal(assignTeacherResponse.status, 200);
  assert.equal((await assignTeacherResponse.json()).updatedCount, 1);
  const teacherAssignedData = await (await fetch(`${origin}/api/data`)).json();
  assert.equal(teacherAssignedData.sessions.find((session) => session.id === importedSession.id).teacherId, 2);

  const teacherAssignmentTargets = teacherAssignedData.sessions.slice(0, 2);
  const unaffectedTeacherSession = teacherAssignedData.sessions.find((session) => (
    !teacherAssignmentTargets.some((target) => target.id === session.id)
  ));
  const unaffectedTeacherId = unaffectedTeacherSession.teacherId;
  const assignSelectedTeachersResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      action: "assign-teacher",
      ids: teacherAssignmentTargets.map((session) => session.id),
      teacherId: 1,
    }),
  });
  assert.equal(assignSelectedTeachersResponse.status, 200);
  assert.equal((await assignSelectedTeachersResponse.json()).updatedCount, 2);
  const selectivelyAssignedData = await (await fetch(`${origin}/api/data`)).json();
  assert.ok(teacherAssignmentTargets.every((target) => (
    selectivelyAssignedData.sessions.find((session) => session.id === target.id).teacherId === 1
  )));
  assert.equal(
    selectivelyAssignedData.sessions.find((session) => session.id === unaffectedTeacherSession.id).teacherId,
    unaffectedTeacherId,
  );

  const missingTeacherResponse = await fetch(`${origin}/api/data`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity: "sessions",
      action: "assign-teacher",
      ids: [importedSession.id],
      teacherId: 999999,
    }),
  });
  assert.equal(missingTeacherResponse.status, 409);

  const deleteSelectedSessionsResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "sessions", ids: [importedSession.id] }),
  });
  assert.equal(deleteSelectedSessionsResponse.status, 200);
  assert.equal((await deleteSelectedSessionsResponse.json()).deletedCount, 1);

  const [seedYear, seedMonth] = initialData.sessions[0].sessionDate.split("-").map(Number);
  const seedSemesterStartYear = seedMonth >= 9 ? seedYear : seedYear - 1;
  const seedSemesterNumber = seedMonth >= 9 || seedMonth === 1 ? 1 : 2;
  const seedSemesterId = `${seedSemesterStartYear}-${String(seedSemesterStartYear + 1).slice(-2)} S${seedSemesterNumber}`;

  const deleteSemesterSessionsResponse = await fetch(`${origin}/api/data`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity: "sessions", semesterId: seedSemesterId }),
  });
  assert.equal(deleteSemesterSessionsResponse.status, 200);
  assert.equal((await deleteSemesterSessionsResponse.json()).deletedCount, 4);
  assert.equal((await (await fetch(`${origin}/api/data`)).json()).sessions.length, 0);

  const logoutResponse = await fetch(`${origin}/api/auth/session`, { method: "DELETE" });
  assert.equal(logoutResponse.status, 200);
  const invalidatedSessionResponse = await fetch(`${origin}/api/data`);
  assert.equal(invalidatedSessionResponse.status, 401);

  const unconfiguredRecoveryResponse = await fetch(`${origin}/api/auth/password-reset/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: bootstrapEmail }),
  });
  assert.equal(unconfiguredRecoveryResponse.status, 503);

  const resetToken = Buffer.alloc(32, 7).toString("base64url");
  const resetTokenHash = createHash("sha256").update(resetToken, "utf8").digest("base64url");
  const resetDatabase = new DatabaseSync(databasePath);
  const bootstrapTeacher = resetDatabase.prepare("SELECT id, email FROM teachers WHERE id = 1").get();
  resetDatabase.prepare(`INSERT INTO password_reset_tokens
    (token_hash, teacher_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .run(resetTokenHash, bootstrapTeacher.id, Date.now() + 30 * 60 * 1000, Date.now());
  resetDatabase.close();

  const newPassword = "Nueva clave segura 2026";
  const resetResponse = await fetch(`${origin}/api/auth/password-reset/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: newPassword }),
  });
  assert.equal(resetResponse.status, 200);
  const reusedResetResponse = await fetch(`${origin}/api/auth/password-reset/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "Otra clave segura 2026" }),
  });
  assert.equal(reusedResetResponse.status, 400);

  const oldPasswordResponse = await fetch(`${origin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: bootstrapTeacher.email, password: bootstrapPassword }),
  });
  assert.equal(oldPasswordResponse.status, 401);
  const newPasswordResponse = await fetch(`${origin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: bootstrapTeacher.email, password: newPassword }),
  });
  assert.equal(newPasswordResponse.status, 200);
});
