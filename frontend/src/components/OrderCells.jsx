import React, { useState, useEffect, useRef } from 'react'

export function AddressCell({ order, onSave }) {
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
}

export function PaidAmountCell({ order, onSave }) {
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
}

export function CourierFeeCell({ order, onSave }) {
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
}

export function CostCell({ order, onSave }) {
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
}

export function NoteCell({ order, onSave }) {
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
}
