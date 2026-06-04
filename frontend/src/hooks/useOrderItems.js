import { useState, useMemo, useCallback } from 'react';

export default function useOrderItems({ editingOrder, apiBase }) {
  // CS Items state
  const [localItems, setLocalItems] = useState([]);
  const [masterProducts, setMasterProducts] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Live Subtotal
  const liveSubtotal = useMemo(() => {
    return localItems.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0)), 0);
  }, [localItems]);

  // Group master products into Parent -> Colors -> Sizes hierarchy
  const groupedProducts = useMemo(() => {
    const groups = {};

    masterProducts.forEach(mp => {
      let pTitle = (mp.parent_title || 'Unnamed Product').trim();
      let extractedVariant = '';
      if (pTitle.includes(' - ')) {
        const parts = pTitle.split(' - ');
        pTitle = parts[0].trim();
        extractedVariant = parts.slice(1).join(' - ').trim();
      }

      let vTitle = (mp.variant_title || '').trim();
      if (!vTitle || vTitle.toLowerCase().includes('default')) {
        vTitle = extractedVariant || vTitle;
      }

      let color = 'Default';
      let size = 'One Size';

      if (vTitle && !vTitle.toLowerCase().includes('default')) {
        const parts = vTitle.split(/[\/\-\|]/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const isSize = (str) => /^(xs|s|m|l|xl|2xl|3xl|4xl|\d+[a-z]*)$/i.test(str);
          if (isSize(parts[0])) {
            size = parts[0].toUpperCase();
            color = parts[1];
          } else if (isSize(parts[1])) {
            color = parts[0];
            size = parts[1].toUpperCase();
          } else {
            color = parts[0];
            size = parts[1];
          }
        } else if (parts.length === 1) {
          if (/^(xs|s|m|l|xl|2xl|3xl|4xl|\d+[a-z]*)$/i.test(parts[0])) {
            size = parts[0].toUpperCase();
          } else {
            color = parts[0];
          }
        }
      }

      color = color.charAt(0).toUpperCase() + color.slice(1);

      if (!groups[pTitle]) {
        groups[pTitle] = {
          parent_title: pTitle,
          image_url: mp.image_url,
          colors: {},
          all_skus: [],
          all_variants: [],
          min_price: mp.selling_price || mp.unit_cost || 0
        };
      }

      if (!groups[pTitle].colors[color]) {
        groups[pTitle].colors[color] = {
          color_name: color,
          sizes: []
        };
      }

      if (mp.sku) groups[pTitle].all_skus.push(mp.sku.toLowerCase());
      if (vTitle) groups[pTitle].all_variants.push(vTitle.toLowerCase());
      if (mp.image_url && !groups[pTitle].image_url) {
        groups[pTitle].image_url = mp.image_url;
      }

      groups[pTitle].colors[color].sizes.push({
        ...mp,
        clean_size: size,
        clean_color: color
      });
    });

    return Object.values(groups);
  }, [masterProducts]);

  // Helper for Levenshtein Distance
  const getEditDistance = useCallback((a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
      }
    }
    return matrix[b.length][a.length];
  }, []);

  // Helper for Lenient Search
  const isLenientMatch = useCallback((query, target) => {
    if (!query || !target) return false;
    const qClean = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    const tClean = target.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!qClean) return true;
    if (!tClean) return false;

    if (tClean.includes(qClean)) return true;

    if (qClean.length >= 3) {
      const tWords = target.toLowerCase().split(/[\s\-\/\(\)]/).filter(Boolean);
      for (const word of tWords) {
        const wClean = word.replace(/[^a-z0-9]/g, '');
        if (wClean.length >= qClean.length - 1 && wClean.length <= qClean.length + 1) {
          const dist = getEditDistance(qClean, wClean);
          if (dist <= 1 || (qClean.length >= 4 && dist <= 2)) return true;
        }
      }
    }

    return false;
  }, [getEditDistance]);

  // Filter grouped products by search query
  const filteredGroups = useMemo(() => {
    if (!productSearchQuery.trim()) return groupedProducts;
    const q = productSearchQuery.trim();
    return groupedProducts.filter(g => 
      isLenientMatch(q, g.parent_title) ||
      g.all_skus.some(sku => isLenientMatch(q, sku)) ||
      g.all_variants.some(v => isLenientMatch(q, v)) ||
      Object.keys(g.colors).some(c => isLenientMatch(q, c))
    );
  }, [groupedProducts, productSearchQuery, isLenientMatch]);

  return {
    localItems,
    setLocalItems,
    masterProducts,
    setMasterProducts,
    showProductSearch,
    setShowProductSearch,
    productSearchQuery,
    setProductSearchQuery,
    groupedProducts,
    filteredGroups,
    liveSubtotal
  };
}
