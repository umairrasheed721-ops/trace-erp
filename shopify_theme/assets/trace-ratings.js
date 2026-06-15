/**
 * trace-ratings.js
 * 
 * Batch-loads star ratings for all product cards on the collection page.
 * Finds all [data-handle] elements, batches the handles, calls our API,
 * then renders mini star badges inline.
 * 
 * Include once in theme.liquid or featured-collection.liquid
 */

(function () {
  var BACKEND = 'https://trace-erp-production.up.railway.app';

  function renderMiniStars(avg) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      var color = i <= Math.round(avg) ? '#FFD700' : '#ddd';
      html += '<span style="color:' + color + ';font-size:13px;line-height:1;">★</span>';
    }
    return html;
  }

  function loadCardRatings() {
    var cards = document.querySelectorAll('.trace-card-rating[data-handle]');
    if (!cards.length) return;

    // Collect unique handles
    var handles = [];
    var handleMap = {};
    cards.forEach(function (el) {
      var h = el.getAttribute('data-handle');
      if (h && !handleMap[h]) {
        handles.push(h);
        handleMap[h] = [];
      }
      if (h) handleMap[h].push(el);
    });

    if (!handles.length) return;

    // Batch: split into chunks of 20 to avoid long URLs
    var chunkSize = 20;
    for (var i = 0; i < handles.length; i += chunkSize) {
      var chunk = handles.slice(i, i + chunkSize);
      (function (chunk) {
        var url = BACKEND + '/api/public/reviews?handles=' + encodeURIComponent(chunk.join(',')) + '&limit=1&page=1';
        fetch(url)
          .then(function (r) { return r.json(); })
          .then(function (json) {
            if (!json.success || !json.data) return;
            var summary = json.data.summary;
            if (!summary || summary.total === 0) return;

            // The API returns combined summary for all handles
            // We apply it to all cards in the chunk
            var avg = parseFloat(summary.avg) || 0;
            var total = summary.total || 0;
            if (avg < 1 || total === 0) return;

            var badge =
              renderMiniStars(avg) +
              '<span style="font-size:12px;color:#888;font-weight:500;letter-spacing:0.3px;">' +
              avg.toFixed(1) +
              ' <span style="opacity:0.5;">(' + total + ')</span></span>';

            chunk.forEach(function (h) {
              if (handleMap[h]) {
                handleMap[h].forEach(function (el) {
                  el.innerHTML = badge;
                });
              }
            });
          })
          .catch(function () { /* silent — ratings are non-critical */ });
      })(chunk);
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCardRatings);
  } else {
    loadCardRatings();
  }

  // Re-run when Shopify section refreshes (e.g. infinite scroll, filters)
  document.addEventListener('shopify:section:load', function () {
    setTimeout(loadCardRatings, 300);
  });
})();
