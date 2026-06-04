import React from 'react'

export default function TablePagination({
  totalCount,
  limit,
  setLimit,
  page,
  setPage,
  loading
}) {
  return (
    <>
      {totalCount > 50 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '16px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {totalCount > limit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button 
                className="btn btn-secondary btn-sm"
                disabled={page === 1 || loading}
                onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                ◀ Previous
              </button>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Page {page} of {Math.ceil(totalCount / limit)}
              </div>
              <button 
                className="btn btn-secondary btn-sm"
                disabled={page >= Math.ceil(totalCount / limit) || loading}
                onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                Next ▶
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Orders per page:</span>
            <select 
              value={limit} 
              onChange={e => {
                const val = parseInt(e.target.value)
                setLimit(val)
                localStorage.setItem('trace_search_limit', val)
                setPage(1)
              }}
              className="btn btn-secondary btn-sm"
              style={{ padding: '2px 8px', fontSize: '0.75rem', height: 28, background: 'var(--bg-base)', border: '1px solid var(--border)' }}
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
            </select>
          </div>
        </div>
      )}
    </>
  )
}
