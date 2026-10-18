/**
 * Lector CSV para las importaciones. Admite lo que produce Excel en Chile al "Guardar como CSV":
 * separador ";" (o ","), BOM UTF-8, comillas dobles (con "" como escape) y saltos de línea dentro de comillas.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const firstLine = input.slice(0, input.search(/\r?\n|$/));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Las filas completamente vacías (líneas en blanco al final) no cuentan.
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** "Correo electrónico" → "correo_electronico": encabezados tolerantes a mayúsculas, tildes y espacios. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Convierte filas en objetos por encabezado normalizado. La fila 1 es el encabezado (línea 1 del archivo). */
export function csvRecords(text: string): { headers: string[]; records: { line: number; values: Record<string, string> }[] } {
  const [head, ...body] = parseCsv(text);
  const headers = (head ?? []).map(normalizeHeader);
  const records = body.map((cells, i) => ({
    line: i + 2,
    values: Object.fromEntries(headers.map((h, idx) => [h, (cells[idx] ?? '').trim()])),
  }));
  return { headers, records };
}
