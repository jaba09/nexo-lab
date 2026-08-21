const APPLICATION_TIME_ZONE = "Europe/Madrid";
const LAB_SUMMARY_TEXT = "Prácticas de laboratorio";
const HOLIDAY_SUMMARY_TEXT = "Día festivo";

type IcsProperty = {
  value: string;
  parameters: Record<string, string>;
};

export type IcsLabSession = {
  sourceUid: string;
  summary: string;
  subjectCode: string;
  subjectName: string;
  degreeCode: string;
  groupCode: string;
  sessionDate: string;
  startTime: string;
  duration: number;
};

export type IcsHoliday = {
  sourceUid: string;
  summary: string;
  holidayDate: string;
  name: string;
};

export type IcsParseResult = {
  sessions: IcsLabSession[];
  holidays: IcsHoliday[];
  totalEvents: number;
  ignoredCount: number;
  invalidCount: number;
  duplicateCount: number;
};

const madridFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APPLICATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function unfoldLines(content: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function decodeText(value: string) {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function readProperty(line: string): { name: string; property: IcsProperty } | null {
  const separator = line.indexOf(":");
  if (separator < 1) return null;
  const declaration = line.slice(0, separator).split(";");
  const name = declaration.shift()?.toUpperCase();
  if (!name) return null;
  const parameters: Record<string, string> = {};
  for (const parameter of declaration) {
    const equals = parameter.indexOf("=");
    if (equals > 0) parameters[parameter.slice(0, equals).toUpperCase()] = parameter.slice(equals + 1);
  }
  return { name, property: { value: line.slice(separator + 1), parameters } };
}

function datePartsInZone(timestamp: number, timeZone: string) {
  const formatter = timeZone === APPLICATION_TIME_ZONE
    ? madridFormatter
    : new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zonedTimeToTimestamp(parts: ReturnType<typeof datePartsInZone>, timeZone: string) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let timestamp = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = datePartsInZone(timestamp, timeZone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    timestamp += desired - observedAsUtc;
  }
  return timestamp;
}

function parseDateTime(property: IcsProperty) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(property.value.trim());
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? "0"),
  };
  const timestamp = match[7]
    ? Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    : zonedTimeToTimestamp(parts, property.parameters.TZID || APPLICATION_TIME_ZONE);
  if (!Number.isFinite(timestamp)) return null;
  const local = datePartsInZone(timestamp, APPLICATION_TIME_ZONE);
  return {
    timestamp,
    sessionDate: `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`,
    startTime: `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,
  };
}

function parseEventDate(property: IcsProperty) {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(property.value.trim());
  if (dateOnly) {
    const holidayDate = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    const parsed = new Date(`${holidayDate}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === holidayDate
      ? holidayDate
      : null;
  }
  return parseDateTime(property)?.sessionDate ?? null;
}

function isHolidaySummary(summary: string) {
  return summary.normalize("NFC").trim().toLocaleLowerCase("es")
    .startsWith(HOLIDAY_SUMMARY_TEXT.toLocaleLowerCase("es"));
}

function summaryMetadata(summary: string) {
  const normalizedSummary = summary.normalize("NFC").trim();
  if (!normalizedSummary.toLocaleLowerCase("es").includes(LAB_SUMMARY_TEXT.toLocaleLowerCase("es"))) return null;
  const subjectMatch = /^(\d{5})\s*-\s*(.+?)\s+Grupo\s*:/iu.exec(normalizedSummary);
  const groupMatch = /\bGrupo\s*:\s*(\d+)\s*-\s*Prácticas de laboratorio(?:\s|$)/iu.exec(normalizedSummary);
  if (!subjectMatch || !groupMatch) return null;
  return {
    subjectCode: subjectMatch[1],
    subjectName: subjectMatch[2].trim(),
    degreeCode: subjectMatch[1].slice(0, 3),
    groupCode: groupMatch[1],
  };
}

export function parseIcsLabSessions(content: string): IcsParseResult {
  if (!content.includes("BEGIN:VCALENDAR")) throw new Error("El archivo no contiene un calendario ICS válido.");

  const eventProperties: Map<string, IcsProperty>[] = [];
  let currentEvent: Map<string, IcsProperty> | null = null;
  for (const line of unfoldLines(content)) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = new Map();
    } else if (line === "END:VEVENT") {
      if (currentEvent) eventProperties.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) {
      const parsed = readProperty(line);
      if (parsed && !currentEvent.has(parsed.name)) currentEvent.set(parsed.name, parsed.property);
    }
  }

  const sessions: IcsLabSession[] = [];
  const holidays: IcsHoliday[] = [];
  const sourceUids = new Set<string>();
  const holidayDates = new Set<string>();
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const event of eventProperties) {
    const summary = decodeText(event.get("SUMMARY")?.value ?? "");
    if (isHolidaySummary(summary)) {
      const holidayDate = event.get("DTSTART") ? parseEventDate(event.get("DTSTART")!) : null;
      if (!holidayDate) {
        invalidCount += 1;
        continue;
      }
      if (holidayDates.has(holidayDate)) {
        duplicateCount += 1;
        continue;
      }
      holidayDates.add(holidayDate);
      const uid = decodeText(event.get("UID")?.value ?? "").trim();
      holidays.push({
        sourceUid: uid || `generated:holiday:${holidayDate}`,
        summary,
        holidayDate,
        name: HOLIDAY_SUMMARY_TEXT,
      });
      continue;
    }
    const metadata = summaryMetadata(summary);
    if (!metadata) continue;
    const start = event.get("DTSTART") ? parseDateTime(event.get("DTSTART")!) : null;
    const end = event.get("DTEND") ? parseDateTime(event.get("DTEND")!) : null;
    const duration = start && end ? Math.round((end.timestamp - start.timestamp) / 60_000) : 0;
    if (!start || !end || duration <= 0) {
      invalidCount += 1;
      continue;
    }
    const uid = decodeText(event.get("UID")?.value ?? "").trim();
    const sourceUid = uid || `generated:${metadata.subjectCode}:${metadata.groupCode}:${start.sessionDate}:${start.startTime}`;
    if (sourceUids.has(sourceUid)) {
      duplicateCount += 1;
      continue;
    }
    sourceUids.add(sourceUid);
    sessions.push({
      sourceUid,
      summary,
      ...metadata,
      sessionDate: start.sessionDate,
      startTime: start.startTime,
      duration,
    });
  }

  sessions.sort((left, right) => (
    left.sessionDate.localeCompare(right.sessionDate)
    || left.startTime.localeCompare(right.startTime)
    || left.groupCode.localeCompare(right.groupCode)
  ));
  holidays.sort((left, right) => left.holidayDate.localeCompare(right.holidayDate));

  return {
    sessions,
    holidays,
    totalEvents: eventProperties.length,
    ignoredCount: eventProperties.length - sessions.length - holidays.length - invalidCount - duplicateCount,
    invalidCount,
    duplicateCount,
  };
}
