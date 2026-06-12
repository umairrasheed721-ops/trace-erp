import React from 'react'

/**
 * Parses OCR transcript text to extract transaction data like amount, transaction ID, bank name, and status.
 * 
 * @param {string} transcript - The raw text of the OCR transcript
 * @returns {object|null} The parsed payment receipt details or null if no amount match
 */
export const parseOCRReceipt = (transcript) => {
  if (!transcript) return null
  const amountMatch = transcript.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i)
  const txnMatch = transcript.match(/TXN[:\s]?([A-Z0-9]+)/i)
  const bankMatch = transcript.match(/Bank[:\s]?([\w\s]+?)(?:\s|,|\.|$)/i)
  const statusMatch = transcript.match(/status[:\s]?(matched|mismatch|manual_review|verified)/i)
  
  if (amountMatch) {
    return {
      amount: amountMatch[1],
      txnId: txnMatch?.[1] || null,
      bank: bankMatch?.[1]?.trim() || null,
      status: statusMatch?.[1]?.toLowerCase() || 'reviewing',
    }
  }
  return null
}

const ChatOCRReceipt = ({ msg, isOverlay = false }) => {
  if (!msg || !msg.transcript) return null

  const cardData = msg.ai_processed ? parseOCRReceipt(msg.transcript) : null

  if (isOverlay) {
    if (cardData) {
      return (
        <div className="wa-ai-payment-card-overlay" style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          background: 'rgba(32, 44, 51, 0.95)',
          padding: '4px 6px',
          fontSize: '0.65rem',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          pointerEvents: 'none'
        }}>
          <span>💳 Rs. {cardData.amount}</span>
          <span style={{
            fontSize: '0.55rem',
            padding: '1px 3px',
            borderRadius: '3px',
            backgroundColor: cardData.status === 'matched' ? '#10b981' : cardData.status === 'mismatch' ? '#ef4444' : '#f59e0b',
            color: '#fff',
            fontWeight: 'bold'
          }}>
            {cardData.status === 'matched' ? 'Verified' : cardData.status === 'mismatch' ? 'Mismatch' : 'Review'}
          </span>
        </div>
      )
    } else {
      return (
        <div className="wa-bubble-transcript-overlay" style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          background: 'rgba(32, 44, 51, 0.95)',
          padding: '4px 6px',
          fontSize: '0.6rem',
          color: '#e9edef',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          pointerEvents: 'none'
        }} title={msg.transcript}>
          🔍 {msg.transcript}
        </div>
      )
    }
  }

  // Single card layout
  if (cardData) {
    return (
      <div className="wa-ai-payment-card">
        <div className="wa-ai-payment-card-header">
          <span>💳</span>
          <span>AI Payment Receipt</span>
          <span className={`wa-ai-payment-card-badge ${cardData.status === 'matched' ? 'matched' : cardData.status === 'mismatch' ? 'mismatch' : 'reviewing'}`}>
            {cardData.status === 'matched' ? '✓ Verified' : cardData.status === 'mismatch' ? '⚠ Mismatch' : '🔍 Reviewing'}
          </span>
        </div>
        <div className="wa-ai-payment-card-amount">Rs. {cardData.amount}</div>
        <div className="wa-ai-payment-card-meta">
          {cardData.bank && <span>🏦 {cardData.bank}</span>}
          {cardData.txnId && <span>TXN: {cardData.txnId}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="wa-bubble-transcript" style={{ marginTop: 8 }}>
      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>🔍 OCR Result:</span>
      <span className="wa-transcript-text">{msg.transcript}</span>
    </div>
  )
}

export default ChatOCRReceipt
