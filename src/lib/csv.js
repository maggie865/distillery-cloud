/**
 * src/lib/csv.js — small quote-aware CSV parser.
 *
 * The existing batch-data importer (ImportDataPanel) just does
 * `line.split(',')`, which is fine for its own fixed, comma-free numeric
 * columns but corrupts real-world exports like Xero's contact list, where
 * address fields routinely contain commas inside quotes
 * (e.g. `"123 Main St, Suite 4"`). This handles quoted fields, commas and
 * escaped `""` quotes within them. Does not handle embedded newlines inside
 * a quoted field — contact/address exports don't produce those in practice,
 * and handling it would mean not being able to split rows by line first.
 */
export function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
  return lines.map(parseCsvLine);
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Rows as an array of header-keyed objects, using the first CSV row as headers. */
export function parseCsvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRows] = rows;
  const objects = dataRows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
  return { headers, rows: objects };
}
