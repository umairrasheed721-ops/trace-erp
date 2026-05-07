const fs = require('fs');
let code = fs.readFileSync('frontend/src/pages/SearchTool.jsx', 'utf8');

// We need to add AbortController to the fetch orders useEffect.
// Find the useEffect for fetching orders.
const searchTarget = `  // Load all orders for the active store (we filter client-side for instant search)
  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)`;

const replacement = `  // Load all orders for the active store (we filter client-side for instant search)
  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)
    
    const controller = new AbortController();
    const signal = controller.signal;`;

code = code.replace(searchTarget, replacement);

const fetchTarget = `    fetch(\`/api/orders?store_id=\${activeStoreId}&limit=\${limit}&page=\${page}&status=\${encodeURIComponent(queryStatus||'')}&search=\${encodeURIComponent(kw)}&start_date=\${startDate}&end_date=\${endDate}&sort=\${sCol}&sort_dir=\${sortDir}\${colFilterParams}&t=\${Date.now()}\`)
      .then(r => r.json())
      .then(data => { 
        setAllOrders(data.orders || []); 
        setTotalCount(data.total || 0);
        setDebugWhere(data.debugWhere || '');
        setLoading(false) 
      })
      .catch(() => { addToast('Failed to load orders', 'error'); setLoading(false) })
  }, [activeStoreId, status, debouncedKeyword, preset, customStart, customEnd, page, debouncedColFilters, sortKey, sortDir])`;

const fetchReplacement = `    fetch(\`/api/orders?store_id=\${activeStoreId}&limit=\${limit}&page=\${page}&status=\${encodeURIComponent(queryStatus||'')}&search=\${encodeURIComponent(kw)}&start_date=\${startDate}&end_date=\${endDate}&sort=\${sCol}&sort_dir=\${sortDir}\${colFilterParams}&t=\${Date.now()}\`, { signal })
      .then(r => r.json())
      .then(data => { 
        setAllOrders(data.orders || []); 
        setTotalCount(data.total || 0);
        setDebugWhere(data.debugWhere || '');
        setLoading(false) 
      })
      .catch((err) => { 
        if (err.name === 'AbortError') return;
        addToast('Failed to load orders', 'error'); setLoading(false) 
      })
      
      return () => controller.abort();
  }, [activeStoreId, status, debouncedKeyword, preset, customStart, customEnd, page, debouncedColFilters, sortKey, sortDir])`;

code = code.replace(fetchTarget, fetchReplacement);

// Also fix initial state if location.state exists so it doesn't even trigger the first fetch with wrong params!
const stateTarget = `  const [preset, setPreset] = useState('Last Month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [status, setStatus] = useState('[ACTIVE PIPELINE]')
  const [keyword, setKeyword] = useState('')`;

const stateReplacement = `  const [preset, setPreset] = useState(location.state?.preset || 'Last Month')
  const [customStart, setCustomStart] = useState(location.state?.customStart || '')
  const [customEnd, setCustomEnd] = useState(location.state?.customEnd || '')
  const [status, setStatus] = useState(location.state?.status || '[ACTIVE PIPELINE]')
  const [keyword, setKeyword] = useState(location.state?.keyword || '')`;

code = code.replace(stateTarget, stateReplacement);

fs.writeFileSync('frontend/src/pages/SearchTool.jsx', code);
console.log('Patched');
