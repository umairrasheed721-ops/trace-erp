const fetch = require('./fetch');
const { postexBreaker } = require('./circuit_breaker');
const API_TIMEOUT = 15000;

/**
 * Fetch registered merchant pickup locations from PostEx API
 * Official PostEx Merchant API v4.1.9: GET /services/integration/api/order/v1/get-merchant-address
 */
async function fetchPostExPickupAddresses(storeOrToken) {
  const token = typeof storeOrToken === 'string' ? storeOrToken.trim() : String(storeOrToken?.postex_token || '').trim();
  if (!token) throw new Error('PostEx Token missing for this store');

  const url = 'https://api.postex.pk/services/integration/api/order/v1/get-merchant-address';
  const response = await fetch(url, {
    method: 'GET',
    headers: { token },
    timeout: 8000,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || (String(data.statusCode) !== '200' && !Array.isArray(data.dist))) {
    throw new Error(data.statusMessage || `PostEx returned HTTP ${response.status}`);
  }

  const rawList = Array.isArray(data.dist) ? data.dist : [];
  return rawList
    .map((item) => ({
      addressCode: String(item.addressCode || item.pickupAddressCode || item.merchantAddressCode || item.code || '').trim(),
      address: String(item.address || item.pickupAddress || '').trim(),
      cityName: String(item.cityName || item.city || '').trim(),
      contactPersonName: String(item.contactPersonName || item.contactName || '').trim(),
      phone1: String(item.phone1 || item.phone || '').trim(),
      phone2: String(item.phone2 || '').trim(),
    }))
    .filter((loc) => loc.addressCode || loc.address);
}

/**
 * Creates a real booking in PostEx
 * Supports pickupAddressCode (warehouse selector) & transactionNotes (courier slip remarks)
 */
async function createPostExOrder(store, order, options = {}) {
  return postexBreaker.execute(async () => {
    const { postex_token } = store;
    if (!postex_token) throw new Error('PostEx Token missing for this store');

    const url = 'https://api.postex.pk/services/integration/api/order/v1/create-order';

    const city = (order.city || '').trim();
    const pickupCode = String(
      options.pickupAddressCode !== undefined
        ? options.pickupAddressCode
        : (order.pickup_address_code || store.postex_pickup_code || '')
    ).trim();

    const rawRemarks = options.remarks !== undefined
      ? options.remarks
      : (order.courier_remarks || store.default_courier_remarks || '');
    const transactionNotes = String(rawRemarks || '').trim().slice(0, 250);
    const itemsQty = Math.max(1, parseInt(order.items_count, 10) || 1);

    const payload = {
      customerName: order.customer_name,
      customerPhone: order.phone,
      deliveryAddress: order.address,
      cityName: city,
      orderDetail: order.product_titles || 'General Items',
      orderRefNumber: order.ref_number || String(order.shopify_order_id),
      invoicePayment: parseFloat(order.price) || 0,
      orderType: 'COD', // Default to Cash on Delivery
      items: itemsQty,
      itemsCount: itemsQty,
      weight: parseFloat(options.weight || order.postex_weight) || 0.5
    };

    if (pickupCode) {
      payload.pickupAddressCode = pickupCode;
    }
    if (transactionNotes) {
      payload.transactionNotes = transactionNotes;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'token': postex_token,
        'Content-Type': 'application/json'
      },
      timeout: API_TIMEOUT,
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.statusCode !== '200') {
      throw new Error(data.statusMessage || 'PostEx Booking Failed');
    }

    // PostEx usually returns trackingNumber in dist.trackingNumber or similar
    return data.dist?.trackingNumber || data.dist;
  });
}

/**
 * Returns the official PostEx city list (hardcoded from PostEx documentation)
 * PostEx does not have a public /get-cities API endpoint.
 */
async function fetchPostExCities(token) {
  // This is the authoritative list of cities supported by PostEx in Pakistan
  return [
    "Abbottabad","Adezai","Ali Bandar","Arifwala","Attock","Badin","Bahawalnagar",
    "Bahawalpur","Bannu","Batkhela","Bela","Bhakkar","Bhalwal","Bhimber","Burewala",
    "Chakwal","Chaman","Charsadda","Chichawatni","Chiniot","Chishtian","Dadu",
    "Daska","Daud Khel","Dera Ghazi Khan","Dera Ismail Khan","Dina","Dinga","Dipalpur",
    "Dunyapur","Faisalabad","Fateh Jang","Ghotki","Gilgit","Gojra","Gujar Khan",
    "Gujranwala","Gujrat","Guranwala","Hafizabad","Haripur","Haroonabad","Hasilpur",
    "Haveli Lakha","Hub","Hyderabad","Islamabad","Jacobabad","Jahania","Jampur",
    "Jamshoro","Jaranwala","Jatoi","Jauharabad","Jhelum","Jhang","Kamalia","Kamber",
    "Kamoke","Karachi","Kasur","Khairpur","Khanewal","Kharian","Khushab","Kohat",
    "Kotli","Kotri","Lahore","Layyah","Larkana","Lalamusa","Lodhran","Loralai",
    "Mandi Bahauddin","Mansehra","Mardan","Matiari","Mianwali","Mirpur","Mirpur Khas",
    "Mirpur Mathelo","Multan","Muridke","Muzaffarabad","Muzaffargarh","Narowal",
    "Nawabshah","Nowshera","Nankana Sahib","Okara","Pakpattan","Pasrur","Pattoki",
    "Peshawar","Quetta","RawAim Yar Khan","Rawalpindi","Sadiqabad","Sahiwal","Sambrial",
    "Sanghar","Sargodha","Sheikhupura","Shikarpur","Sialkot","Sillanwali","Sibi",
    "Sukkur","Swabi","Talagang","Taxila","Toba Tek Singh","Turbat","Umerkot","Vehari",
    "Wazirabad","Zhob"
  ];
}

/**
 * Cancel a booking in PostEx
 */
async function cancelPostExOrder(store, trackingNumber) {
  return postexBreaker.execute(async () => {
    const { postex_token } = store;
    if (!postex_token) throw new Error('PostEx Token missing');

    const url = 'https://api.postex.pk/services/integration/api/order/v1/cancel-order';
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 
        'token': postex_token,
        'Content-Type': 'application/json'
      },
      timeout: API_TIMEOUT,
      body: JSON.stringify({ trackingNumber })
    });

    const data = await response.json().catch(() => ({}));
    if (String(data.statusCode) === '200') {
      return true;
    }
    const msg = String(data.statusMessage || data.message || '').trim();
    // Treat already-cancelled orders on PostEx as cleanly cancelled so ERP doesn't stay stuck
    if (/already\s+cancel/i.test(msg) || /order\s+cancelled/i.test(msg)) {
      console.log(`ℹ️ [PostEx Cancel] ${trackingNumber} already cancelled on PostEx (${msg}).`);
      return true;
    }
    throw new Error(msg || `PostEx rejected cancellation (statusCode: ${data.statusCode || response.status})`);
  });
}

module.exports = { createPostExOrder, fetchPostExCities, cancelPostExOrder, fetchPostExPickupAddresses };
