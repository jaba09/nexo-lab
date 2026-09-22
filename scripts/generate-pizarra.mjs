import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { buildPizarraData } from "../lib/pizarraImport.mjs";

const [calendarPath, assignmentPath] = process.argv.slice(2);
if (!calendarPath || !assignmentPath) throw new Error("Uso: node scripts/generate-pizarra.mjs calendario.ics horas_profe.csv");
const [calendar, assignments] = await Promise.all([readFile(calendarPath, "utf8"), readFile(assignmentPath, "utf8")]);
const data = buildPizarraData(calendar, assignments, { calendar: basename(calendarPath), assignments: basename(assignmentPath) });
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(new URL("../data/pizarra.json", import.meta.url), JSON.stringify(data) + "\n");
console.log(JSON.stringify({ classes: data.classes.length, teachers: data.teachers.length, ...data.summary }, null, 2));
