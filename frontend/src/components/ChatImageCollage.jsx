import React from 'react'
import ChatOCRReceipt from './ChatOCRReceipt'

const ChatImageCollage = ({
  msg,
  items,
  copyId,
  getMediaUrlWithToken,
  setLightbox,
  handleCopySingleImage,
  handleCopyMultipleImages,
  copyStatus
}) => {
  if (!items || items.length <= 1) return null

  const is3Images = items.length === 3
  const is2Images = items.length === 2
  const urls = items.map(item => getMediaUrlWithToken(item.url))

  let gridStyle = {
    display: 'grid',
    gap: '4px',
    maxWidth: '300px',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)'
  }

  if (is2Images) {
    gridStyle.gridTemplateColumns = '1fr 1fr'
    gridStyle.gridTemplateRows = '1fr'
    gridStyle.height = '150px'
  } else if (is3Images) {
    gridStyle.gridTemplateColumns = '1.2fr 1fr'
    gridStyle.gridTemplateRows = '1fr 1fr'
    gridStyle.height = '240px'
  } else {
    // 4+ images
    gridStyle.gridTemplateColumns = '1fr 1fr'
    gridStyle.gridTemplateRows = '1fr 1fr'
    gridStyle.height = '240px'
  }

  return (
    <div style={{ width: '100%' }}>
      <div className="media-grid-wrapper" style={gridStyle}>
        {items.slice(0, 4).map((item, idx) => {
          const isFourthOfMany = items.length >= 4 && idx === 3
          const hasMore = items.length > 4
          const cellId = item.id

          let cellStyle = {
            position: 'relative',
            height: '100%',
            width: '100%',
            overflow: 'hidden'
          }

          if (is3Images) {
            if (idx === 0) {
              cellStyle.gridRow = '1 / 3'
              cellStyle.gridColumn = '1 / 2'
            } else {
              cellStyle.gridColumn = '2 / 3'
            }
          }

          return (
            <div key={cellId} className="wa-collage-cell" style={cellStyle}>
              <img 
                src={getMediaUrlWithToken(item.url)} 
                alt={`Collage ${idx}`} 
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onClick={() => setLightbox({ images: urls, currentIndex: idx })}
              />
              <button 
                type="button"
                className="wa-collage-copy-btn" 
                title="Copy Image"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCopySingleImage(getMediaUrlWithToken(item.url), cellId)
                }}
              >
                📋
              </button>
              {copyStatus.id === cellId && (
                <div className="wa-copy-feedback-overlay">
                  {copyStatus.text}
                </div>
              )}
              {isFourthOfMany && hasMore && (
                <div 
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '1.4rem',
                    fontWeight: 'bold',
                    pointerEvents: 'none'
                  }}
                >
                  +{items.length - 3}
                </div>
              )}
              {/* Parse OCR transcript for payment receipt inside grid items */}
              <ChatOCRReceipt msg={item.rawItem} isOverlay={true} />
            </div>
          )
        })}
      </div>
      <div className="wa-collage-group-actions">
        <button 
          type="button"
          className="wa-collage-action-btn"
          onClick={(e) => {
            e.stopPropagation()
            handleCopyMultipleImages(urls, `${copyId}${msg.id}`, 'images')
          }}
        >
          📋 {copyStatus.id === `${copyId}${msg.id}` && copyStatus.text.includes('Copied') ? copyStatus.text : 'Copy Images'}
        </button>
        <button 
          type="button"
          className="wa-collage-action-btn"
          onClick={(e) => {
            e.stopPropagation()
            handleCopyMultipleImages(urls, `${copyId}${msg.id}`, 'links')
          }}
        >
          🔗 Copy Links
        </button>
      </div>
    </div>
  )
}

export default ChatImageCollage
