const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/database.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      language_code TEXT DEFAULT 'en',
      is_blocked INTEGER DEFAULT 0,
      signals_received INTEGER DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      payment_id INTEGER,
      FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending',
      transaction_id TEXT,
      payment_method TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      confirmed_by TEXT,
      FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair TEXT NOT NULL,
      direction TEXT NOT NULL,
      trend TEXT NOT NULL,
      entry REAL NOT NULL,
      stop_loss REAL NOT NULL,
      tp1 REAL NOT NULL,
      tp2 REAL NOT NULL,
      tp3 REAL NOT NULL,
      risk_reward TEXT,
      confidence INTEGER,
      strategy TEXT,
      timeframe TEXT,
      reasons TEXT,
      status TEXT DEFAULT 'active',
      sent_to INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signal_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER NOT NULL,
      pair TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry REAL NOT NULL,
      stop_loss REAL NOT NULL,
      tp1 REAL NOT NULL,
      tp2 REAL NOT NULL,
      tp3 REAL NOT NULL,
      tp1_hit INTEGER DEFAULT 0,
      tp2_hit INTEGER DEFAULT 0,
      tp3_hit INTEGER DEFAULT 0,
      sl_hit INTEGER DEFAULT 0,
      tp1_hit_at DATETIME,
      tp2_hit_at DATETIME,
      tp3_hit_at DATETIME,
      sl_hit_at DATETIME,
      status TEXT DEFAULT 'pending',
      result TEXT,
      last_checked DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY(signal_id) REFERENCES signals(id)
    );

    CREATE TABLE IF NOT EXISTS signal_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER NOT NULL,
      pair TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry REAL NOT NULL,
      stop_loss REAL NOT NULL,
      tp1 REAL NOT NULL,
      tp2 REAL NOT NULL,
      tp3 REAL NOT NULL,
      tp_level_reached INTEGER DEFAULT 0,
      result TEXT NOT NULL,
      confidence INTEGER,
      strategy TEXT,
      timeframe TEXT,
      closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(signal_id) REFERENCES signals(id)
    );

    CREATE TABLE IF NOT EXISTS broadcast_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER NOT NULL,
      admin_id TEXT,
      total_users INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      broadcast_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(signal_id) REFERENCES signals(id)
    );

    CREATE TABLE IF NOT EXISTS broadcast_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      broadcast_id INTEGER NOT NULL,
      signal_id INTEGER NOT NULL,
      telegram_id TEXT NOT NULL,
      delivered INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(broadcast_id) REFERENCES broadcast_logs(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      admin_reply TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      replied_at DATETIME,
      FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS pair_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair TEXT UNIQUE NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      strategy_override TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Default settings
  const defaultSettings = [
    ['signal_frequency', '15'],
    ['strategy_1_enabled', '1'],
    ['strategy_2_enabled', '1'],
    ['strategy_3_enabled', '1'],
    ['strategy_4_enabled', '1'],
    ['auto_signals_enabled', '1'],
    ['signals_enabled', '1'],
    ['bot_name', 'Hope Forex Signals'],
    ['support_username', ''],
    ['price_1week', '9.99'],
    ['price_1month', '29.99'],
    ['price_3months', '79.99'],
    ['price_lifetime', '199.99'],
    ['min_confidence', '70'],
    ['tracking_enabled', '1'],
    ['welcome_message', '🚀 Welcome to Hope Forex Signals\n\nAI Powered Forex & Gold Signals\n\n✅ Real Time Signals\n✅ Gold Signals\n✅ Forex Signals\n✅ Smart Money Concepts\n✅ Risk Management'],
  ];

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }

  const defaultPairs = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURGBP'];
  const insertPair = db.prepare('INSERT OR IGNORE INTO pair_settings (pair, is_enabled) VALUES (?, 1)');
  for (const pair of defaultPairs) {
    insertPair.run(pair);
  }

  console.log('✅ Database initialized successfully');
}

