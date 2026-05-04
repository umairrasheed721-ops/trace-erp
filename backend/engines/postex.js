const fetch = require('node-fetch');
const API_TIMEOUT = 15000;

/**
 * Creates a real booking in PostEx
 */
async function createPostExOrder(store, order) {
  const { postex_token } = store;
  if (!postex_token) throw new Error('PostEx Token missing for this store');

  const url = 'https://api.postex.pk/services/integration/api/order/v1/create-order';

  // Basic City Mapping (Simple for now, can be expanded)
  const city = (order.city || '').trim();

  const payload = {
    customerName: order.customer_name,
    customerPhone: order.phone,
    address: order.address,
    cityName: city,
    orderDetail: order.product_titles || 'General Items',
    orderRefNumber: order.ref_number || String(order.shopify_order_id),
    orderAmount: parseFloat(order.price) || 0,
    orderType: 'COD', // Default to Cash on Delivery
    itemsCount: order.items_count || 1,
    weight: order.postex_weight || 0.5
  };

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
    "Peshawar","Quetta","Rahim Yar Khan","Rawalpindi","Sadiqabad","Sahiwal","Sambrial",
    "Sanghar","Sargodha","Sheikhupura","Shikarpur","Sialkot","Sillanwali","Sibi",
    "Sukkur","Swabi","Talagang","Taxila","Toba Tek Singh","Turbat","Umerkot","Vehari",
    "Wazirabad","Zhob"
  ];
}

/**
 * Cancel a booking in PostEx
 */
async function cancelPostExOrder(store, trackingNumber) {
  const { postex_token } = store;
  if (!postex_token) throw new Error('PostEx Token missing');

  const url = 'https://api.postex.pk/services/integration/api/order/v1/cancel-order';
  const response = await fetch(`${url}?trackingNumber=${trackingNumber}`, {
    method: 'POST',
    headers: { 'token': postex_token },
    timeout: API_TIMEOUT
  });

  const data = await response.json();
  // If statusCode is 200, it's successful
  return data.statusCode === '200';
}

module.exports = { createPostExOrder, fetchPostExCities, cancelPostExOrder };
