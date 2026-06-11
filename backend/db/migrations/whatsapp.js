/**
 * db/migrations/whatsapp.js
 *
 * WhatsApp and Gemini migrations and seeds.
 * Exports an array of migrations (SQL strings or functions).
 */

module.exports = [
  // 1. CREATE whatsapp_templates TABLE
  `CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    category TEXT NOT NULL DEFAULT 'UTILITY',
    status TEXT DEFAULT 'active',
    components TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(store_id, name)
  );`,

  // 2. CREATE wa_session_store TABLE
  `CREATE TABLE IF NOT EXISTS wa_session_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );`,

  // 3. CREATE wa_lid_mappings TABLE
  `CREATE TABLE IF NOT EXISTS wa_lid_mappings (
    lid TEXT PRIMARY KEY,
    phone TEXT NOT NULL
  );`,

  // 4. CREATE whatsapp_quick_replies TABLE
  `CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'General',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT, -- 'image', 'video', 'document', 'audio'
    created_at TEXT DEFAULT (datetime('now'))
  );`,

  // 5. CREATE quick_replies TABLE
  `CREATE TABLE IF NOT EXISTS quick_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    category TEXT DEFAULT 'General',
    shortcode TEXT DEFAULT NULL,
    media_url TEXT DEFAULT NULL,
    media_type TEXT DEFAULT NULL,
    usage_count INTEGER DEFAULT 0,
    buttons_mode TEXT DEFAULT 'native'
  );`,

  // 6. CREATE quick_reply_buttons TABLE
  `CREATE TABLE IF NOT EXISTS quick_reply_buttons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reply_id INTEGER NOT NULL REFERENCES quick_replies(id) ON DELETE CASCADE,
    button_text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );`,

  // 7. CREATE whatsapp_quick_pills TABLE
  `CREATE TABLE IF NOT EXISTS whatsapp_quick_pills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pill_text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );`,

  // 8. CREATE sync_history TABLE
  `CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    total INTEGER DEFAULT 0,
    success INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    log_data TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,

  // 9. CREATE whatsapp_settings TABLE
  `CREATE TABLE IF NOT EXISTS whatsapp_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT DEFAULT 'live',
    cod_verification_enabled INTEGER DEFAULT 1,
    attempted_delivery_enabled INTEGER DEFAULT 1,
    dispatch_alerts_enabled INTEGER DEFAULT 1,
    min_delay_sec INTEGER DEFAULT 5,
    max_delay_sec INTEGER DEFAULT 15,
    max_per_hour INTEGER DEFAULT 60,
    cooling_period_min INTEGER DEFAULT 15,
    cod_template TEXT DEFAULT '👋 Hello from Trace ERP! We have received your COD order #{ref} for Rs. {amount}. Please reply with CONFIRM to dispatch your order immediately!',
    attempted_template TEXT DEFAULT '⚠️ Urgent: Our rider tried to deliver your parcel ({tracking}) today but couldn''t reach you. Please click here to drop your exact GPS location or delivery instructions so we can reattempt delivery tomorrow: {link}',
    dispatch_template TEXT DEFAULT '📦 Your order #{ref} has been dispatched via {courier}. Tracking number: {tracking}. Track here: {link}',
    ai_responder_enabled INTEGER DEFAULT 1,
    ai_tracking_template TEXT DEFAULT '🤖 [AI Support] Aapka parcel ({tracking}) {courier} ke paas hai. Current status: {status}. Track link: {link}',
    ai_landmark_template TEXT DEFAULT '🤖 [AI Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai.',
    status TEXT DEFAULT 'DISCONNECTED',
    stuck_threshold_hours INTEGER DEFAULT 36,
    poll_options TEXT DEFAULT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );`,

  // 10. CREATE whatsapp_messages TABLE & INDEXES
  `CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    order_id INTEGER,
    phone TEXT NOT NULL,
    direction TEXT NOT NULL,
    message TEXT NOT NULL,
    message_id TEXT,
    media_url TEXT,
    media_type TEXT,
    status TEXT DEFAULT 'sent',
    quote_context TEXT DEFAULT NULL,
    transcript TEXT DEFAULT NULL,
    transcript_at TEXT DEFAULT NULL,
    ai_processed TEXT DEFAULT NULL,
    tenant_id TEXT DEFAULT 'default',
    intent TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_wa_msgs_phone ON whatsapp_messages(phone);`,
  `CREATE INDEX IF NOT EXISTS idx_wa_msgs_order ON whatsapp_messages(order_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_msgs_message_id ON whatsapp_messages(message_id);`,
  `CREATE INDEX IF NOT EXISTS idx_wa_msgs_phone_time ON whatsapp_messages(phone, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_wa_msgs_tenant_phone ON whatsapp_messages(tenant_id, phone);`,
  `CREATE INDEX IF NOT EXISTS idx_wa_msgs_tenant ON whatsapp_messages(tenant_id);`,

  // 11. CREATE gemini_bot_settings TABLE
  `CREATE TABLE IF NOT EXISTS gemini_bot_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT DEFAULT '',
    ai_active INTEGER DEFAULT 1,
    model_name TEXT DEFAULT 'gemini-2.5-flash',
    system_prompt TEXT DEFAULT 'You are a helpful customer support representative for our e-commerce store. Your name is Zara/Hamza. You speak fluent Urdu, Roman Urdu, and English. You are polite, professional, and friendly. You must behave exactly like a real human support representative and never admit that you are an AI, bot, or automated system. Keep your replies concise and natural. Use the available tools to check order status, product stock, or register new orders when requested.',
    strictness TEXT DEFAULT 'balanced',
    auto_learning_enabled INTEGER DEFAULT 1,
    tool_check_stock INTEGER DEFAULT 1,
    tool_order_status INTEGER DEFAULT 1,
    tool_create_order INTEGER DEFAULT 1,
    tool_update_profile INTEGER DEFAULT 1,
    tool_fetch_catalog INTEGER DEFAULT 1,
    tool_recommendations INTEGER DEFAULT 1,
    feature_interactive_lists INTEGER DEFAULT 1,
    feature_quick_replies INTEGER DEFAULT 1,
    feature_media_cards INTEGER DEFAULT 1,
    feature_voice_notes INTEGER DEFAULT 1,
    voice_name TEXT DEFAULT 'Aoede',
    recommendation_rules TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
  );`,

  // 12. CREATE gemini_chat_memory TABLE & INDEXES
  `CREATE TABLE IF NOT EXISTS gemini_chat_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_memory_phone ON gemini_chat_memory(phone);`,

  // 13. CREATE customer_profiles TABLE
  `CREATE TABLE IF NOT EXISTS customer_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    preferences TEXT DEFAULT '{}',
    vip_status INTEGER DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    opted_out INTEGER DEFAULT 0,
    size_preference TEXT DEFAULT NULL,
    is_big_and_tall INTEGER DEFAULT 0,
    size_extracted_at TEXT DEFAULT NULL,
    ad_source TEXT DEFAULT NULL,
    ad_platform TEXT DEFAULT NULL,
    ad_attributed_at TEXT DEFAULT NULL,
    risk_flag TEXT DEFAULT 'NORMAL',
    return_rate REAL DEFAULT 0.0,
    risk_updated_at TEXT DEFAULT NULL,
    risk_reason TEXT DEFAULT NULL,
    dp_url TEXT DEFAULT NULL,
    dp_cached_at TEXT DEFAULT NULL,
    human_handoff_until TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now', '+5 hours')),
    updated_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,

  // 14. CREATE gemini_audit_logs TABLE
  `CREATE TABLE IF NOT EXISTS gemini_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_date TEXT NOT NULL,
    messages_analyzed INTEGER DEFAULT 0,
    friction_points TEXT DEFAULT '[]',
    prompt_refinements TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,

  // 15. CREATE gemini_knowledge_base TABLE
  `CREATE TABLE IF NOT EXISTS gemini_knowledge_base (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,

  // 16. CREATE ad_campaigns TABLE
  `CREATE TABLE IF NOT EXISTS ad_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    pattern TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,

  // 17. CREATE cod_pending_verifications TABLE & INDEXES
  `CREATE TABLE IF NOT EXISTS cod_pending_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    vn_path TEXT,
    sent_at TEXT DEFAULT (datetime('now', '+5 hours')),
    expires_at TEXT,
    replied_at TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_cod_pending_phone ON cod_pending_verifications(phone, status);`,

  // 18. CREATE upsell_offers TABLE
  `CREATE TABLE IF NOT EXISTS upsell_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    order_id INTEGER,
    product_id TEXT,
    offer_text TEXT,
    status TEXT DEFAULT 'offered',
    sent_at TEXT DEFAULT (datetime('now', '+5 hours')),
    converted_at TEXT
  );`,

  // 19. CREATE sniper_alerts TABLE & INDEXES
  `CREATE TABLE IF NOT EXISTS sniper_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    message_sent TEXT,
    sent_at TEXT DEFAULT (datetime('now', '+5 hours')),
    delivery_status_at_send TEXT,
    outcome TEXT DEFAULT 'sent'
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sniper_alerts_order ON sniper_alerts(order_id, alert_type, sent_at);`,

  // 20. CREATE payment_ocr_scans TABLE
  `CREATE TABLE IF NOT EXISTS payment_ocr_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    phone TEXT NOT NULL,
    image_path TEXT,
    raw_ocr_result TEXT,
    detected_amount REAL,
    detected_txn_id TEXT,
    detected_bank TEXT,
    confidence REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    scanned_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,

  // 21. CREATE gemini_usage_logs TABLE & INDEXES
  `CREATE TABLE IF NOT EXISTS gemini_usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    direction TEXT DEFAULT 'outbound',
    status TEXT DEFAULT 'success',
    model TEXT DEFAULT 'gemini-2.5-flash',
    tool_called TEXT DEFAULT NULL,
    error_msg TEXT DEFAULT NULL,
    response_ms INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', '+5 hours'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_usage_created ON gemini_usage_logs(created_at DESC);`,

  // 22. CREATE FTS5 VIRTUAL TABLE & TRIGGERS
  `CREATE VIRTUAL TABLE IF NOT EXISTS whatsapp_messages_fts USING fts5(
    message_id,
    phone,
    message
  );`,
  `CREATE TRIGGER IF NOT EXISTS whatsapp_messages_ai AFTER INSERT ON whatsapp_messages
  BEGIN
    INSERT INTO whatsapp_messages_fts(rowid, message_id, phone, message)
    VALUES (new.id, new.message_id, new.phone, new.message);
  END;`,
  `CREATE TRIGGER IF NOT EXISTS whatsapp_messages_ad AFTER DELETE ON whatsapp_messages
  BEGIN
    DELETE FROM whatsapp_messages_fts WHERE rowid = old.id;
  END;`,
  `CREATE TRIGGER IF NOT EXISTS whatsapp_messages_au AFTER UPDATE ON whatsapp_messages
  BEGIN
    UPDATE whatsapp_messages_fts
    SET message = new.message, phone = new.phone, message_id = new.message_id
    WHERE rowid = old.id;
  END;`,
  `INSERT INTO whatsapp_messages_fts(rowid, message_id, phone, message)
  SELECT id, message_id, phone, message FROM whatsapp_messages
  WHERE id NOT IN (SELECT rowid FROM whatsapp_messages_fts);`,

  // 23. CREATE v_whatsapp_roas VIEW
  `CREATE VIEW IF NOT EXISTS v_whatsapp_roas AS
  SELECT 
    shopify_order_id,
    id AS order_id,
    phone AS original_phone,
    CASE 
      WHEN length(replace(replace(replace(phone, '+', ''), '-', ''), ' ', '')) = 11 AND replace(replace(replace(phone, '+', ''), '-', ''), ' ', '') LIKE '0%'
        THEN '92' || substr(replace(replace(replace(phone, '+', ''), '-', ''), ' ', ''), 2)
      WHEN length(replace(replace(replace(phone, '+', ''), '-', ''), ' ', '')) = 10 AND replace(replace(replace(phone, '+', ''), '-', ''), ' ', '') NOT LIKE '92%'
        THEN '92' || replace(replace(replace(phone, '+', ''), '-', ''), ' ', '')
      ELSE replace(replace(replace(phone, '+', ''), '-', ''), ' ', '')
    END AS normalized_phone,
    (CASE 
      WHEN length(replace(replace(replace(phone, '+', ''), '-', ''), ' ', '')) = 11 AND replace(replace(replace(phone, '+', ''), '-', ''), ' ', '') LIKE '0%'
        THEN '92' || substr(replace(replace(replace(phone, '+', ''), '-', ''), ' ', ''), 2)
      WHEN length(replace(replace(replace(phone, '+', ''), '-', ''), ' ', '')) = 10 AND replace(replace(replace(phone, '+', ''), '-', ''), ' ', '') NOT LIKE '92%'
        THEN '92' || replace(replace(replace(phone, '+', ''), '-', ''), ' ', '')
      ELSE replace(replace(replace(phone, '+', ''), '-', ''), ' ', '')
    END || '@s.whatsapp.net') AS whatsapp_jid,
    total_price,
    delivery_status,
    order_date,
    tenant_id
  FROM orders;`,

  // 24. Idempotent Schema Alterations
  (db) => {
    const alters = [
      "ALTER TABLE whatsapp_settings ADD COLUMN ai_responder_enabled INTEGER DEFAULT 1",
      "ALTER TABLE whatsapp_settings ADD COLUMN ai_tracking_template TEXT DEFAULT '🤖 [AI Support] Aapka parcel ({tracking}) {courier} ke paas hai. Current status: {status}. Track link: {link}'",
      "ALTER TABLE whatsapp_settings ADD COLUMN ai_landmark_template TEXT DEFAULT '🤖 [AI Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai.'",
      "ALTER TABLE whatsapp_settings ADD COLUMN status TEXT DEFAULT 'DISCONNECTED'",
      "ALTER TABLE customer_profiles ADD COLUMN opted_out INTEGER DEFAULT 0",
      "ALTER TABLE customer_profiles ADD COLUMN size_preference TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN is_big_and_tall INTEGER DEFAULT 0",
      "ALTER TABLE customer_profiles ADD COLUMN size_extracted_at TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN ad_source TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN ad_platform TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN ad_attributed_at TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN risk_flag TEXT DEFAULT 'NORMAL'",
      "ALTER TABLE customer_profiles ADD COLUMN return_rate REAL DEFAULT 0.0",
      "ALTER TABLE customer_profiles ADD COLUMN risk_updated_at TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN risk_reason TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN dp_url TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN dp_cached_at TEXT DEFAULT NULL",
      "ALTER TABLE whatsapp_messages ADD COLUMN transcript TEXT DEFAULT NULL",
      "ALTER TABLE whatsapp_messages ADD COLUMN transcript_at TEXT DEFAULT NULL",
      "ALTER TABLE whatsapp_messages ADD COLUMN ai_processed TEXT DEFAULT NULL",
      "ALTER TABLE whatsapp_messages ADD COLUMN tenant_id TEXT DEFAULT 'default'",
      "ALTER TABLE whatsapp_messages ADD COLUMN intent TEXT DEFAULT NULL",
      "ALTER TABLE whatsapp_messages ADD COLUMN created_at TEXT DEFAULT (datetime('now', '+5 hours'))",
      "ALTER TABLE whatsapp_messages ADD COLUMN drive_file_id TEXT DEFAULT NULL",
      "ALTER TABLE whatsapp_messages ADD COLUMN quote_context TEXT DEFAULT NULL",
      "ALTER TABLE customer_profiles ADD COLUMN human_handoff_until TEXT DEFAULT NULL",
      "ALTER TABLE whatsapp_settings ADD COLUMN stuck_threshold_hours INTEGER DEFAULT 36",
      "ALTER TABLE gemini_bot_settings ADD COLUMN tool_check_stock INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN tool_order_status INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN tool_create_order INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN tool_update_profile INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN tool_fetch_catalog INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN tool_recommendations INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN feature_interactive_lists INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN feature_quick_replies INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN feature_media_cards INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN feature_voice_notes INTEGER DEFAULT 1",
      "ALTER TABLE gemini_bot_settings ADD COLUMN voice_name TEXT DEFAULT 'Aoede'",
      "ALTER TABLE gemini_bot_settings ADD COLUMN recommendation_rules TEXT DEFAULT '{}'",
      "ALTER TABLE whatsapp_settings ADD COLUMN poll_options TEXT DEFAULT NULL"
    ];

    alters.forEach(sql => {
      try {
        db.exec(sql);
      } catch (e) {
        // Ignore column already exists errors
      }
    });
  },

  // 25. Seeds
  (db) => {
    // Seed default quick-reply pills if empty
    try {
      const pillCount = db.prepare('SELECT COUNT(*) as count FROM whatsapp_quick_pills').get().count;
      if (pillCount === 0) {
        const defaultPills = [
          "👋 Sir, kindly confirm your nearest landmark for delivery.",
          "📦 Aapka parcel PostEx ko hand over kar diya hai.",
          "⚠️ Rider aapki location par hai, kindly phone attend karein.",
          "✅ Order confirm karne ka shukriya!"
        ];
        const insertPill = db.prepare('INSERT INTO whatsapp_quick_pills (pill_text, sort_order) VALUES (?, ?)');
        defaultPills.forEach((text, index) => {
          insertPill.run(text, index);
        });
        console.log('💊 Seeded default WhatsApp quick-reply pills');
      }
    } catch (e) {
      console.error('Failed to seed quick-reply pills:', e.message);
    }

    // Seed default whatsapp settings if empty
    try {
      const waCount = db.prepare('SELECT COUNT(*) as count FROM whatsapp_settings').get().count;
      if (waCount === 0) {
        db.prepare(`
          INSERT INTO whatsapp_settings (mode, cod_verification_enabled, attempted_delivery_enabled, dispatch_alerts_enabled, min_delay_sec, max_delay_sec, max_per_hour, cooling_period_min)
          VALUES ('live', 1, 1, 1, 5, 15, 60, 15)
        `).run();
      }
    } catch (e) {
      console.error('Failed to seed WhatsApp settings:', e.message);
    }

    // Seed default Gemini bot settings if empty or upgrade model names
    try {
      const geminiCount = db.prepare('SELECT COUNT(*) as count FROM gemini_bot_settings').get().count;
      const humanPrompt = 'You are a helpful customer support representative for our e-commerce store. Your name is Zara/Hamza. You speak fluent Urdu, Roman Urdu, and English. You are polite, professional, and friendly. You must behave exactly like a real human support representative and never admit that you are an AI, bot, or automated system. Keep your replies concise and natural. Use the available tools to check order status, product stock, or register new orders when requested.';
      if (geminiCount === 0) {
        db.prepare(`
          INSERT INTO gemini_bot_settings (api_key, ai_active, model_name, system_prompt, strictness, auto_learning_enabled)
          VALUES ('', 1, 'gemini-2.5-flash', ?, 'balanced', 1)
        `).run(humanPrompt);
      } else {
        db.prepare(`
          UPDATE gemini_bot_settings
          SET model_name = 'gemini-2.5-flash'
          WHERE model_name = 'gemini-1.5-flash'
        `).run();
        db.prepare(`
          UPDATE gemini_bot_settings
          SET model_name = 'gemini-2.5-pro'
          WHERE model_name = 'gemini-1.5-pro'
        `).run();
        db.prepare(`
          UPDATE gemini_bot_settings
          SET system_prompt = ?
          WHERE system_prompt LIKE '%TRACE AI%' OR system_prompt = ''
        `).run(humanPrompt);
        console.log('✅ [Startup Migration] Auto-enriched gemini system prompt with humanized persona.');
      }
    } catch (e) {
      console.error('Failed to migrate/seed gemini_bot_settings:', e.message);
    }

    // Seed knowledge base if empty
    try {
      const kbCount = db.prepare('SELECT COUNT(*) as count FROM gemini_knowledge_base').get().count;
      if (kbCount === 0) {
        const kbInsert = db.prepare('INSERT INTO gemini_knowledge_base (category, title, content) VALUES (?, ?, ?)');
        kbInsert.run('policy', 'Return & Exchange Policy', 'We offer a 3-day return and exchange policy. Items must be unused and in original packaging. To exchange a size, customer can request via WhatsApp.');
        kbInsert.run('shipping', 'Courier Delivery Timelines', 'Standard delivery takes 2-4 working days via PostEx or Instaworld. Major cities like Lahore, Karachi, and Islamabad usually receive parcels within 48 hours.');
        kbInsert.run('faq', 'Payment Methods', 'We accept Cash on Delivery (COD), EasyPaisa, JazzCash, Raast, and direct Bank Transfers.');
      }
    } catch (e) {
      console.error('Failed to seed knowledge base:', e.message);
    }
  },

  // Poll Vault — persist outbound poll metadata to survive container restarts
  `CREATE TABLE IF NOT EXISTS whatsapp_polls (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id   TEXT NOT NULL UNIQUE,
    remote_jid   TEXT NOT NULL,
    poll_name    TEXT NOT NULL,
    poll_options TEXT NOT NULL,
    message_secret TEXT,
    full_message_json TEXT,
    erp_status   TEXT,
    tenant_id    TEXT NOT NULL DEFAULT 'default',
    created_at   TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wa_polls_message_id ON whatsapp_polls(message_id)`,

  // Add message_secret column for existing installations
  (db) => {
    try {
      db.exec(`ALTER TABLE whatsapp_polls ADD COLUMN message_secret TEXT`);
      console.log('✅ Migration: Added message_secret column to whatsapp_polls table.');
    } catch (e) {
      // Column already exists
    }
  },

  // Add full_message_json column for existing installations
  (db) => {
    try {
      db.exec(`ALTER TABLE whatsapp_polls ADD COLUMN full_message_json TEXT`);
      console.log('✅ Migration: Added full_message_json column to whatsapp_polls table.');
    } catch (e) {
      // Column already exists
    }
  },

  // Add erp_status column for existing installations
  (db) => {
    try {
      db.exec(`ALTER TABLE whatsapp_polls ADD COLUMN erp_status TEXT`);
      console.log('✅ Migration: Added erp_status column to whatsapp_polls table.');
    } catch (e) {
      // Column already exists
    }
  }
];