// ─── User Operations ───────────────────────────────────────────────────────
const userOps = {
  upsert(user) {
    return db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, last_name, language_code)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        last_seen = CURRENT_TIMESTAMP
    `).run(String(user.id), user.username || null, user.first_name || null, user.last_name || null, user.language_code || 'en');
  },
  findById(telegramId) {
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId));
  },
  getAll() {
    return db.prepare('SELECT * FROM users ORDER BY joined_at DESC').all();
  },
  count() {
    return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  },
  incrementSignals(telegramId) {
    return db.prepare('UPDATE users SET signals_received = signals_received + 1 WHERE telegram_id = ?').run(String(telegramId));
  },
  block(telegramId) {
    return db.prepare('UPDATE users SET is_blocked = 1 WHERE telegram_id = ?').run(String(telegramId));
  },
  unblock(telegramId) {
    return db.prepare('UPDATE users SET is_blocked = 0 WHERE telegram_id = ?').run(String(telegramId));
  },
};

// ─── Subscription Operations ────────────────────────────────────────────────
const subscriptionOps = {
  create(telegramId, plan, expiresAt, paymentId = null) {
    db.prepare("UPDATE subscriptions SET status = 'expired' WHERE telegram_id = ? AND status = 'active'").run(String(telegramId));
    return db.prepare(`
      INSERT INTO subscriptions (telegram_id, plan, status, expires_at, payment_id)
      VALUES (?, ?, 'active', ?, ?)
    `).run(String(telegramId), plan, expiresAt, paymentId);
  },
  getActive(telegramId) {
    return db.prepare(`
      SELECT * FROM subscriptions WHERE telegram_id = ? AND status = 'active'
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY id DESC LIMIT 1
    `).get(String(telegramId));
  },
  isActive(telegramId) {
    return !!this.getActive(telegramId);
  },
  expireOld() {
    return db.prepare(`
      UPDATE subscriptions SET status = 'expired'
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
    `).run();
  },
  countActive() {
    return db.prepare(`
      SELECT COUNT(DISTINCT telegram_id) as count FROM subscriptions
      WHERE status = 'active' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `).get().count;
  },
  countExpired() {
    return db.prepare(`
      SELECT COUNT(DISTINCT telegram_id) as count FROM subscriptions
      WHERE status = 'expired' OR (status = 'active' AND expires_at <= CURRENT_TIMESTAMP)
    `).get().count;
  },
};

// ─── Payment Operations ─────────────────────────────────────────────────────
const paymentOps = {
  create(telegramId, plan, amount) {
    return db.prepare(`
      INSERT INTO payments (telegram_id, plan, amount, status) VALUES (?, ?, ?, 'pending')
    `).run(String(telegramId), plan, amount).lastInsertRowid;
  },
  confirm(paymentId, adminId, transactionId = null) {
    return db.prepare(`
      UPDATE payments SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP,
        confirmed_by = ?, transaction_id = ? WHERE id = ?
    `).run(String(adminId), transactionId, paymentId);
  },
  findById(paymentId) {
    return db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  },
  getByUser(telegramId) {
    return db.prepare('SELECT * FROM payments WHERE telegram_id = ? ORDER BY created_at DESC').all(String(telegramId));
  },
  getAll(limit = 50) {
    return db.prepare(`
      SELECT p.*, u.username, u.first_name FROM payments p
      LEFT JOIN users u ON p.telegram_id = u.telegram_id
      ORDER BY p.created_at DESC LIMIT ?
    `).all(limit);
  },
  totalRevenue() {
    return db.prepare("SELECT SUM(amount) as total FROM payments WHERE status = 'confirmed'").get().total || 0;
  },
  pending() {
    return db.prepare(`
      SELECT p.*, u.username, u.first_name FROM payments p
      LEFT JOIN users u ON p.telegram_id = u.telegram_id
      WHERE p.status = 'pending' ORDER BY p.created_at DESC
    `).all();
  },
};

// ─── Signal Operations ──────────────────────────────────────────────────────
const signalOps = {
  create(signal) {
    return db.prepare(`
      INSERT INTO signals (pair, direction, trend, entry, stop_loss, tp1, tp2, tp3,
        risk_reward, confidence, strategy, timeframe, reasons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      signal.pair, signal.direction, signal.trend, signal.entry,
      signal.stopLoss, signal.tp1, signal.tp2, signal.tp3,
      signal.riskReward, signal.confidence, signal.strategy,
      signal.timeframe, JSON.stringify(signal.reasons)
    ).lastInsertRowid;
  },
  updateSentCount(signalId, count) {
    return db.prepare('UPDATE signals SET sent_to = ? WHERE id = ?').run(count, signalId);
  },
  updateStatus(signalId, status) {
    return db.prepare('UPDATE signals SET status = ? WHERE id = ?').run(status, signalId);
  },
  getRecent(limit = 10) {
    return db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?').all(limit);
  },
  getActive() {
    return db.prepare("SELECT * FROM signals WHERE status = 'active' ORDER BY created_at DESC").all();
  },
  findById(id) {
    return db.prepare('SELECT * FROM signals WHERE id = ?').get(id);
  },
  countTotal() {
    return db.prepare('SELECT COUNT(*) as count FROM signals').get().count;
  },
  countToday() {
    return db.prepare("SELECT COUNT(*) as count FROM signals WHERE DATE(created_at) = DATE('now')").get().count;
  },
};

