/**
 * CSV export of the current selection (TZ v1.6 §20-H / §28 P2).
 *
 * Rules:
 * - delimiter `;` (RU Excel opens it natively)
 * - values escaped by doubling quotes; strings with delimiter/quote/newline wrapped
 * - BOM prefix so Excel detects UTF-8
 */

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[";\n\r]/.test(s)) return '"' + s.replaceAll('"', '""') + '"'
  return s
}

export function downloadCsv(
  filename: string,
  headers: readonly string[],
  rows: ReadonlyArray<readonly unknown[]>,
): void {
  const head = headers.map(escapeCsv).join(';')
  const body = rows.map((r) => r.map(escapeCsv).join(';')).join('\r\n')
  const blob = new Blob(['\uFEFF' + head + '\r\n' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
