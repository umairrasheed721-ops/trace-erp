const cron = require('node-cron');
const { db, DB_DIR } = require('./db');
const { fetchShopifyOrders, refreshShopifyUpdates } = require('./engines/shopify');
const { syncPostEx, syncInstaworld } = require('./engines/tracking');
const { runWatchdog } = require('./engines/watchdog');
const { getShopifyInventoryCosts } = require('./engines/shopify_finance');
const { runSniperScan } = require('./engines/sniper');
const tenantContext = require('./tenant-context');
const fs = require('fs');
const { sendReviewRequestEmail } = require('./services/reviewEmailService');

function getAllTenants() {
  const tenants = ['default'];
  try {
    const files = fs.readdirSync(DB_DIR);
    for (const file of files) {
      if (file.startsWith('trace_erp_') && file.endsWith('.db')) {
        const tenantId = file.substring(10, file.length - 3);
        if (tenantId && !tenants.includes(tenantId)) {
          tenants.push(tenantId);
        }
      }
    }
  } catch (e) {
    console.error('⚠️ Failed to scan tenants in Scheduler:', e.message);
  }
  return tenants;
}

const activeLocks = new Set();

async function runMultiTenant(jobName, task) {
  const tenants = getAllTenants();
  const promises = tenants.map(async (tenantId) => {
    const lockKey = `${tenantId}:${jobName}`;
    if (activeLocks.has(lockKey)) {
      console.log(`[Scheduler] ⚠️ Lock active for ${lockKey}. Skipping execution.`);
      return;
    }
    activeLocks.add(lockKey);
    try {
      await tenantContext.run(tenantId, async () => {
        await task(tenantId);
      });
    } catch (err) {
      console.error(`[Scheduler] ❌ Error in job "${jobName}" for tenant "${tenantId}":`, err.message);
    } finally {
      activeLocks.delete(lockKey);
    }
  });
  await Promise.allSettled(promises);
}

