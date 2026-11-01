/**
 * 📸 orderSummaryCard.js
 * Generates a high-res, multi-product order summary canvas card
 * and writes it directly to the OS clipboard as a PNG image for instant pasting into WhatsApp.
 * 
 * Supports:
 * - 1 item: full-width hero card
 * - 2-4 items: 2-column grid
 * - 5+ items: 3-column grid
 * - Product images, titles, variant titles (size/color), quantities
 * - Order reference number, customer name, total COD amount
 * - Automatic CORS-safe image preloading with timeouts
 * - Direct writing to navigator.clipboard
 */

export async function copyOrderPhotoCard(order, options = {}) {
  const isBool = typeof options === 'boolean'
  const showToast = isBool ? options : (options.showToast ?? false)
  const addToast = (!isBool && options?.addToast) ? options.addToast : null
  const storeName = (!isBool && options?.storeName) ? options.storeName : 'TRACE PK'

  try {
    if (!order) return false

    // Parse line items safely
    let items = []
    if (order.line_items_parsed && order.line_items_parsed.length > 0) {
      items = order.line_items_parsed
    } else if (order.line_items) {
      items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items
    }

    if (!items || items.length === 0) {
      // Fallback: if product_titles exists but line_items is empty, synthesize basic items
      if (order.product_titles) {
        items = order.product_titles.split(',').map(t => ({
          title: t.trim(),
          quantity: 1
        })).filter(it => it.title)
      }
    }

    if (!items || items.length === 0) {
      if (showToast && addToast) addToast('⚠️ No product items found for this order', 'warning')
      return false
    }

    // Preload product images safely with timeout
    const loadImg = (url) => new Promise((resolve) => {
      if (!url) return resolve(null)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      let done = false
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(null) }
      }, 3000)
      img.onload = () => {
        if (!done) { done = true; clearTimeout(timer); resolve(img) }
      }
      img.onerror = () => {
        if (!done) { done = true; clearTimeout(timer); resolve(null) }
      }
      img.src = url
    })

    const loadedImgs = await Promise.all(
      items.map(it => loadImg(it.image_url || it.image || it.src || it.img))
    )

    // Canvas Dimensions & Layout Setup
    const canvasW = 800
    const padding = 20
    const gap = 16
    const headerH = 82
    const footerH = 36

    const cols = items.length === 1 ? 1 : items.length <= 4 ? 2 : 3
    const rows = Math.ceil(items.length / cols)

    const cardW = Math.floor((canvasW - (padding * 2) - ((cols - 1) * gap)) / cols)
    const imgH = cols === 1 ? 260 : cols === 2 ? 220 : 170
    const textH = 75
    const cardH = imgH + textH

    const totalH = padding * 2 + headerH + (rows * cardH) + ((rows - 1) * gap) + footerH

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = totalH
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    // Safe rounded rectangle drawing helper
    const roundedRect = (x, y, w, h, r) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }

    // Base Canvas Fill (Clean solid white)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasW, totalH)

    // Outer Card Border
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 2
    roundedRect(1, 1, canvasW - 2, totalH - 2, 16)
    ctx.stroke()

    // Header Bar (Slate Dark theme)
    ctx.fillStyle = '#0f172a'
    roundedRect(padding, padding, canvasW - (padding * 2), headerH, 12)
    ctx.fill()

    // Header Brand & Order #
    ctx.fillStyle = '#94a3b8'
    ctx.font = '700 11px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'left'
    const brandLabel = `${(storeName || 'TRACE PK').toUpperCase()} • ORDER VERIFICATION`
    ctx.fillText(brandLabel, padding + 16, padding + 28)

    ctx.fillStyle = '#ffffff'
    ctx.font = '800 22px system-ui, -apple-system, sans-serif'
    const rawRef = order.ref_number || order.shopify_order_id || order.id || ''
    const cleanRef = String(rawRef).startsWith('#') ? rawRef : `#${rawRef}`
    ctx.fillText(cleanRef, padding + 16, padding + 58)

    // Header Right (Customer Name & Price)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '600 13px system-ui, -apple-system, sans-serif'
    const custName = (order.customer_name || 'Customer').slice(0, 26)
    ctx.fillText(`Customer: ${custName}`, canvasW - padding - 16, padding + 30)

    const rawPrice = order.price ? parseInt(order.price, 10) : 0
    if (rawPrice > 0) {
      ctx.fillStyle = '#22c55e'
      ctx.font = '800 16px system-ui, -apple-system, sans-serif'
      ctx.fillText(`Total: Rs. ${rawPrice.toLocaleString()}`, canvasW - padding - 16, padding + 58)
    }

    // Draw Individual Product Item Cards
    items.forEach((it, idx) => {
      const c = idx % cols
      const r = Math.floor(idx / cols)
      const cx = padding + c * (cardW + gap)
      const cy = padding + headerH + gap + r * (cardH + gap)

      // Card Container Background
      ctx.fillStyle = '#f8fafc'
      roundedRect(cx, cy, cardW, cardH, 10)
      ctx.fill()
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1
      ctx.stroke()

      // Inner Image Box
      const img = loadedImgs[idx]
      const imgBoxW = cardW - 20
      const imgBoxH = imgH - 16
      const imgBoxX = cx + 10
      const imgBoxY = cy + 10

      ctx.fillStyle = '#ffffff'
      roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 8)
      ctx.fill()

      if (img && img.naturalWidth && img.naturalHeight) {
        const scale = Math.min((imgBoxW - 12) / img.naturalWidth, (imgBoxH - 12) / img.naturalHeight)
        const dw = img.naturalWidth * scale
        const dh = img.naturalHeight * scale
        const dx = imgBoxX + (imgBoxW - dw) / 2
        const dy = imgBoxY + (imgBoxH - dh) / 2
        ctx.drawImage(img, dx, dy, dw, dh)
      } else {
        ctx.fillStyle = '#94a3b8'
        ctx.font = '28px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('🛍️', imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2 + 10)
      }

      // Product Title
      ctx.textAlign = 'center'
      ctx.fillStyle = '#0f172a'
      ctx.font = '700 13px system-ui, -apple-system, sans-serif'
      const rawTitle = it.title || it.name || 'Product'
      const titleStr = rawTitle.length > 34 ? rawTitle.slice(0, 32) + '...' : rawTitle
      ctx.fillText(titleStr, cx + cardW / 2, cy + imgH + 20)

      // Variant Title (Color / Size)
      const variantStr = it.variant_title || it.variant || ''
      if (variantStr) {
        ctx.fillStyle = '#6366f1'
        ctx.font = '700 12px system-ui, -apple-system, sans-serif'
        const vText = variantStr.length > 30 ? variantStr.slice(0, 28) + '...' : variantStr
        ctx.fillText(vText, cx + cardW / 2, cy + imgH + 39)
      }

      // Quantity Badge
      ctx.fillStyle = '#64748b'
      ctx.font = '600 11px system-ui, -apple-system, sans-serif'
      ctx.fillText(`Qty: ${it.quantity || 1}`, cx + cardW / 2, cy + imgH + (variantStr ? 56 : 40))
    })

    // Footer
    ctx.textAlign = 'center'
    ctx.fillStyle = '#94a3b8'
    ctx.font = '500 11px system-ui, -apple-system, sans-serif'
    ctx.fillText('📦 Verified Order Summary • Customer Support', canvasW / 2, totalH - 14)

    // Convert Canvas to Blob and Write directly to System Clipboard
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (blob && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      if (showToast && addToast) {
        addToast('📋 Order summary card copied to clipboard! Paste in WhatsApp with Ctrl+V', 'success')
      }
      return true
    }
    return false
  } catch (err) {
    console.warn('Failed to copy order photo card:', err)
    if (showToast && addToast) {
      addToast('⚠️ Could not copy image card to clipboard', 'warning')
    }
    return false
  }
}
