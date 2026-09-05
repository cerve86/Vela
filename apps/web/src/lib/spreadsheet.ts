import 'server-only';

// `readSheet`, not the default export: in v9 the default returns every sheet in the
// workbook, and the format is one flat table on the first sheet by design.
import { readSheet } from 'read-excel-file/node';
import { parseCsv, type SpreadsheetCell } from '@vela/shared';

/** Anything larger is not a training programme. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;

/**
 * An uploaded .xlsx or .csv, as a header row and data rows.
 *
 * The first sheet only, on purpose: a workbook with a "Week 1" and a "Week 2" tab is a
 * reasonable thing for a coach to have made and a wrong thing to guess the meaning of.
 * The format asks for one flat table, and the template shows it.
 *
 * Cells arrive typed from the xlsx reader — numbers as numbers, dates as Dates — which is
 * what lets the parser tell a coach that Excel turned her "8-10" into a date. CSV cells
 * are strings and the parser reads numbers out of them itself.
 */
export async function readSpreadsheet(file: File): Promise<{ headers: SpreadsheetCell[]; rows: SpreadsheetCell[][] }> {
  if (file.size === 0) throw new Error('The file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('The file is larger than 5 MB.');

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv';
  const isXlsx =
    name.endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  let table: SpreadsheetCell[][];
  if (isCsv) {
    table = parseCsv(await file.text());
  } else if (isXlsx) {
    const buffer = Buffer.from(await file.arrayBuffer());
    // The reader's cell union is string | number | boolean | Date | null — the same set
    // `SpreadsheetCell` names, under a generic TypeScript widens oddly. The cast asserts
    // the equivalence rather than re-deriving it.
    table = (await readSheet<number>(buffer, 1)) as SpreadsheetCell[][];
  } else if (name.endsWith('.xls')) {
    throw new Error('Old .xls workbooks are not supported — save it as .xlsx or .csv.');
  } else {
    throw new Error('Upload a .xlsx or .csv file.');
  }

  if (table.length > MAX_ROWS + 1) throw new Error(`More than ${MAX_ROWS} rows — split the programme.`);
  const [headers = [], ...rows] = table;
  return { headers, rows };
}
