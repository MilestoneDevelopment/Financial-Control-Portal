import "server-only";

/**
 * Server-only XLSX reader. Loads a workbook buffer with exceljs and returns a
 * dense header row + data grid for the pure import core (lib/domain/upload/import).
 * Never imported by client code; raw cell values stay on the server.
 */
import ExcelJS from "exceljs";
import { matchHeader } from "@/lib/domain/upload/columns";

export interface SheetGrid {
  headers: unknown[];
  rows: unknown[][];
  sheetName: string | null;
}

/** Coerce an exceljs cell value (which may be a rich object) to a primitive. */
function cellValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text; // hyperlink / rich text wrapper
    if ("result" in o) return o.result ?? null; // formula result
    if (Array.isArray(o.richText)) return o.richText.map((r) => (r as { text?: string }).text ?? "").join("");
    if ("error" in o) return null;
    return null;
  }
  return v;
}

export async function readXlsxGrid(data: ArrayBuffer | Buffer): Promise<SheetGrid> {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts a Node Buffer / ArrayBuffer here; cast to the method's own
  // parameter type to sidestep the @types/node Buffer generic mismatch.
  type LoadArg = Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(data as unknown as LoadArg);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [], sheetName: null };

  const colCount = ws.actualColumnCount || ws.columnCount || 0;
  const allRows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = [];
    for (let c = 1; c <= colCount; c++) cells.push(cellValue(row.getCell(c).value));
    allRows.push(cells);
  });
  if (allRows.length === 0) return { headers: [], rows: [], sheetName: ws.name ?? null };

  // Pick the header row: the first of the first 10 rows with the most recognized
  // headers (handles title/blank rows above the table). Falls back to row 0.
  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const matches = allRows[i].filter((c) => c != null && matchHeader(String(c)) !== null).length;
    if (matches > best) {
      best = matches;
      headerIdx = i;
    }
  }

  return {
    headers: allRows[headerIdx] ?? [],
    rows: allRows.slice(headerIdx + 1),
    sheetName: ws.name ?? null,
  };
}
