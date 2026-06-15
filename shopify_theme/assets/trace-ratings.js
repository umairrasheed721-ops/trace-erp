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
    var rounded = Math.round(avg || 0);
    for (var i = 1; i <= 5; i++) {
      var color = i <= rounded ? '#FFD700' : '#ddd';
      html += '<span style="color:' + color + ';font-size:13px;line-height:1;">★</span>';
    }
    return html;
  }

  function loadCardRatings() {
    var cards = document.querySelectorAll('.trace-card-rating[data-handle]');
    if (!cards.length) return;

    // Gather all unique individual handles that we need to query
    var uniqueHandles = {};
    cards.forEach(function (el) {
      var h = el.getAttribute('data-handle');
      if (h) uniqueHandles[h] = true;

      var combined = el.getAttribute('data-combined') === 'true';
      var linked = el.getAttribute('data-linked-handles');
      if (combined && linked) {
        linked.split(',').forEach(function (lh) {
          var trimmed = lh.trim();
          if (trimmed) uniqueHandles[trimmed] = true;
        });
      }
    });

    var handleList = Object.keys(uniqueHandles);
    if (handleList.length === 0) return;

    // Fetch bulk summaries for all these handles in chunks of 20 to avoid long URLs
    var chunkSize = 20;
    for (var i = 0; i < handleList.length; i += chunkSize) {
      var chunk = handleList.slice(i, i + chunkSize);
      (function (currentChunk) {
        var url = BACKEND + '/api/public/reviews/bulk-summary?handles=' + encodeURIComponent(currentChunk.join(','));
        fetch(url)
          .then(function (r) { return r.json(); })
          .then(function (json) {
            if (!json.success || !json.data) return;
            var summaries = json.data;

            // Cache all summaries globally as they arrive
            window.__traceReviewsSummaries = window.__traceReviewsSummaries || {};
            currentChunk.forEach(function (ch) {
              if (summaries[ch]) {
                window.__traceReviewsSummaries[ch] = summaries[ch];
              }
            });

            // Update each card on the page using the global cache
            cards.forEach(function (el) {
              var h = el.getAttribute('data-handle');
              var combined = el.getAttribute('data-combined') === 'true';
              var linked = el.getAttribute('data-linked-handles');

              // Determine all handles for this card
              var cardHandles = [h];
              if (combined && linked) {
                linked.split(',').forEach(function (lh) {
                  var trimmed = lh.trim();
                  if (trimmed && cardHandles.indexOf(trimmed) === -1) {
                    cardHandles.push(trimmed);
                  }
                });
              }

              // Calculate stats using the cache
              var totalReviews = 0;
              var sumRatings = 0;
              var hasData = false;

              cardHandles.forEach(function (ch) {
                var s = window.__traceReviewsSummaries[ch];
                if (s) {
                  hasData = true;
                  if (s.total > 0) {
                    totalReviews += s.total;
                    sumRatings += (s.avg * s.total);
                  }
                }
              });

              // Render if we have data for this card's handles
              if (hasData) {
                if (totalReviews === 0) {
                  el.innerHTML = ''; // Hide or show no reviews
                  return;
                }

                var avg = sumRatings / totalReviews;
                var badge =
                  renderMiniStars(avg) +
                  ' <span style="font-size:12px;color:#888;font-weight:500;letter-spacing:0.3px;margin-left:4px;">' +
                  avg.toFixed(1) +
                  ' <span style="opacity:0.5;">(' + totalReviews + ')</span></span>';

                el.innerHTML = badge;
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
