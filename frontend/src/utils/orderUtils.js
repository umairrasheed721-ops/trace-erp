export function getStatusColor(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('delivered')) return { bg: 'var(--green-dim)', color: 'var(--green)' }
  if (s.includes('pending') || s.includes('unfulfilled')) return { bg: 'var(--yellow-dim)', color: 'var(--yellow)' }
  if (s.includes('cancelled') || s.includes('void')) return { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }
  if (s.includes('return') || s.includes('rto')) return { bg: 'var(--red-dim)', color: 'var(--red)' }
  if (s.includes('stuck') || s.includes('failed')) return { bg: 'var(--orange-dim)', color: 'var(--orange)' }
  if (s.includes('advice') || s.includes('hold')) return { bg: 'var(--blue-dim)', color: 'var(--blue)' }
  if (s.includes('verified') || s.includes('confirm')) return { bg: 'var(--green-dim)', color: 'var(--green)' }
  if (s.includes('fake') || s.includes('fraud')) return { bg: 'var(--red-dim)', color: 'var(--red)' }
  return { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' }
}

export function getDateRange(preset, customStart, customEnd) {
  const now = new Date(); now.setHours(0,0,0,0)
  const end = new Date(); end.setHours(23,59,59,999)
  if (preset === 'Today') return { start: now, end }
  if (preset === 'Yesterday') {
    const d = new Date(now); d.setDate(d.getDate()-1)
    const e = new Date(d); e.setHours(23,59,59,999)
    return { start: d, end: e }
  }
  if (preset === 'Last 7 Days') { const s = new Date(now); s.setDate(s.getDate()-7); return { start: s, end } }
  if (preset === 'Last 30 Days') { const s = new Date(now); s.setDate(s.getDate()-30); return { start: s, end } }
  if (preset === 'This Month') { const s = new Date(now); s.setDate(1); return { start: s, end } }
  if (preset === 'Last Month') {
    const s = new Date(now.getFullYear(), now.getMonth()-1, 1)
    const e = new Date(now.getFullYear(), now.getMonth(), 0); e.setHours(23,59,59,999)
    return { start: s, end: e }
  }
  if (preset === 'This Year') { const s = new Date(now); s.setMonth(0); s.setDate(1); return { start: s, end } }
  if (preset === 'Last Year') {
    const s = new Date(now.getFullYear() - 1, 0, 1)
    const e = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
    return { start: s, end: e }
  }
  if (preset === '2025') {
    const s = new Date(2025, 0, 1)
    const e = new Date(2025, 11, 31, 23, 59, 59, 999)
    return { start: s, end: e }
  }
  if (preset === '2024') {
    const s = new Date(2024, 0, 1)
    const e = new Date(2024, 11, 31, 23, 59, 59, 999)
    return { start: s, end: e }
  }
  if (preset === '2023') {
    const s = new Date(2023, 0, 1)
    const e = new Date(2023, 11, 31, 23, 59, 59, 999)
    return { start: s, end: e }
  }
  if (preset === 'All Time') return { start: new Date('2010-01-01'), end }
  if (preset === 'Custom Range' && customStart) {
    const s = new Date(customStart); s.setHours(0,0,0,0)
    const e = customEnd ? new Date(customEnd) : new Date(s)
    e.setHours(23,59,59,999)
    return { start: s, end: e }
  }
  return null
}

export const formatYMD = (d) => {
  if (!d || isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
