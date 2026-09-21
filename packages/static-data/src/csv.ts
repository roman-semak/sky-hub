/**
 * Minimal RFC 4180 CSV parser: quoted fields, escaped quotes (`""`), commas
 * and newlines inside quotes, CRLF or LF line endings.
 *
 * @see https://www.rfc-editor.org/rfc/rfc4180
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text.charAt(i);
    if (quoted) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (c === '\r' && text.charAt(i + 1) === '\n') i++;
    } else {
      field += c;
    }
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parses a CSV with a header row into objects keyed by column name. */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (header === undefined) return [];
  return rows
    .filter((r) => r.length > 1 || (r[0] ?? '') !== '')
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
