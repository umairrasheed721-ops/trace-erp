const { extractSerializedTag } = require('./replyFormatter');

async function analyzeCustomerIntent(text) {
  try {
    const { db } = require('../../db');
    const settings = db.prepare('SELECT api_key, model_name FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || !settings.api_key) {
      return 'General';
    }

    const map = {
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-1.5-pro': 'gemini-2.5-pro'
    };
    const model = map[settings.model_name] || settings.model_name || 'gemini-2.5-flash';
    const apiKey = settings.api_key;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `Analyze this e-commerce customer message and return a single tag from this list: [Urgent, Size Issue, Pricing, Address Update, General]. If none match, return 'General'. Message: ${text}`;

    const payload = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
    };

    const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch');
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      return 'General';
    }

    const data = await res.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanTag = replyText.replace(/[^a-zA-Z\s]/g, '').trim();
    const validTags = ['Urgent', 'Size Issue', 'Pricing', 'Address Update', 'General'];
    const matched = validTags.find(t => t.toLowerCase() === cleanTag.toLowerCase());
    return matched || 'General';
  } catch (err) {
    console.error('⚠️ analyzeCustomerIntent error:', err.message);
    return 'General';
  }
}

async function handleIncomingAIMessage(bot, text, fromPhone, sock, db) {
  const settings = db.prepare('SELECT * FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get() || {};
  const { generateAIResponse } = require('../gemini_engine');
  const geminiReply = await generateAIResponse(fromPhone, text);
  if (geminiReply) {
    let textReply = geminiReply;
    let catalogData = null;
    let recommendationData = null;

    if (typeof textReply === 'string') {
      const catExtract = extractSerializedTag(textReply, '__CATALOG_JSON__');
      textReply = catExtract.cleanText;
      catalogData = catExtract.data;

      const recExtract = extractSerializedTag(textReply, '__RECOMMENDATION_JSON__');
      textReply = recExtract.cleanText;
      recommendationData = recExtract.data;
    }

    const handoffKeywords = ['human agent', 'human support', 'live agent', 'connect you to', 'escalat', 'transfer you'];
    const needsHandoff = handoffKeywords.some(kw => textReply.toLowerCase().includes(kw));
    if (needsHandoff) {
      bot.setHumanHandoff(fromPhone, true);
      try {
        const { broadcast } = require('../../websocket');
        broadcast('human_handoff_required', { phone: fromPhone, reason: 'Gemini AI flagged handoff', preview: textReply.substring(0, 120) });
      } catch (_) {}
    }
    if ((bot.consecutiveBotReplies[fromPhone] || 0) >= 5) {
      console.warn(`⚠️ [RATE-LIMIT] Skipping Gemini reply to ${fromPhone} — 5 consecutive bot replies without response.`);
    } else {
      // Send the natural language chat reply
      bot.sendMessage(fromPhone, textReply, false);
      bot.consecutiveBotReplies[fromPhone] = (bot.consecutiveBotReplies[fromPhone] || 0) + 1;

      // If a structured catalog was fetched, send media cards in album format grouped by product
      if (catalogData && catalogData.products && catalogData.products.length > 0) {
        try {
          if (settings.feature_media_cards !== 0) {
            // Group products by base title
            const grouped = {};
            for (const p of catalogData.products) {
              let title = p.title || '';
              
              // Extract variant parts
              let variantPart = '';
              const parenMatch = title.match(/\(([^)]+)\)/);
              if (parenMatch) {
                variantPart = parenMatch[1];
              } else {
                const hyphenIndex = title.indexOf(' - ');
                if (hyphenIndex !== -1) {
                  variantPart = title.substring(hyphenIndex + 3).trim();
                }
              }
              
              // Base title (e.g. Classic Oxford Shirt)
              let baseTitle = title.replace(/\([^)]*\)/g, '').split(' - ')[0].trim();
              const groupKey = baseTitle.toLowerCase();
              
              if (!grouped[groupKey]) {
                grouped[groupKey] = {
                  baseTitle: baseTitle,
                  variants: [],
                  price: p.price,
                  colors: new Set()
                };
              }
              grouped[groupKey].variants.push(p);
              
              // Extract color name
              let color = '';
              if (variantPart) {
                const parts = variantPart.split(/[\/,]/);
                for (const part of parts) {
                  const cleanedPart = part.trim();
                  const isSize = /^(m|l|xl|2xl|3xl|4xl|5xl|6xl|s|xs|xxl|xxxl|medium|large|small|double\s*xl|triple\s*xl)$/i.test(cleanedPart);
                  if (!isSize && cleanedPart) {
                    color = cleanedPart;
                    break;
                  }
                }
              }
              if (color) {
                grouped[groupKey].colors.add(color);
              }
            }

            // Loop through groups and send album pictures back-to-back, followed by text tags
            let totalImagesQueued = 0;
            const maxTotalImages = 15; // Cap to prevent queue floods

            for (const g of Object.values(grouped)) {
              if (totalImagesQueued >= maxTotalImages) break;
              
              const variantsWithImages = g.variants.filter(v => v.image_url);
              if (variantsWithImages.length === 0) continue;
              
              // Send all color variant images first (without captions to trigger WhatsApp native album)
              for (const v of variantsWithImages) {
                if (totalImagesQueued >= maxTotalImages) break;
                bot.sendMessage(fromPhone, "", false, v.image_url, 'image', null, null, null, null, 'native', null, { fastSend: true }).catch(err => {
                  console.error('Failed to send catalog album image:', err.message);
                });
                totalImagesQueued++;
              }

              // Immediately send a text card acting as the divider label / price tag for this album
              let labelMsg = `*${g.baseTitle}*\nPrice: Rs. ${g.price}`;
              if (g.colors.size > 0) {
                labelMsg += `\nAvailable Colors: ${Array.from(g.colors).join(', ')}`;
              }
              bot.sendMessage(fromPhone, labelMsg, false).catch(err => {
                console.error('Failed to send catalog product text tag:', err.message);
              });
            }

            // If there are overall more than 5 products, follow up with a text link to the full collection
            if (catalogData.products.length > 5) {
              const uniqueUrls = Array.from(new Set(catalogData.products.map(p => p.product_url).filter(Boolean)));
              if (uniqueUrls.length > 0) {
                const linksText = uniqueUrls.map(url => `🔗 ${url}`).join('\n');
                const followUpMsg = `Aap is link par visit kar ke baqi tamam colors aur available collection dekh sakte hain:\n\n${linksText}`;
                bot.sendMessage(fromPhone, followUpMsg, false).catch(err => {
                  console.error('Failed to send catalog follow up links:', err.message);
                });
              }
            }
          }
        } catch (catalogErr) {
          console.error('❌ Failed to process catalog data:', catalogErr.message);
        }
      }

      // If a structured recommendation was fetched, send interactive button card and product image
      if (recommendationData && recommendationData.recommendation) {
        try {
          const rec = recommendationData.recommendation;

          // Dispatch upsell product image in background
          if (rec.image_url && settings.feature_media_cards !== 0) {
            bot.sendMessage(fromPhone, `*${rec.title}*\nPrice: Rs. ${rec.price}\nSKU: ${rec.sku}`, false, rec.image_url, 'image').catch(err => {
              console.error('Failed to send recommended product image message:', err.message);
            });
          }

          // Dispatch interactive button card (Yes/No)
          if (settings.feature_quick_replies !== 0) {
            const buttonText = `Would you like to add *${rec.title}* (Rs. ${rec.price}) in size ${recommendationData.size} to your order?`;
            const buttons = [
              { label: "Yes, add it! ✅", value: `Yes, add ${rec.title} (SKU: ${rec.sku}) to my order` },
              { label: "No, thanks ❌", value: "No thanks, proceed with my current selection" }
            ];
            await bot.sendMessage(fromPhone, buttonText, false, null, null, null, null, null, buttons, 'native');
          } else {
            const textMessage = `Would you like to add *${rec.title}* (Rs. ${rec.price}) in size ${recommendationData.size} to your order? Reply with "Yes, add ${rec.title} (SKU: ${rec.sku}) to my order" to add it.`;
            await bot.sendMessage(fromPhone, textMessage, false);
          }

        } catch (recErr) {
          console.error('⚠️ Failed to dispatch recommendation interactive messages:', recErr.message);
        }
      }
    }
  }
}

module.exports = {
  analyzeCustomerIntent,
  handleIncomingAIMessage
};
