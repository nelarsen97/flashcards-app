export interface ParsedRow {
  front: string;
  back: string;
}

/**
 * Parses delimited `front<sep>back` text (one card per line) into rows. Shared by
 * the bulk-add screen's paste box and its CSV-file import, with a user-chosen
 * `separator` (e.g. "-", ";", "\t", " | ").
 *
 * - Splits each line on the FIRST occurrence of `separator` only, so a back that
 *   contains the separator (e.g. "well-known" with a "-") is preserved intact.
 * - Trims surrounding whitespace, so spaces around the separator and at line ends
 *   are stripped (e.g. "  å sveise  -  to weld  " -> { "å sveise", "to weld" }).
 * - Skips blank lines, lines with no separator, and lines with an empty front.
 * - Handles CRLF / CR / LF line endings.
 * - An empty `separator` yields no rows (there's nothing to split on).
 */
export function parseDelimited(text: string, separator: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  if (separator === '') return rows;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    const sep = line.indexOf(separator);
    if (sep === -1) continue; // no separator -> not a valid card line

    const front = line.slice(0, sep).trim();
    const back = line.slice(sep + separator.length).trim();
    if (front === '') continue;

    rows.push({ front, back });
  }
  return rows;
}
