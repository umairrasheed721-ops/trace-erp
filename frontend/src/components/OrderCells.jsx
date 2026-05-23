import React, { useState, useEffect, useRef } from 'react'

export const AddressCell = React.memo(function AddressCell({ order, onSave }) {
  const [val, setVal] = useState(order.address || '')
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setVal(order.address || '') }, [order.address])

  const handleBlur = () => {
    setIsEditing(false)
    if (val !== order.address) onSave(order.id, 'address', val)
  }

  if (isEditing) {
    return (
      <textarea
        ref={inputRef}
        className="form-textarea"
        style={{ fontSize: '0.72rem', minHeight: 60, width: 220 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleBlur}
        autoFocus
      />
    )
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      style={{ cursor: 'pointer', minHeight: 20, whiteSpace: 'normal', fontSize: '0.72rem', color: 'var(--text-secondary)' }}
      title="Click to edit address"
    >
      {order.address || <span style={{ opacity: 0.3 }}>Empty Address</span>}
    </div>
  )
})

export const CityCell = React.memo(function CityCell({ order, onSave }) {
  const [val, setVal] = useState(order.city || '')
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setVal(order.city || '') }, [order.city])

  const handleBlur = async () => {
    setIsEditing(false)
    if (val !== order.city) {
      await onSave(order.id, 'city', val)
      
      // Prompt for dictionary mapping
      if (order.city && val && order.city.trim().toLowerCase() !== val.trim().toLowerCase()) {
        const confirmSave = window.confirm(`Save city mapping?\n\n"${order.city}" ➔ "${val}"\n\nThis will auto-correct future orders.`);
        if (confirmSave) {
          try {
            const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
            await fetch(`${apiBase}/api/cities/mappings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({ original_input: order.city, corrected_name: val })
            });
          } catch (e) {
            console.error('Failed to save city mapping', e);
          }
        }
      }
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="form-input"
        style={{ fontSize: '0.72rem', width: 120, padding: '2px 4px' }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => { if(e.key === 'Enter') inputRef.current.blur() }}
        autoFocus
      />
    )
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      style={{ cursor: 'pointer', minHeight: 20, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}
      title="Click to edit city"
    >
      {order.city || <span style={{ opacity: 0.3 }}>Missing</span>}
    </div>
  )
})

export const PaidAmountCell = React.memo(function PaidAmountCell({ order, onSave }) {
  const [val, setVal] = useState(order.paid_amount || 0)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => { setVal(order.paid_amount || 0) }, [order.paid_amount])

  const handleBlur = () => {
    setIsEditing(false)
    if (parseFloat(val) !== parseFloat(order.paid_amount)) onSave(order.id, 'paid_amount', val)
  }

  if (isEditing) {
    return (
      <input
        type="number"
        className="form-input"
        style={{ width: 80, fontSize: '0.72rem', padding: '2px 4px' }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleBlur}
        autoFocus
      />
    )
  }

  return (
    <div onClick={() => setIsEditing(true)} style={{ cursor: 'pointer', fontWeight: 600 }}>
      Rs {Math.round(parseFloat(order.paid_amount)||0).toLocaleString()}
    </div>
  )
})

export const CourierFeeCell = React.memo(function CourierFeeCell({ order, onSave }) {
  const [val, setVal] = useState(order.courier_fee || 0)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => { setVal(order.courier_fee || 0) }, [order.courier_fee])

  const handleBlur = () => {
    setIsEditing(false)
    if (parseFloat(val) !== parseFloat(order.courier_fee)) onSave(order.id, 'courier_fee', val)
  }

  if (isEditing) {
    return (
      <input
        type="number"
        className="form-input"
        style={{ width: 70, fontSize: '0.72rem', padding: '2px 4px' }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleBlur}
        autoFocus
      />
    )
  }

  return (
    <div onClick={() => setIsEditing(true)} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
      Rs {Math.round(parseFloat(order.courier_fee)||0).toLocaleString()}
    </div>
  )
})

export const CostCell = React.memo(function CostCell({ order, onSave }) {
  const [val, setVal] = useState(order.cost || 0)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => { setVal(order.cost || 0) }, [order.cost])

  const handleBlur = () => {
    setIsEditing(false)
    if (parseFloat(val) !== parseFloat(order.cost)) onSave(order.id, 'cost', val)
  }

  if (isEditing) {
    return (
      <input
        type="number"
        className="form-input"
        style={{ width: 70, fontSize: '0.72rem', padding: '2px 4px' }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleBlur}
        autoFocus
      />
    )
  }

  return (
    <div onClick={() => setIsEditing(true)} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
      Rs {Math.round(parseFloat(order.cost)||0).toLocaleString()}
    </div>
  )
})

export const NoteCell = React.memo(function NoteCell({ order, onSave }) {
  const [val, setVal] = useState(order.notes || '')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => { setVal(order.notes || '') }, [order.notes])

  const handleBlur = () => {
    setIsEditing(false)
    if (val !== order.notes) onSave(order.id, 'notes', val)
  }

  if (isEditing) {
    return (
      <textarea
        className="form-textarea"
        style={{ fontSize: '0.72rem', minHeight: 60, width: 180 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleBlur}
        autoFocus
      />
    )
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      style={{ cursor: 'pointer', minHeight: 20, whiteSpace: 'normal', fontSize: '0.72rem', color: 'var(--text-muted)' }}
    >
      {order.notes || <span style={{ color: 'var(--text-muted)' }}>No Notes</span>}
    </div>
  )
})
