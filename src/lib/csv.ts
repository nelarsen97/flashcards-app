export interface ParsedRow {
  front: string;
  back: string;
}

/**
 * Parses semicolon-delimited `front;back` text with no header line.
 *
 * - Splits each line on the FIRST `;` only, so a back that contains semicolons
 *   (e.g. "a; b; c") is preserved intact.
 * - Skips blank lines and lines with no separator or an empty front.
 * - Trims surrounding whitespace and handles CRLF / CR / LF line endings.
 */
export function parseSemicolonCsv(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    const sep = line.indexOf(';');
    if (sep === -1) continue; // no separator -> not a valid card line

    const front = line.slice(0, sep).trim();
    const back = line.slice(sep + 1).trim();
    if (front === '') continue;

    rows.push({ front, back });
  }
  return rows;
}

/**
 * Parses pasted `front - back` text (one card per line) for bulk-adding cards.
 *
 * - Splits each line on the FIRST `-` only, so a back that contains dashes
 *   (e.g. "well-known") is preserved intact.
 * - Trims surrounding whitespace, so spaces around the `-` and at line ends are
 *   stripped (e.g. "  å sveise  -  to weld  " -> { "å sveise", "to weld" }).
 * - Skips blank lines, lines with no separator, and lines with an empty front or
 *   back (a card needs both sides).
 * - Handles CRLF / CR / LF line endings.
 */
export function parseDashLines(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    const sep = line.indexOf('-');
    if (sep === -1) continue; // no separator -> not a valid card line

    const front = line.slice(0, sep).trim();
    const back = line.slice(sep + 1).trim();
    if (front === '' || back === '') continue;

    rows.push({ front, back });
  }
  return rows;
}