// ─── Signal Tracking Operations ─────────────────────────────────────────────
const trackingOps = {
  create(signal) {
    return db.prepare(`
      INSERT INTO signal_tracking (signal_id, pair, direction, entry, stop_loss, tp1, tp2, tp3, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      signal.id || signal.signal_id,
      signal.pair, signal.direction,
      signal.entry, signal.stopLoss || signal.stop_loss,
      signal.tp1, signal.tp2, signal.tp3
    ).lastInsertRowid;
  },

  getActive() {
    return db.prepare(`
      SELECT * FROM signal_tracking
      WHERE status NOT IN ('closed', 'full_win', 'loss', 'partial_win', 'strong_partial_win')
      ORDER BY created_at ASC
    `).all();
  },

  findBySignalId(signalId) {
    return db.prepare('SELECT * FROM signal_tracking WHERE signal_id = ?').get(signalId);
  },

  markTP1(trackingId) {
    return db.prepare(`
      UPDATE signal_tracking SET tp1_hit = 1, tp1_hit_at = CURRENT_TIMESTAMP,
        status = 'tp1_hit', last_checked = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(trackingId);
  },

  markTP2(trackingId) {
    return db.prepare(`
      UPDATE signal_tracking SET tp2_hit = 1, tp2_hit_at = CURRENT_TIMESTAMP,
        status = 'tp2_hit', last_checked = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(trackingId);
  },

  markTP3(trackingId) {
    return db.prepare(`
      UPDATE signal_tracking SET tp3_hit = 1, tp3_hit_at = CURRENT_TIMESTAMP,
        status = 'full_win', result = 'FULL WIN', closed_at = CURRENT_TIMESTAMP,
        last_checked = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(trackingId);
  },

  markSL(trackingId, tp1Hit, tp2Hit) {
    let status, result;
    if (!tp1Hit) {
      status = 'loss'; result = 'LOSS';
    } else if (!tp2Hit) {
      status = 'partial_win'; result = 'PARTIAL WIN';
    } else {
      status = 'strong_partial_win'; result = 'STRONG PARTIAL WIN';
    }
    return db.prepare(`
      UPDATE signal_tracking SET sl_hit = 1, sl_hit_at = CURRENT_TIMESTAMP,
        status = ?, result = ?, closed_at = CURRENT_TIMESTAMP, last_checked = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, result, trackingId);
  },

  updateLastChecked(trackingId) {
    return db.prepare('UPDATE signal_tracking SET last_checked = CURRENT_TIMESTAMP WHERE id = ?').run(trackingId);
  },

  getStats() {
    const rows = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'FULL WIN' THEN 1 ELSE 0 END) as full_wins,
        SUM(CASE WHEN result = 'PARTIAL WIN' THEN 1 ELSE 0 END) as partial_wins,
        SUM(CASE WHEN result = 'STRONG PARTIAL WIN' THEN 1 ELSE 0 END) as strong_partial_wins,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN tp1_hit = 1 THEN 1 ELSE 0 END) as tp1_hits,
        SUM(CASE WHEN tp2_hit = 1 THEN 1 ELSE 0 END) as tp2_hits,
        SUM(CASE WHEN tp3_hit = 1 THEN 1 ELSE 0 END) as tp3_hits
      FROM signal_tracking
      WHERE status NOT IN ('pending', 'tp1_hit', 'tp2_hit')
    `).get();
    return rows;
  },

  getRecentClosed(limit = 10) {
    return db.prepare(`
      SELECT * FROM signal_tracking
      WHERE closed_at IS NOT NULL
      ORDER BY closed_at DESC LIMIT ?
    `).all(limit);
  },
};

// ─── Signal History Operations ───────────────────────────────────────────────
const historyOps = {
  create(data) {
    return db.prepare(`
      INSERT INTO signal_history (signal_id, pair, direction, entry, stop_loss,
        tp1, tp2, tp3, tp_level_reached, result, confidence, strategy, timeframe)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.signal_id, data.pair, data.direction, data.entry, data.stop_loss,
      data.tp1, data.tp2, data.tp3, data.tp_level_reached || 0,
      data.result, data.confidence, data.strategy, data.timeframe
    );
  },

  getAll(limit = 20) {
    return db.prepare('SELECT * FROM signal_history ORDER BY closed_at DESC LIMIT ?').all(limit);
  },

  getRecent(limit = 10) {
    return db.prepare('SELECT * FROM signal_history ORDER BY closed_at DESC LIMIT ?').all(limit);
  },

  getStats() {
    return db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'FULL WIN' THEN 1 ELSE 0 END) as full_wins,
        SUM(CASE WHEN result LIKE '%PARTIAL%' THEN 1 ELSE 0 END) as partial_wins,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses
      FROM signal_history
    `).get();
  },
};

// ─── Broadcast Log Operations ────────────────────────────────────────────────
const broadcastOps = {
  create(signalId, adminId) {
    return db.prepare(`
      INSERT INTO broadcast_logs (signal_id, admin_id) VALUES (?, ?)
    `).run(signalId, String(adminId || 'auto')).lastInsertRowid;
  },

  update(broadcastId, totalUsers, successCount, failedCount) {
    return db.prepare(`
      UPDATE broadcast_logs SET total_users = ?, success_count = ?, failed_count = ?
      WHERE id = ?
    `).run(totalUsers, successCount, failedCount, broadcastId);
  },

  addRecipient(broadcastId, signalId, telegramId) {
    return db.prepare(`
      INSERT OR IGNORE INTO broadcast_recipients (broadcast_id, signal_id, telegram_id)
      VALUES (?, ?, ?)
    `).run(broadcastId, signalId, String(telegramId));
  },

  getRecipientsBySignal(signalId) {
    return db.prepare(`
      SELECT DISTINCT telegram_id FROM broadcast_recipients WHERE signal_id = ?
    `).all(signalId).map(r => r.telegram_id);
  },

  getAll(limit = 20) {
    return db.prepare(`
      SELECT bl.*, s.pair, s.direction FROM broadcast_logs bl
      LEFT JOIN signals s ON bl.signal_id = s.id
      ORDER BY bl.broadcast_time DESC LIMIT ?
    `).all(limit);
  },

  findBySignalId(signalId) {
    return db.prepare('SELECT * FROM broadcast_logs WHERE signal_id = ? LIMIT 1').get(signalId);
  },
};

// ─── Settings Operations ─────────────────────────────────────────────────────
const settingsOps = {
  get(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },
  set(key, value) {
    return db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value));
  },
  getAll() {
    return db.prepare('SELECT * FROM settings').all();
  },
};