async function syncStoreInventoryAndCosts(store) {
  console.log(`📦 [CRON] Background Inventory & Cost Sync starting for Store ${store.id}...`);
  let totalSynced = 0;
  try {
    const selectStmt = db.prepare(`
      SELECT id FROM product_master_costs 
      WHERE store_id = ? 
      AND (
        shopify_variant_id = ? 
        OR shopify_variant_id = ? 
        OR (sku = ? AND sku != '')
      )
      ORDER BY (CASE WHEN shopify_variant_id = ? OR shopify_variant_id = ? THEN 0 ELSE 1 END) ASC, 
               (CASE WHEN sku = ? THEN 0 ELSE 1 END) ASC
      LIMIT 1
    `);

    const updateStmt = db.prepare(`
      UPDATE product_master_costs SET
        shopify_variant_id = ?, sku = ?, parent_title = ?, variant_title = ?,
        shopify_cost = ?, selling_price = ?, inventory_qty = ?,
        variant_image_url = COALESCE(?, variant_image_url),
        status = ?,
        inventory_policy = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    const insertStmt = db.prepare(`
      INSERT INTO product_master_costs (store_id, shopify_variant_id, sku, parent_title, variant_title, shopify_cost, selling_price, inventory_qty, status, inventory_policy, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
        shopify_variant_id = excluded.shopify_variant_id,
        sku = COALESCE(excluded.sku, product_master_costs.sku),
        shopify_cost = excluded.shopify_cost,
        selling_price = excluded.selling_price,
        inventory_qty = excluded.inventory_qty,
        status = excluded.status,
        inventory_policy = excluded.inventory_policy,
        updated_at = datetime('now')
    `);

    await getShopifyInventoryCosts(store, async (products) => {
      db.transaction(() => {
        for (const p of products) {
          const variantId = p.shopify_variant_id ? String(p.shopify_variant_id) : '';
          const numericVariantId = variantId.includes('/') ? variantId.split('/').pop() : variantId;
          const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
          const sku = p.sku ? String(p.sku).trim() : '';

          const queryVariantId1 = numericVariantId || '__NONE__';
          const queryVariantId2 = gidVariantId || '__NONE__';
          const querySku = sku || '__NONE__';

          const existing = selectStmt.get(Number(store.id), queryVariantId1, queryVariantId2, querySku, queryVariantId1, queryVariantId2, querySku);

          if (existing) {
            updateStmt.run(p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, p.image_url || null, p.status || 'active', p.inventory_policy || 'deny', existing.id);
          } else {
            insertStmt.run(Number(store.id), p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, p.status || 'active', p.inventory_policy || 'deny');
          }
        }
      })();
      totalSynced += products.length;
    });

    console.log(`✅ [CRON] Successfully synced ${totalSynced} catalog items for Store ${store.id}.`);
  } catch (e) {
    console.error(`❌ [CRON] Inventory sync failed for Store ${store.id}:`, e.message);
  }
}

async function runDynamicScheduler() {
  await runMultiTenant('dynamic_sync', async (tenantId) => {
    try {
      const schedules = db.prepare('SELECT * FROM sync_schedules WHERE is_active = 1').all();
      const now = new Date();
      
      for (const s of schedules) {
        const nextRun = s.next_run_at ? new Date(s.next_run_at) : null;
        
        if (!nextRun || nextRun <= now) {
          console.log(`🚚 [DYNAMIC] Tenant [${tenantId}] - Triggering ${s.courier} (${s.sync_type}) sync...`);
          
          // Calculate and save next run time FIRST to prevent overlap if check runs again
          const intervalMs = (s.interval_minutes || 60) * 60000;
          const newNextRun = new Date(now.getTime() + intervalMs);
          
          db.prepare('UPDATE sync_schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?')
            .run(now.toISOString(), newNextRun.toISOString(), s.id);

          const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
          for (const store of stores) {
            try {
              if (s.courier === 'PostEx') {
                await syncPostEx(store, s.sync_type);
              } else {
                await syncInstaworld(store, s.sync_type);
              }
            } catch (e) {
              console.error(`Error in dynamic sync for ${s.courier} (Tenant: ${tenantId}):`, e.message);
            }
          }
        }
      }
    } catch (err) {
      // Ignore table not found errors for uninitialized/incomplete databases
    }
  });
}

async function sendReviewEmails(daysWindow = 7) {
  try {
    // Ensure column exists (idempotent)
    try { db.exec("ALTER TABLE orders ADD COLUMN review_email_sent INTEGER DEFAULT 0"); } catch (_) {}

    // Find delivered orders within the last X days (default 7 days) where review_email_sent is 0 or NULL
    const windowDays = parseInt(daysWindow) || 7;
    const orders = db.prepare(`
      SELECT id, ref_number, customer_name, email, phone, product_titles, line_items,
             delivery_status, status_date
      FROM orders
      WHERE delivery_status IN ('Delivered', 'delivered')
        AND (review_email_sent IS NULL OR review_email_sent = 0)
        AND status_date IS NOT NULL
        AND datetime(status_date) <= datetime('now', '-24 hours')
        AND datetime(status_date) >= datetime('now', '-${windowDays} days')
    `).all();

    console.log(`⭐ [Reviews] Found ${orders.length} eligible delivered orders for review emails (Last ${windowDays} days)`);

    let sentCount = 0;
    for (const order of orders) {
      try {
        let customerEmail = (order.email || '').trim();
        let productHandle = 'general';
        let productTitle = order.product_titles || 'your recent purchase';

        // Try to parse line_items for product handle / title / fallback email
        if (order.line_items) {
          try {
            const items = JSON.parse(order.line_items);
            if (Array.isArray(items) && items.length > 0) {
              const first = items[0];
              if (!customerEmail && first.email) customerEmail = first.email.trim();
              if (first.handle) productHandle = first.handle;
              if (first.title) productTitle = first.title;
            }
          } catch (_) {}
        }

        if (!customerEmail) {
          // Mark as -1 (Skipped - No email address available)
          db.prepare("UPDATE orders SET review_email_sent = -1 WHERE id = ?").run(order.id);
          continue;
        }

        const sent = await sendReviewRequestEmail({
          orderId: order.id,
          customerName: order.customer_name,
          customerEmail,
          productHandle,
          productTitle,
        });

        if (sent) {
          db.prepare("UPDATE orders SET review_email_sent = 1 WHERE id = ?").run(order.id);
          sentCount++;
        }

        // Add 3 seconds delay between emails to protect Gmail limits
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (e) {
        console.error(`[Review Email] Failed for order #${order.id}:`, e.message);
      }
    }
    return { success: true, processed: orders.length, sent: sentCount };
  } catch (e) {
    console.error('[Review Email Scan] Error:', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = function schedulerInit() {
  console.log('⏰ Scheduler initialized (Dynamic Multi-Tenant Mode)');

  // 1. Every 1 minute: Check for due dynamic syncs
  cron.schedule('* * * * *', runDynamicScheduler);

  // 1b. Every 10 minutes: Automated background Shopify order ingestion (Hybrid Engine Recovery)
  cron.schedule('*/10 * * * *', async () => {
    console.log('🔄 [CRON] 10-minute Shopify order ingestion polling starting...');
    await runMultiTenant('shopify_poll_10m', async (tenantId) => {
      try {
        const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
        for (const store of stores) {
          try {
            console.log(`[Shopify Poll] Fetching orders for store ${store.shop_domain} (Tenant: ${tenantId})...`);
            await fetchShopifyOrders(store);
          } catch (e) {
            console.error(`[Shopify Poll Error] for store ${store.shop_domain} (Tenant: ${tenantId}):`, e.message);
          }
        }
      } catch (err) {}
    });
  });


  // 3. Every 2 hours: Refresh recent Shopify updates
  cron.schedule('0 */2 * * *', async () => {
    console.log('🔄 [CRON] Shopify refresh starting...');
    await runMultiTenant('shopify_refresh_2h', async (tenantId) => {
      try {
        const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
        for (const store of stores) {
          try { await refreshShopifyUpdates(store); } catch (e) { console.error(`[CRON] Refresh error for store ${store.shop_domain} (Tenant: ${tenantId}):`, e.message); }
        }
      } catch (err) {}
    });
  });

  // 4. Every 30 minutes: Watchdog audit
  cron.schedule('*/30 * * * *', async () => {
    console.log('🐕 [CRON] Watchdog audit starting...');
    await runMultiTenant('watchdog_audit_30m', async (tenantId) => {
      try {
        const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
        for (const store of stores) {
          try { await runWatchdog(store); } catch (e) { console.error(`[CRON] Watchdog error for store ${store.shop_domain} (Tenant: ${tenantId}):`, e.message); }
        }
      } catch (err) {}
    });
  });

  // 5. Every 12 hours: Automated background inventory & cost sync
  cron.schedule('0 */12 * * *', async () => {
    console.log('📦 [CRON] Automated 12-hour inventory & cost sync starting...');
    await runMultiTenant('inventory_sync_12h', async (tenantId) => {
      try {
        const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
        for (const store of stores) {
          try { await syncStoreInventoryAndCosts(store); } catch (e) { console.error(`[CRON] Catalog sync error for store ${store.shop_domain} (Tenant: ${tenantId}):`, e.message); }
        }
      } catch (err) {}
    });
  });

  // 5b. Every 4 hours: Run tracking reconciler script
  cron.schedule('0 */4 * * *', async () => {
    console.log('🔄 [CRON] Starting 4-hour tracking reconciliation...');
    await runMultiTenant('tracking_reconciler_4h', async (tenantId) => {
      try {
        const { runReconciliation } = require('./scripts/trackingReconciler');
        await runReconciliation();
      } catch (e) {
        console.error(`Reconciliation cron error (Tenant: ${tenantId}):`, e.message);
      }
    });
  });

  // 6. Every 2 hours: Stuck Parcel Sniper — auto-alert customers with stuck parcels
  cron.schedule('0 */2 * * *', async () => {
    console.log('🎯 [CRON] Stuck Parcel Sniper scan starting...');
    await runMultiTenant('parcel_sniper_2h', async (tenantId) => {
      try { await runSniperScan(); } catch (e) { console.error(`Sniper cron error (Tenant: ${tenantId}):`, e.message); }
    });
  });

  // 7. Every day at midnight: Automated database backups
  cron.schedule('0 0 * * *', async () => {
    console.log('💾 [CRON] Starting daily database backup...');
    await runMultiTenant('db_backup_daily', async (tenantId) => {
      try {
        if (typeof db.backupDatabase === 'function') {
          db.backupDatabase();
        }
      } catch (e) {
        console.error(`Backup cron error (Tenant: ${tenantId}):`, e.message);
      }
    });
  });

  // 8. Every day at midnight UTC: Nightly Self-Learning Audit Loop
  cron.schedule('0 0 * * *', async () => {
    console.log('🌙 [CRON] Starting Self-Learning Audit Loop...');
    await runMultiTenant('self_learning_audit_daily', async (tenantId) => {
      try {
        const { runNightlyAuditService } = require('./engines/audit_service');
        await runNightlyAuditService();
      } catch (e) {
        console.error(`[Audit Cron Error] (Tenant: ${tenantId}):`, e.message);
      }
    });
  }, {
    timezone: "UTC"
  });

  // 9. Every day at 1:00 AM: Pull full Shopify product catalog and sync to local cache
  cron.schedule('0 1 * * *', async () => {
    console.log('🔄 [CRON] Starting daily full Shopify catalog pull & sync...');
    const { syncFullProductCatalog } = require('./engines/shopify');
    await runMultiTenant('full_catalog_sync_daily', async (tenantId) => {
      try {
        const stores = db.prepare("SELECT * FROM stores WHERE access_token != 'PENDING'").all();
        for (const store of stores) {
          try { await syncFullProductCatalog(store); } catch (e) { console.error(`Full catalog sync cron error for store ${store.shop_domain} (Tenant: ${tenantId}):`, e.message); }
        }
      } catch (err) {}
    });
  });

  // 10. Every day at 2:00 AM: Purge old media files from Google Drive and SQLite
  cron.schedule('0 2 * * *', async () => {
    console.log('🗑️ [CRON] Starting daily WhatsApp media purge cycle...');
    await runMultiTenant('media_purge_daily', async (tenantId) => {
      try {
        const { runPurge } = require('./scripts/purge_old_media');
        await runPurge();
      } catch (e) {
        console.error(`Media purge cron error (Tenant: ${tenantId}):`, e.message);
      }
    });
  });

  // 11. Every day at 3:00 AM: Clean up sync_journal and report files older than 3 days
  cron.schedule('0 3 * * *', async () => {
    console.log('🗑️ [CRON] Sync journal auto-cleanup starting...');
    await runMultiTenant('journal_cleanup_daily', async (tenantId) => {
      try {
        const { runJournalCleanup } = require('./engines/shopify_sync');
        await runJournalCleanup();
      } catch (e) {
        console.error(`Sync journal cleanup cron error (Tenant: ${tenantId}):`, e.message);
      }
    });
  });

  // 12. Every day at 3:30 AM: Clean up reconciliation sessions older than 3 days
  cron.schedule('30 3 * * *', async () => {
    console.log('🗑️ [CRON] Reconciliation history auto-cleanup starting...');
    try {
      const fs = require('fs');
      const path = require('path');
      const { DatabaseSync } = require('node:sqlite');
      
      const defaultDbPath = process.env.NODE_ENV === 'production' || 
                           process.env.RAILWAY_ENVIRONMENT !== undefined ||
                           process.env.BOT_ENABLED === 'true'
        ? '/app/data/trace_erp.db' 
        : path.join(__dirname, 'trace_erp.db');
      const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);
      const DB_DIR = path.dirname(DB_PATH);

      if (fs.existsSync(DB_DIR)) {
        const files = fs.readdirSync(DB_DIR);
        for (const file of files) {
          if (file.startsWith('trace_erp') && file.endsWith('.db')) {
            const filePath = path.join(DB_DIR, file);
            try {
              const tempDb = new DatabaseSync(filePath);
              tempDb.prepare("DELETE FROM recon_logs WHERE session_id IN (SELECT id FROM recon_sessions WHERE created_at < datetime('now', '+5 hours', '-3 days'))").run();
              tempDb.prepare("DELETE FROM recon_sessions WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
              tempDb.close();
              console.log(`      🧹 Cleaned up old reconciliation logs in ${file}`);
            } catch (e) {
              console.error(`Failed to clean up db ${file}:`, e.message);
            }
          }
        }
      }
    } catch (e) {
      console.error('Reconciliation history auto-cleanup cron error:', e.message);
    }
  });

  // 13. Every day at 4:00 AM: Safe Emergency Volume Cleaner
  cron.schedule('0 4 * * *', async () => {
    console.log('🧹 [CRON] Daily volume cleanup cycle starting...');
    try {
      const { cleanVolume } = require('./utils/volumeCleaner');
      cleanVolume();
    } catch (e) {
      console.error('Volume cleanup cron error:', e.message);
    }
  });

  // 14. Every 30 minutes: 24-Hour COD Verification Follow-up reminder
  cron.schedule('*/30 * * * *', async () => {
    console.log('⏰ [CRON] 24-Hour COD Verification Follow-up reminder scan starting...');
    await runMultiTenant('cod_followups_30m', async (tenantId) => {
      try {
        const { checkAndSendCODFollowUps } = require('./engines/cod_verifier');
        const bot = require('./engines/whatsapp_bot');
        await checkAndSendCODFollowUps(db, bot);
      } catch (e) {
        console.error(`[Follow-up Cron Error] (Tenant: ${tenantId}):`, e.message);
      }
    });
  });

  // 15. Every 30 minutes: 24-Hour Post-Delivery Feedback review requests
  cron.schedule('*/30 * * * *', async () => {
    console.log('⏰ [CRON] 24-Hour Post-Delivery Feedback scan starting...');
    await runMultiTenant('post_delivery_feedback_30m', async (tenantId) => {
      try {
        const { checkAndSendPostDeliveryFeedback } = require('./engines/post_delivery_feedback');
        const bot = require('./engines/whatsapp_bot');
        await checkAndSendPostDeliveryFeedback(db, bot);
      } catch (e) {
        console.error(`[Feedback Cron Error] (Tenant: ${tenantId}):`, e.message);
      }
    });
  });

  // Fire sniper, follow-ups & feedback once on boot (after 60s delay to let bot connect)
  setTimeout(async () => {
    await runMultiTenant('boot_initial_checks', async (tenantId) => {
      try { await runSniperScan(); } catch(e) {}
      try {
        const { checkAndSendCODFollowUps } = require('./engines/cod_verifier');
        const bot = require('./engines/whatsapp_bot');
        await checkAndSendCODFollowUps(db, bot);
      } catch(e) {}
      try {
        const { checkAndSendPostDeliveryFeedback } = require('./engines/post_delivery_feedback');
        const bot = require('./engines/whatsapp_bot');
        await checkAndSendPostDeliveryFeedback(db, bot);
      } catch(e) {}
    });
  }, 60000);

  // 16. Every day at 10:00 AM PKT (5:00 AM UTC): Send review request emails
  cron.schedule('0 5 * * *', async () => {
    console.log('⭐ [CRON] Review request email scan starting...');
    await runMultiTenant('review_emails_daily', async (tenantId) => {
      try {
        await sendReviewEmails();
      } catch (e) {
        console.error(`[Review Email Cron Error] (Tenant: ${tenantId}):`, e.message);
      }
    });
  }, { timezone: 'UTC' });
};

module.exports.sendReviewEmails = sendReviewEmails;
