function getOrderFilters(req) {
  const { store_id, status, search, courier, start_date, end_date } = req.query;
  let queryParams = [Number(store_id)];
  let whereClauses = ['o.store_id = ?'];

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
        AND o.status_date < datetime('now', '+5 hours', '-48 hours')
        AND o.tracking_number NOT IN (SELECT tracking_number FROM blacklist WHERE store_id = o.store_id)
      `);
    } else if (s.includes('[PAID]')) {
      whereClauses.push("o.payment_status = 'Paid'");
    } else if (s.includes('READY TO BOOK')) {
      whereClauses.push("LOWER(o.delivery_status) = 'confirmed' AND (o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—')");
    } else if (s.includes('NO TRACKING')) {
      whereClauses.push("(o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—') AND LOWER(o.delivery_status) != 'cancelled'");
    } else if (s.includes('UNPAID DELIVERED')) {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND (o.paid_amount IS NULL OR o.paid_amount < 1)");
    } else if (s.includes('MISSING COST')) {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND (o.cost IS NULL OR o.cost = 0) AND o.items_count > 0");
    } else if (s.includes('OVERDUE PAYOUT')) {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND (o.payment_status != 'Paid' AND o.payment_status != 'Payment Posted' OR o.payment_status IS NULL) AND (julianday('now', '+5 hours') - julianday(COALESCE(o.status_date, o.order_date))) > 10");
    } else if (s.includes('MISSING CHARGES')) {
      whereClauses.push("(o.courier_fee IS NULL OR o.courier_fee < 1) AND LOWER(o.delivery_status) NOT IN ('pending', 'cancelled') AND o.tracking_number IS NOT NULL AND o.tracking_number != ''");
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
  if (start_date) { whereClauses.push('date(o.order_date) >= ?'); queryParams.push(start_date); }
  if (end_date) { whereClauses.push('date(o.order_date) <= ?'); queryParams.push(end_date); }
  
  if (search && search.trim()) {
    const kw = search.trim().toLowerCase().replace(/^#/, '');
    if (!kw) return { where: whereClauses.join(' AND '), queryParams };
    
    // Detect Bulk ID Search (Multiple space/newline separated IDs)
    const spaceTokens = kw.split(/[\s,\n\t]+/).filter(Boolean);
    const isBulkIDSearch = spaceTokens.length > 1 && spaceTokens.every(t => /^[a-z0-9#-]{4,}$/.test(t) && /\d/.test(t));

    if (isBulkIDSearch) {
      const orClauses = spaceTokens.map(() => '(o.tracking_number = ? OR o.ref_number = ? OR o.shopify_order_id = ?)').join(' OR ');
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
          const target = ['city','phone','email','courier','ref','status','note'].includes(field) ? field : null;
          if (target === 'city') clause = 'o.city LIKE ?';
          else if (target === 'phone') clause = 'o.phone LIKE ?';
          else if (target === 'email') clause = 'o.email LIKE ?';
          else if (target === 'courier') clause = 'o.courier LIKE ?';
          else if (target === 'status') clause = 'o.delivery_status LIKE ?';
          else if (target === 'note') clause = 'o.notes LIKE ?';
          else if (target === 'ref') clause = '(o.ref_number LIKE ? OR o.shopify_order_id LIKE ?)';
          
          if (clause) {
            whereClauses.push(isNegated ? `NOT (${clause})` : clause);
            if (target === 'phone') {
              const digits = value.replace(/\D/g, '');
              const cleanVal = digits.length >= 10 ? digits.slice(-10) : digits;
              queryParams.push(`%${cleanVal}%`);
            } else if (target === 'ref') {
              queryParams.push(`%${value}%`, `%${value}%`);
            } else {
              queryParams.push(`%${value}%`);
            }
          }
        } else {
          clause = '(o.tracking_number LIKE ? OR o.customer_name LIKE ? OR o.ref_number LIKE ? OR o.shopify_order_id LIKE ? OR o.phone LIKE ? OR o.email LIKE ? OR o.product_titles LIKE ?)';
          whereClauses.push(isNegated ? `NOT (${clause})` : clause);
          const searchVal = `%${actualToken}%`;
          
          let phoneSearchVal = searchVal;
          if (/^\+?\d+$/.test(actualToken) || (actualToken.startsWith('+') && /^\d+$/.test(actualToken.slice(1)))) {
            const digits = actualToken.replace(/\D/g, '');
            if (digits.length >= 10) {
              phoneSearchVal = `%${digits.slice(-10)}%`;
            } else {
              phoneSearchVal = `%${digits}%`;
            }
          }
          queryParams.push(searchVal, searchVal, searchVal, searchVal, phoneSearchVal, searchVal, searchVal);
        }
      });
    }
  }

  // Column-specific filters
  ['ref_number', 'customer_name', 'city', 'phone', 'email', 'courier', 'tracking_number', 'notes'].forEach(field => {
    if (req.query[field]) {
      const val = req.query[field].toLowerCase().trim();
      const terms = val.split(/[\s,]+/).filter(Boolean);
      if (terms.length > 0) {
        const orClauses = terms.map(() => `LOWER(o.${field}) LIKE ?`).join(' OR ');
        whereClauses.push(`(${orClauses})`);
        terms.forEach(t => {
          if (field === 'phone') {
            const digits = t.replace(/\D/g, '');
            const cleanVal = digits.length >= 10 ? digits.slice(-10) : digits;
            queryParams.push(`%${cleanVal}%`);
          } else {
            queryParams.push(`%${t}%`);
          }
        });
      }
    }
  });

  return { where: whereClauses.join(' AND '), queryParams };
}

module.exports = {
  getOrderFilters
};