// ─── Support Ticket Operations ───────────────────────────────────────────────
const supportOps = {
  create(telegramId, message) {
    return db.prepare('INSERT INTO support_tickets (telegram_id, message) VALUES (?, ?)').run(String(telegramId), message);
  },
  reply(ticketId, adminReply) {
    return db.prepare(`
      UPDATE support_tickets SET status = 'replied', admin_reply = ?, replied_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(adminReply, ticketId);
  },
  getOpen() {
    return db.prepare(`
      SELECT st.*, u.username, u.first_name FROM support_tickets st
      LEFT JOIN users u ON st.telegram_id = u.telegram_id
      WHERE st.status = 'open' ORDER BY st.created_at DESC
    `).all();
  },
  getByUser(telegramId) {
    return db.prepare('SELECT * FROM support_tickets WHERE telegram_id = ? ORDER BY created_at DESC').all(String(telegramId));
  },
  findById(id) {
    return db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
  },
};

// ─── Pair Settings Operations ────────────────────────────────────────────────
const pairOps = {
  getEnabled() {
    return db.prepare('SELECT pair FROM pair_settings WHERE is_enabled = 1').all().map(r => r.pair);
  },
  getAll() {
    return db.prepare('SELECT * FROM pair_settings ORDER BY pair').all();
  },
  toggle(pair) {
    const current = db.prepare('SELECT is_enabled FROM pair_settings WHERE pair = ?').get(pair);
    if (!current) {
      db.prepare('INSERT INTO pair_settings (pair, is_enabled) VALUES (?, 1)').run(pair);
      return true;
    }
    const newState = current.is_enabled ? 0 : 1;
    db.prepare('UPDATE pair_settings SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE pair = ?').run(newState, pair);
    return newState === 1;
  },
  enable(pair) {
    return db.prepare(`
      INSERT INTO pair_settings (pair, is_enabled) VALUES (?, 1)
      ON CONFLICT(pair) DO UPDATE SET is_enabled = 1, updated_at = CURRENT_TIMESTAMP
    `).run(pair);
  },
  disable(pair) {
    return db.prepare('UPDATE pair_settings SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE pair = ?').run(pair);
  },
};

module.exports = {
  db,
  initDatabase,
  userOps,
  subscriptionOps,
  paymentOps,
  signalOps,
  trackingOps,
  historyOps,
  broadcastOps,
  settingsOps,
  supportOps,
  pairOps,
};
