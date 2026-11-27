import * as XLSX from 'xlsx'

/**
 * Cleanly parses Pakistani/Excel currency values like "Rs. 3,500", "PKR 2,450.50", "(250)", "1,200"
 */
export function parseCurrencyNumber(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  if (val === null || val === undefined) return 0
  const cleaned = String(val)
    .replace(/rs\.?|pkr/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/^\((.*)\)$/, '-$1')
    .trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/**
 * Quote-aware CSV/TSV line splitter so quoted comma numbers like "3,500" stay intact
 */
function splitLine(line, delimiter) {
  if (delimiter === '\t') return line.split('\t').map(c => c.trim())
  const result = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur.trim())
  return result
}

function detectDelimiter(lines) {
  const sample = lines.slice(0, 5).join('\n')
  if (sample.includes('\t')) return '\t'
  const commaCount = (sample.match(/,/g) || []).length
  const semiCount = (sample.match(/;/g) || []).length
  if (semiCount > commaCount) return ';'
  return ','
}

function isHeaderRow(parts) {
  const joined = parts.slice(0, 4).join(' ').toLowerCase()
  return (
    joined.includes('order id') ||
    joined.includes('order_id') ||
    joined.includes('tracking') ||
    joined.includes('cod amount') ||
    (joined.includes('order') && joined.includes('charges'))
  )
}

/**
 * Parse pasted TSV/CSV text into normalized 7-column reconciliation rows + live summary preview
 */
export function parsePastedSheet(text) {
  const rawLines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim().length > 0)

  if (rawLines.length === 0) {
    return {
      rows: [],
      badLines: [],
      stats: { totalRows: 0, deliveredCount: 0, returnedCount: 0, invalidTypeCount: 0, totalCod: 0, totalCharges: 0, netPayout: 0 }
    }
  }

  const delimiter = detectDelimiter(rawLines)
  const rows = []
  const badLines = []
  let deliveredCount = 0
  let returnedCount = 0
  let invalidTypeCount = 0
  let totalCod = 0
  let totalCharges = 0

  for (let i = 0; i < rawLines.length; i++) {
    const parts = splitLine(rawLines[i], delimiter)
    if (i === 0 && isHeaderRow(parts)) continue
    if (isHeaderRow(parts)) continue

    if (parts.length < 5) {
      badLines.push({ lineNumber: i + 1, text: rawLines[i].slice(0, 80), reason: `Only ${parts.length} columns (need at least 5)` })
      continue
    }

    const orderId = (parts[0] || '').trim()
    const trackingNumber = (parts[1] || '').trim()
    const rawType = (parts[2] || '').trim().toUpperCase()
    const type = rawType.startsWith('D') ? 'D' : (rawType.startsWith('R') ? 'R' : rawType.charAt(0))
    const codAmount = parseCurrencyNumber(parts[3])
    const charges = parseCurrencyNumber(parts[4])
    const ref = (parts[5] || '').trim()
    const date = (parts[6] || '').trim()

    if (!orderId && !trackingNumber) {
      badLines.push({ lineNumber: i + 1, text: rawLines[i].slice(0, 80), reason: 'Missing both Order ID & Tracking Number' })
      continue
    }

    if (type === 'D') {
      deliveredCount++
      totalCod += codAmount
    } else if (type === 'R') {
      returnedCount++
    } else {
      invalidTypeCount++
    }
    totalCharges += charges

    rows.push({ orderId, trackingNumber, type, codAmount, charges, ref, date })
  }

  return {
    rows,
    badLines,
    stats: {
      totalRows: rows.length,
      deliveredCount,
      returnedCount,
      invalidTypeCount,
      totalCod: Math.round(totalCod * 100) / 100,
      totalCharges: Math.round(totalCharges * 100) / 100,
      netPayout: Math.round((totalCod - totalCharges) * 100) / 100,
    }
  }
}

/**
 * Parse an uploaded .xlsx / .xls / .csv File into normalized TSV text ready for Quick Reconcile
 */
export async function parseSpreadsheetFile(file) {
  const ext = (file.name || '').toLowerCase()
  if (ext.endsWith('.csv') || ext.endsWith('.tsv') || ext.endsWith('.txt')) {
    const text = await file.text()
    return text
  }

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) throw new Error('Excel file has no sheets')
  const sheet = wb.Sheets[firstSheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })

  const tsvLines = matrix
    .filter(row => Array.isArray(row) && row.some(cell => String(cell || '').trim() !== ''))
    .map(row => row.slice(0, 7).map(cell => String(cell ?? '').replace(/\t|\r|\n/g, ' ').trim()).join('\t'))

  return tsvLines.join('\n')
}

/**
 * Generate & download a clean 7-column Excel reconciliation template
 */
export function downloadSampleTemplate() {
  const sampleData = [
    ['Order ID', 'Tracking', 'Type (D/R)', 'COD', 'Charges', 'CPR', 'Date'],
    ['#TR35118', '26710123456789', 'D', 3500, 340, 'CPR-2026-101', '2026-11-28'],
    ['#TR35119', '26710123456790', 'R', 0, 210, 'CPR-2026-101', '2026-11-28'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(sampleData)
  ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reconcile_Template')
  XLSX.writeFile(wb, 'TRACE_Quick_Reconcile_Template.xlsx')
}

/**
 * Export reconciliation results or session items to CSV
 */
export function exportRowsToCsv(headers, rows, filename) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    headers.map(escape).join(','),
    ...rows.map(r => r.map(escape).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
