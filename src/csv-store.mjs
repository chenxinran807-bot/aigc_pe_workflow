import { readFile, writeFile } from "node:fs/promises";

export async function loadCsv(path) {
  const raw = await readFile(path, "utf8");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const records = parseCsv(text);
  const headers = makeUniqueHeaders(records[0] || []);
  const rows = records.slice(1).filter((record) => record.some((cell) => cell !== "")).map((record) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = record[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

export async function saveCsv(path, rows, headers) {
  const finalHeaders = dedupeHeaders(headers);
  const records = [
    finalHeaders.map(displayHeader),
    ...rows.map((row) => finalHeaders.map((header) => row[header] ?? "")),
  ];
  await writeFile(path, formatCsv(records), "utf8");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function formatCsv(records) {
  return `${records.map((record) => record.map(formatCell).join(",")).join("\n")}\n`;
}

function formatCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function dedupeHeaders(headers) {
  const seen = new Set();
  const result = [];
  for (const header of headers) {
    if (!header || seen.has(header)) continue;
    seen.add(header);
    result.push(header);
  }
  return result;
}

export function makeUniqueHeaders(headers) {
  const counts = new Map();
  return headers.map((header) => {
    const count = (counts.get(header) || 0) + 1;
    counts.set(header, count);
    return count === 1 ? header : `${header}__dup${count}`;
  });
}

export function displayHeader(header) {
  return String(header).replace(/__dup\d+$/, "");
}
