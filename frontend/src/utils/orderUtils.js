export const ERP_STATUSES = [
  'Pending', 'Confirmed', 'Booked', 'Picked Up', 'In Transit',
  'Out for Delivery', 'Attempted', 'Shipper Advice', 'Undelivered',
  'Refused', 'Delivered', 'Return Initiated', 'Return Received',
  'Returned', 'Cancelled'
];

export function getStatusColor(status) {
  const s = (status || '').toLowerCase()
  // ✅ Success / Revenue
  if (s === 'delivered')                                        return { bg: 'var(--green-dim)',  color: 'var(--green)' }
  // 🔵 In-Progress / Active
  if (s === 'confirmed')                                        return { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' }
  if (s === 'booked')                                           return { bg: 'var(--blue-dim)',   color: 'var(--blue)' }
  if (s.includes('transit') || s === 'shipped')                 return { bg: 'var(--blue-dim)',   color: 'var(--blue)' }
  if (s === 'out for delivery')                                  return { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' }
  if (s === 'picked up' || s === 'pick up')                     return { bg: 'var(--blue-dim)',   color: 'var(--blue)' }
  // 🟡 Pending / Unknown
  if (s === 'pending' || s.includes('unfulfilled'))             return { bg: 'var(--yellow-dim)', color: 'var(--yellow)' }
  if (s === 'undelivered' || s === 'attempted' || s.includes('attempt')) return { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' }
  // 🔴 Problem / Loss
  if (s === 'return received')                                  return { bg: 'var(--red-dim)',    color: 'var(--red)' }
  if (s === 'returned' || s.includes('rto'))                    return { bg: 'var(--red-dim)',    color: 'var(--red)' }
  if (s === 'refused')                                          return { bg: 'var(--red-dim)',    color: 'var(--red)' }
  if (s.includes('fake') || s.includes('fraud'))                return { bg: 'var(--red-dim)',    color: 'var(--red)' }
  // ⚠️ Hold / Advisory
  if (s.includes('advice') || s.includes('hold'))               return { bg: 'var(--orange-dim)', color: 'var(--orange)' }
  if (s.includes('stuck') || s.includes('failed'))              return { bg: 'var(--orange-dim)', color: 'var(--orange)' }
  // ⬛ Closed / Neutral
  if (s === 'cancelled' || s.includes('void'))                  return { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }
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
