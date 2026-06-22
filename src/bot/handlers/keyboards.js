const { Markup } = require('telegraf');

const ADMIN_ID = process.env.ADMIN_CHAT_ID;

function isAdmin(userId) {
  return String(userId) === String(ADMIN_ID);
}

function mainKeyboard(userId) {
  if (isAdmin(userId)) return adminKeyboard();
  return Markup.keyboard([
    ['📊 Signals', '📈 Market Trend'],
    ['👤 My Account', '💳 Subscription'],
    ['📞 Support', 'ℹ️ Help'],
    ['📜 Signal History', '⚙️ Settings'],
  ]).resize().persistent();
}

function adminKeyboard() {
  return Markup.keyboard([
    ['👥 Users', '📊 Statistics'],
    ['💰 Payments', '📢 Broadcast'],
    ['📈 Signals', '⚙️ Settings'],
    ['🛠 System', '🔙 User View'],
  ]).resize().persistent();
}

function backKeyboard() {
  return Markup.keyboard([['🔙 Back']]).resize();
}

function subscriptionInline(plans) {
  const buttons = Object.entries(plans).map(([key, plan]) => {
    const price = require('../services/subscription').getPlanPrice(key);
    return [Markup.button.callback(`${plan.label} — $${price?.toFixed(2) || '?'}`, `subscribe_${key}`)];
  });
  buttons.push([Markup.button.callback('🔙 Back', 'back_main')]);
  return Markup.inlineKeyboard(buttons);
}

function signalActionsInline(signalId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Still Valid', `signal_valid_${signalId}`),
      Markup.button.callback('❌ Cancel Signal', `signal_cancel_${signalId}`),
    ],
    [Markup.button.callback('📊 View All Signals', 'view_signals')],
  ]);
}

// Admin signal broadcast panel — shown after "Get Signal"
function adminSignalBroadcastInline(signalId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Send To All Users', `broadcast_signal_${signalId}`)],
    [
      Markup.button.callback('📈 View Tracker', `view_tracker_${signalId}`),
      Markup.button.callback('📊 View Statistics', 'admin_stats_inline'),
    ],
    [
      Markup.button.callback('🗑 Delete Signal', `delete_signal_${signalId}`),
      Markup.button.callback('🔙 Back', 'admin_back'),
    ],
  ]);
}

function paymentConfirmInline(paymentId, userId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Confirm Payment', `confirm_pay_${paymentId}_${userId}`),
      Markup.button.callback('❌ Reject', `reject_pay_${paymentId}`),
    ],
  ]);
}

function adminSignalPairsInline(pairs) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const row = [Markup.button.callback(pairs[i].pair + (pairs[i].is_enabled ? ' ✅' : ' ❌'), `toggle_pair_${pairs[i].pair}`)];
    if (pairs[i + 1]) {
      row.push(Markup.button.callback(pairs[i + 1].pair + (pairs[i + 1].is_enabled ? ' ✅' : ' ❌'), `toggle_pair_${pairs[i + 1].pair}`));
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback('➕ Add Pair', 'add_pair'), Markup.button.callback('🔙 Back', 'admin_back')]);
  return Markup.inlineKeyboard(rows);
}

function adminFrequencyInline() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('5 min', 'freq_5'),
      Markup.button.callback('10 min', 'freq_10'),
      Markup.button.callback('15 min', 'freq_15'),
    ],
    [
      Markup.button.callback('30 min', 'freq_30'),
      Markup.button.callback('1 hour', 'freq_60'),
    ],
    [Markup.button.callback('🔙 Back', 'admin_back')],
  ]);
}

function adminStrategyInline(settings) {
  const s = (key) => settings[key] !== '0' ? '✅' : '❌';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`S1: SMC ${s('strategy_1_enabled')}`, 'toggle_s1'),
      Markup.button.callback(`S2: S&D ${s('strategy_2_enabled')}`, 'toggle_s2'),
    ],
    [
      Markup.button.callback(`S3: EMA/RSI ${s('strategy_3_enabled')}`, 'toggle_s3'),
      Markup.button.callback(`S4: Trend ${s('strategy_4_enabled')}`, 'toggle_s4'),
    ],
    [Markup.button.callback(`Auto Signals: ${s('auto_signals_enabled')}`, 'toggle_auto')],
    [
      Markup.button.callback('🎯 Get Signal', 'admin_get_signal'),
      Markup.button.callback('⚡ Force Send', 'force_signal'),
    ],
    [
      Markup.button.callback('⏱ Change Frequency', 'change_freq'),
      Markup.button.callback('📊 Pair Manager', 'admin_pairs'),
    ],
    [
      Markup.button.callback('📜 Signal History', 'admin_signal_history'),
      Markup.button.callback('🔙 Back', 'admin_back'),
    ],
  ]);
}

