/** Database API responses are capped; page every export and fail on read errors. */
export async function readAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500
): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const result = await page(offset, offset + pageSize - 1)
    if (result.error) throw result.error
    if (!Array.isArray(result.data)) throw new Error('Export query returned no readable result set.')
    rows.push(...result.data)
    if (result.data.length < pageSize) return rows
  }
  throw new Error('This export exceeds 100,000 records. Export a smaller project instead.')
}

/** Neutralize spreadsheet formulas before applying ordinary RFC-style CSV quoting. */
export function csvCell(value: unknown): string {
  if (value == null) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}
