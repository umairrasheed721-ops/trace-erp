function getOrderFilters(req) {
  const { store_id, status, search, courier, start_date, end_date, global_search } = req.query;
  let queryParams = [];
  let whereClauses = [];

  if (global_search === 'true') {
    // Cross-store lookup enabled: do not restrict to o.store_id = ?
  } else {
    queryParams.push(Number(store_id));
    whereClauses.push('o.store_id = ?');
  }

  if (status && status !== 'All Statuses' && status !== '') {
    const s = status.toUpperCase().trim();
    if (s.includes('ACTIVE PIPELINE')) {
      whereClauses.push("o.tracking_number IS NOT NULL AND o.tracking_number != '' AND o.tracking_number != '—' AND LOWER(o.delivery_status) NOT IN ('delivered', 'return received', 'cancelled', 'returned', 'void', 'voided')");
    } else if (s.includes('UNBOOKED')) {
      whereClauses.push("(o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—') AND LOWER(o.delivery_status) NOT IN ('delivered', 'return received', 'cancelled', 'returned', 'void', 'voided')");
    } else if (s.includes('[RETURNED]')) {
      whereClauses.push("LOWER(o.delivery_status) IN ('return received', 'returned')");
    } else if (s.includes('[STUCK PIPELINE]')) {
      whereClauses.push(`
        o.tracking_number IS NOT NULL AND o.tracking_number != ''
        AND LOWER(o.delivery_status) NOT IN ('delivered','return received','paid','pending','cancelled','returned','void','voided')
        AND datetime(COALESCE(o.status_date, o.order_date)) < datetime('now', '-48 hours')
        AND o.tracking_number NOT IN (SELECT tracking_number FROM blacklist WHERE store_id = o.store_id)
      `);
    } else if (s.includes('[WATCHDOG FRAUD]')) {
      whereClauses.push(`
        o.tracking_number IN (
          SELECT tracking_number 
          FROM watchdog_results 
          WHERE store_id = o.store_id AND verdict LIKE '%FAKE%'
        )
      `);
    } else if (s.includes('[PAID]')) {
      whereClauses.push("o.paid_amount > 0 AND (o.payment_status IN ('Paid', 'Payment Posted') OR LOWER(o.delivery_status) = 'delivered')");
    } else if (s.includes('SURPLUS PAYOUT')) {
      whereClauses.push("o.paid_amount > 0.9 AND ((LOWER(o.delivery_status) = 'delivered' AND (COALESCE(o.paid_amount, 0) - COALESCE(o.price, 0)) > 0.9) OR (LOWER(o.delivery_status) != 'delivered'))");
    } else if (s.includes('[WHATSAPP ONLY]')) {
      whereClauses.push("LOWER(COALESCE(o.tags, '')) LIKE '%whatsapp%' AND LOWER(COALESCE(o.tags, '')) NOT LIKE '%whatsapp%funnel%'");
    } else if (s.includes('READY TO BOOK')) {
      whereClauses.push("LOWER(o.delivery_status) = 'confirmed' AND (o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—')");
    } else if (s.includes('NO TRACKING')) {
      whereClauses.push("(o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—') AND LOWER(o.delivery_status) != 'cancelled'");
    } else if (s.includes('UNPAID DELIVERED')) {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND ABS(COALESCE(o.price, 0) - COALESCE(o.paid_amount, 0)) > 0.9 AND (o.payment_status IS NULL OR (o.payment_status != 'Payment Posted' AND o.payment_status != 'Refunded' AND o.payment_status != 'Returned'))");
    } else if (s.includes('MISSING COST')) {
      whereClauses.push("LOWER(o.delivery_status) NOT IN ('cancelled', 'returned', 'return received', 'rto') AND (o.cost IS NULL OR o.cost = 0) AND o.items_count > 0");
    } else if (s.includes('OVERDUE PAYOUT')) {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND ABS(COALESCE(o.price, 0) - COALESCE(o.paid_amount, 0)) > 0.9 AND (o.payment_status IS NULL OR o.payment_status != 'Payment Posted') AND (julianday('now') - julianday(datetime(COALESCE(o.status_date, o.order_date)))) > 10");
    } else if (s.includes('MISSING CHARGES')) {
      whereClauses.push("(o.courier_fee IS NULL OR o.courier_fee < 1) AND LOWER(o.delivery_status) NOT IN ('pending', 'cancelled') AND o.tracking_number IS NOT NULL AND o.tracking_number != ''");
    } else if (s.includes('[IN TRANSIT]') || s === 'transit' || s.includes('in transit')) {
      whereClauses.push("o.tracking_number IS NOT NULL AND o.tracking_number != '' AND LOWER(o.delivery_status) IN ('shipped', 'out for delivery', 'in transit', 'attempted', 'shipper advice', 'return initiated', 'return in transit', 'reattempt requested', 'undelivered', 'dispatched', 'refused', 'delivery under review', 'failed', 'rto')");
    } else {
      const statuses = status.split(',').map(st => st.trim().toLowerCase());
      if (statuses.length > 1) {
        whereClauses.push(`LOWER(o.delivery_status) IN (${statuses.map(() => '?').join(',')})`);
        statuses.forEach(st => queryParams.push(st));
      } else {
        whereClauses.push('LOWER(o.delivery_status) = ?');
        queryParams.push(statuses[0]);
      }
    }
  }

  if (courier) { whereClauses.push('LOWER(o.courier) = ?'); queryParams.push(courier.toLowerCase()); }
  if (start_date) { whereClauses.push("date(COALESCE(NULLIF(o.order_date,''), o.created_timestamp)) >= ?"); queryParams.push(start_date); }
  if (end_date) { whereClauses.push("date(COALESCE(NULLIF(o.order_date,''), o.created_timestamp)) <= ?"); queryParams.push(end_date); }
  
  if (search && search.trim()) {
    const rawSearch = search.trim();

    // 1. Unify field prefix spacing (e.g. "phone: 0333..." -> "phone:0333...")
    let cleanKw = rawSearch.replace(/\b(phone|city|email|ref|status|note|tag|tags|courier):\s+/gi, '$1:');

    // 2. Normalize phone numbers: if the entire query is digits & phone punctuation (e.g. "+92 333 5149718", "0333 514 9718", "0333-514-9718")
    const allDigits = cleanKw.replace(/\D/g, '');
    const isPurePhoneOrNumeric = /^[\d\s+\-().]+$/.test(cleanKw) && allDigits.length >= 7;

    if (isPurePhoneOrNumeric) {
      // Standardize 10+ digit phone numbers to standard 11-digit "03xxxxxxxxx" representation so spaces don't shatter tokens
      if (allDigits.length >= 10) {
        cleanKw = '0' + allDigits.slice(-10);
      } else {
        cleanKw = allDigits;
      }
    } else {
      // 3. For mixed queries (e.g. "Rubab +92 333 5149718"), collapse spaces/hyphens in any embedded phone numbers
      const pakPhoneRegex = /(?:(?:\+|00)?92[\s\-.]*|0)?3\d{2}[\s\-.]*\d{3}[\s\-.]*\d{4}/gi;
      cleanKw = cleanKw.replace(pakPhoneRegex, (m) => {
        const d = m.replace(/\D/g, '');
        return d.length >= 10 ? '0' + d.slice(-10) : d;
      });
    }

    const kw = cleanKw.toLowerCase().replace(/^#/, '');
    if (!kw) return { where: whereClauses.join(' AND '), queryParams };
    
    // Detect Bulk ID Search (Multiple space/newline separated IDs)
    const spaceTokens = kw.split(/[\s,\n\t]+/).filter(Boolean);
    const isBulkIDSearch = spaceTokens.length > 1 && spaceTokens.every(t => /^[a-z0-9#-]{4,}$/.test(t) && /\d/.test(t));

    if (isBulkIDSearch) {
      const orClauses = spaceTokens.map(() => '(LOWER(o.tracking_number) = ? OR LOWER(o.ref_number) = ? OR LOWER(o.shopify_order_id) = ?)').join(' OR ');
      whereClauses.push(`(${orClauses})`);
      spaceTokens.forEach(t => queryParams.push(t, t, t));
    } else {
      const tokens = kw.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || [];
      tokens.forEach(token => {
        token = token.replace(/['"]/g, '');
        const isNegated = token.startsWith('-');
        const actualToken = isNegated ? token.slice(1) : token;
        if (!actualToken) return;

        let clause = '';
        if (actualToken.includes(':')) {
          const [field, value] = actualToken.split(':');
          const target = ['city','phone','email','courier','ref','status','note','tag','tags'].includes(field) ? field : null;
          if (target === 'city') clause = 'o.city LIKE ?';
          else if (target === 'phone') clause = '(o.phone LIKE ? OR REPLACE(REPLACE(REPLACE(REPLACE(o.phone, \' \', \'\'), \'-\', \'\'), \'+\', \'\'), \'(\', \'\') LIKE ?)';
          else if (target === 'email') clause = 'o.email LIKE ?';
          else if (target === 'courier') clause = 'o.courier LIKE ?';
          else if (target === 'status') clause = 'o.delivery_status LIKE ?';
          else if (target === 'note') clause = 'o.notes LIKE ?';
          else if (target === 'tag' || target === 'tags') clause = 'o.tags LIKE ?';
          else if (target === 'ref') clause = '(o.ref_number LIKE ? OR o.shopify_order_id LIKE ?)';
          
          if (clause) {
            whereClauses.push(isNegated ? `NOT (${clause})` : clause);
            if (target === 'phone') {
              const digits = value.replace(/\D/g, '');
              const cleanVal = digits.length >= 10 ? digits.slice(-10) : digits;
              queryParams.push(`%${cleanVal}%`, `%${cleanVal}%`);
            } else if (target === 'ref') {
              queryParams.push(`%${value}%`, `%${value}%`);
            } else {
              queryParams.push(`%${value}%`);
            }
          }
        } else {
          clause = '(o.tracking_number LIKE ? OR o.customer_name LIKE ? OR o.ref_number LIKE ? OR o.shopify_order_id LIKE ? OR o.phone LIKE ? OR REPLACE(REPLACE(REPLACE(REPLACE(o.phone, \' \', \'\'), \'-\', \'\'), \'+\', \'\'), \'(\', \'\') LIKE ? OR o.email LIKE ? OR o.product_titles LIKE ? OR o.tags LIKE ?)';
          whereClauses.push(isNegated ? `NOT (${clause})` : clause);
          const searchVal = `%${actualToken}%`;
          
          let phoneSearchVal = searchVal;
          let cleanPhoneDigits = searchVal;
          const rawDigits = actualToken.replace(/\D/g, '');
          if (rawDigits.length >= 7 || /^\+?\d+$/.test(actualToken) || (actualToken.startsWith('+') && /^\d+$/.test(actualToken.slice(1)))) {
            const last10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
            phoneSearchVal = `%${last10}%`;
            cleanPhoneDigits = `%${last10}%`;
          }
          queryParams.push(searchVal, searchVal, searchVal, searchVal, phoneSearchVal, cleanPhoneDigits, searchVal, searchVal, searchVal);
        }
      });
    }
  }

  if (req.query.tag && req.query.tag.trim()) {
    whereClauses.push("LOWER(o.tags) LIKE ?");
    queryParams.push(`%${req.query.tag.trim().toLowerCase()}%`);
  }

  // Column-specific filters
  ['ref_number', 'customer_name', 'city', 'phone', 'email', 'courier', 'tracking_number', 'notes', 'tags'].forEach(field => {
    if (req.query[field]) {
      const val = req.query[field].toLowerCase().trim();
      const terms = (field === 'phone')
        ? val.split(',').map(t => t.trim()).filter(Boolean)
        : val.split(/[\s,]+/).filter(Boolean);

      if (terms.length > 0) {
        if (field === 'phone') {
          const phoneClauses = [];
          terms.forEach(t => {
            const digits = t.replace(/\D/g, '');
            const cleanVal = digits.length >= 10 ? digits.slice(-10) : digits;
            phoneClauses.push('(LOWER(o.phone) LIKE ? OR REPLACE(REPLACE(REPLACE(REPLACE(o.phone, " ", ""), "-", ""), "+", ""), "(", "") LIKE ?)');
            queryParams.push(`%${cleanVal}%`, `%${cleanVal}%`);
          });
          whereClauses.push(`(${phoneClauses.join(' OR ')})`);
        } else {
          const orClauses = terms.map(() => `LOWER(o.${field}) LIKE ?`).join(' OR ');
          whereClauses.push(`(${orClauses})`);
          terms.forEach(t => {
            queryParams.push(`%${t}%`);
          });
        }
      }
    }
  });

  return { where: whereClauses.join(' AND '), queryParams };
}

module.exports = {
  getOrderFilters
};