function adminBroadcastConfirmInline() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Yes, Send to All', 'broadcast_confirm'),
      Markup.button.callback('❌ Cancel', 'admin_back'),
    ],
  ]);
}

function supportTicketsInline(tickets) {
  const buttons = tickets.slice(0, 10).map(t => {
    const name = t.first_name || t.username || t.telegram_id;
    return [Markup.button.callback(`#${t.id} - ${name}: ${t.message.substring(0, 30)}...`, `reply_ticket_${t.id}`)];
  });
  buttons.push([Markup.button.callback('🔙 Back', 'admin_back')]);
  return Markup.inlineKeyboard(buttons);
}

function userListInline(users, page = 0) {
  const pageSize = 8;
  const start = page * pageSize;
  const chunk = users.slice(start, start + pageSize);
  const buttons = chunk.map(u => {
    const name = u.first_name || u.username || u.telegram_id;
    return [Markup.button.callback(`${name} (${u.telegram_id})`, `user_detail_${u.telegram_id}`)];
  });
  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('⬅️ Prev', `users_page_${page - 1}`));
  if (start + pageSize < users.length) nav.push(Markup.button.callback('➡️ Next', `users_page_${page + 1}`));
  if (nav.length) buttons.push(nav);
  buttons.push([Markup.button.callback('🔙 Back', 'admin_back')]);
  return Markup.inlineKeyboard(buttons);
}

function userDetailInline(telegramId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💳 Grant Sub', `grant_sub_${telegramId}`),
      Markup.button.callback('🚫 Block', `block_user_${telegramId}`),
    ],
    [Markup.button.callback('📩 Message User', `msg_user_${telegramId}`)],
    [Markup.button.callback('🔙 Back to Users', 'admin_users')],
  ]);
}

function grantSubInline(telegramId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('1 Week', `grant_1week_${telegramId}`),
      Markup.button.callback('1 Month', `grant_1month_${telegramId}`),
    ],
    [
      Markup.button.callback('3 Months', `grant_3months_${telegramId}`),
      Markup.button.callback('Lifetime', `grant_lifetime_${telegramId}`),
    ],
    [Markup.button.callback('🔙 Back', `user_detail_${telegramId}`)],
  ]);
}

function trackerStatusInline(signalId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Refresh', `view_tracker_${signalId}`),
      Markup.button.callback('🗑 Close Signal', `delete_signal_${signalId}`),
    ],
    [Markup.button.callback('🔙 Back', 'admin_back')],
  ]);
}

function signalHistoryPaginationInline(page, total, isAdmin = false) {
  const buttons = [];
  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('⬅️ Prev', `history_page_${page - 1}`));
  if ((page + 1) * 5 < total) nav.push(Markup.button.callback('➡️ Next', `history_page_${page + 1}`));
  if (nav.length) buttons.push(nav);
  if (isAdmin) buttons.push([Markup.button.callback('📊 Full Stats', 'admin_stats_inline')]);
  buttons.push([Markup.button.callback('🔙 Back', 'back_main')]);
  return Markup.inlineKeyboard(buttons);
}

module.exports = {
  isAdmin,
  mainKeyboard,
  adminKeyboard,
  backKeyboard,
  subscriptionInline,
  signalActionsInline,
  adminSignalBroadcastInline,
  paymentConfirmInline,
  adminSignalPairsInline,
  adminFrequencyInline,
  adminStrategyInline,
  adminBroadcastConfirmInline,
  supportTicketsInline,
  userListInline,
  userDetailInline,
  grantSubInline,
  trackerStatusInline,
  signalHistoryPaginationInline,
};
