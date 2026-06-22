const {
  userOps, subscriptionOps, paymentOps, signalOps, settingsOps,
  pairOps, supportOps, trackingOps, historyOps, broadcastOps,
} = require('../utils/database');
const { activateSubscription, PLANS, getPlanPrice } = require('../bot/services/subscription');
const {
  adminKeyboard, mainKeyboard, userListInline, userDetailInline,
  grantSubInline, adminSignalPairsInline, adminFrequencyInline,
  adminStrategyInline, adminBroadcastConfirmInline, supportTicketsInline,
  paymentConfirmInline, adminSignalBroadcastInline, trackerStatusInline,
} = require('../bot/handlers/keyboards');
const { getTrackingStatusDisplay } = require('../tracker');

const pendingBroadcast = new Map();
const pendingMsgUser = new Map();
const pendingAddPair = new Map();
const pendingGetSignalPair = new Map(); // admin choosing pair for "Get Signal"

async function handleAdminPanel(ctx) {
  const users = userOps.getAll();
  const activeCount = subscriptionOps.countActive();
  const expiredCount = subscriptionOps.countExpired();
  const revenue = paymentOps.totalRevenue();
  const signalCount = signalOps.countTotal();
  const signalsToday = signalOps.countToday();
  const stats = trackingOps.getStats();
  const winRate = stats && stats.total > 0
    ? (((stats.full_wins || 0) + (stats.partial_wins || 0) + (stats.strong_partial_wins || 0)) / stats.total * 100).toFixed(1)
    : '—';

  const msg = `🛠 *Admin Panel*\n\n` +
    `👥 *Users:* ${users.length}\n` +
    `✅ *Active Subs:* ${activeCount}\n` +
    `❌ *Expired:* ${expiredCount}\n` +
    `💰 *Revenue:* $${revenue.toFixed(2)}\n` +
    `📊 *Signals Sent:* ${signalCount}\n` +
    `📅 *Signals Today:* ${signalsToday}\n` +
    `🏆 *Win Rate:* ${winRate}%`;

  await ctx.reply(msg, { parse_mode: 'Markdown', ...adminKeyboard() });
}

async function handleAdminUsers(ctx, page = 0) {
  const users = userOps.getAll();
  if (users.length === 0) {
    await ctx.reply('👥 No users yet.', adminKeyboard());
    return;
  }
  await ctx.reply(`👥 *Users (${users.length} total)*\n\nSelect a user to manage:`, {
    parse_mode: 'Markdown',
    ...userListInline(users, page),
  });
}

async function handleUserDetail(ctx, telegramId) {
  const user = userOps.findById(telegramId);
  if (!user) { await ctx.reply('User not found.'); return; }

  const sub = subscriptionOps.getActive(telegramId);
  const name = user.first_name || user.username || telegramId;
  const username = user.username ? ` (@${user.username})` : '';

  let msg = `👤 *User: ${name}${username}*\n\n`;
  msg += `🆔 ID: \`${telegramId}\`\n`;
  msg += `📅 Joined: ${new Date(user.joined_at).toLocaleDateString()}\n`;
  msg += `👁 Last seen: ${new Date(user.last_seen).toLocaleDateString()}\n`;
  msg += `📊 Signals received: ${user.signals_received}\n`;
  msg += `🚫 Blocked: ${user.is_blocked ? 'Yes' : 'No'}\n\n`;

  if (sub) {
    const expiresAt = sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : 'Lifetime';
    msg += `💳 *Subscription:* ✅ Active\nPlan: ${PLANS[sub.plan]?.label || sub.plan}\nExpires: ${expiresAt}`;
  } else {
    msg += `💳 *Subscription:* ❌ None`;
  }

  await ctx.reply(msg, { parse_mode: 'Markdown', ...userDetailInline(telegramId) });
}

async function handleAdminStatistics(ctx) {
  const users = userOps.getAll();
  const activeCount = subscriptionOps.countActive();
  const revenue = paymentOps.totalRevenue();
  const signalCount = signalOps.countTotal();
  const signalsToday = signalOps.countToday();
  const pendingPayments = paymentOps.pending().length;
  const openTickets = supportOps.getOpen().length;
  const autoEnabled = settingsOps.get('auto_signals_enabled') !== '0';
  const frequency = settingsOps.get('signal_frequency') || '15';

  const trackStats = trackingOps.getStats();
  const histStats = historyOps.getStats();

  const totalClosed = trackStats?.total || 0;
  const fullWins = trackStats?.full_wins || 0;
  const partialWins = (trackStats?.partial_wins || 0) + (trackStats?.strong_partial_wins || 0);
  const losses = trackStats?.losses || 0;
  const tp1Hits = trackStats?.tp1_hits || 0;
  const tp2Hits = trackStats?.tp2_hits || 0;
  const tp3Hits = trackStats?.tp3_hits || 0;
  const winRate = totalClosed > 0
    ? (((fullWins + partialWins) / totalClosed) * 100).toFixed(1)
    : '0.0';

  const activeTracking = trackingOps.getActive().length;
  const broadcastLogs = broadcastOps.getAll(5);
  const totalBroadcast = broadcastLogs.reduce((s, b) => s + (b.success_count || 0), 0);

  const msg = `📊 *Bot Statistics*\n\n` +
    `👥 *Total Users:* ${users.length}\n` +
    `✅ *Active Subscriptions:* ${activeCount}\n` +
    `💰 *Total Revenue:* $${revenue.toFixed(2)}\n\n` +

    `📈 *Signal Performance:*\n` +
    `Total Signals: *${signalCount}*\n` +
    `Signals Today: *${signalsToday}*\n` +
    `Active Tracking: *${activeTracking}*\n\n` +

    `🏆 *Results (Closed Signals):*\n` +
    `Full Wins: *${fullWins}* 🏆\n` +
    `Partial Wins: *${partialWins}* ⚠️\n` +
    `Losses: *${losses}* ❌\n` +
    `Win Rate: *${winRate}%*\n\n` +

    `🎯 *TP Performance:*\n` +
    `TP1 Hits: *${tp1Hits}*\n` +
    `TP2 Hits: *${tp2Hits}*\n` +
    `TP3 Hits: *${tp3Hits}*\n\n` +

    `📡 *Broadcasts:*\n` +
    `Total Delivered: *${totalBroadcast}*\n` +
    `Pending Payments: *${pendingPayments}*\n` +
    `Open Tickets: *${openTickets}*\n\n` +

    `⚙️ *Settings:*\n` +
    `Auto Signals: ${autoEnabled ? '✅' : '❌'}\n` +
    `Frequency: Every *${frequency} min*`;

  await ctx.reply(msg, { parse_mode: 'Markdown', ...adminKeyboard() });
}

async function handleAdminPayments(ctx) {
  const pending = paymentOps.pending();
  if (pending.length === 0) {
    await ctx.reply('💰 *Payments*\n\nNo pending payments.', { parse_mode: 'Markdown', ...adminKeyboard() });
    return;
  }
  for (const payment of pending.slice(0, 5)) {
    const name = payment.first_name || payment.username || payment.telegram_id;
    const planLabel = PLANS[payment.plan]?.label || payment.plan;
    const msg = `💰 *Payment Request #${payment.id}*\n\n👤 User: ${name}\n🆔 ID: \`${payment.telegram_id}\`\n📦 Plan: *${planLabel}*\n💵 Amount: *$${payment.amount}*\n📅 Date: ${new Date(payment.created_at).toLocaleString()}`;
    await ctx.reply(msg, { parse_mode: 'Markdown', ...paymentConfirmInline(payment.id, payment.telegram_id) });
  }
}

async function handleAdminSignals(ctx) {
  const settings = {};
  for (const s of settingsOps.getAll()) settings[s.key] = s.value;
  await ctx.reply('📈 *Signal Management*\n\nManage strategies and signal settings:', {
    parse_mode: 'Markdown',
    ...adminStrategyInline(settings),
  });
}

async function handleAdminGetSignal(ctx, bot) {
  const enabledPairs = pairOps.getEnabled();
  if (enabledPairs.length === 0) {
    await ctx.reply('❌ No pairs enabled. Enable pairs first.');
    return;
  }

  const { forceSendSignal, formatSignalMessage } = require('../scheduler');

  await ctx.reply('🔄 *Generating Signal...*\n\nAnalyzing markets, please wait...', { parse_mode: 'Markdown' });

  const signal = await forceSendSignal(null, ctx);
  if (!signal) return;

  // Save the signal to DB if not already saved
  const { generateSignalImage } = require('../utils/imageGen');

  const messageText = formatSignalMessage(signal);

  let imageBuffer = null;
  try {
    imageBuffer = await generateSignalImage(signal);
  } catch (err) {
    console.error('Image gen failed:', err.message);
  }

  // Send signal preview to admin with action buttons
  const adminMarkup = adminSignalBroadcastInline(signal.id);

  if (imageBuffer) {
    await ctx.replyWithPhoto({ source: imageBuffer }, {
      caption: messageText + '\n\n_⬆️ Use buttons below to broadcast or manage this signal._',
      parse_mode: 'Markdown',
      ...adminMarkup,
    });
  } else {
    await ctx.reply(messageText + '\n\n_⬆️ Use buttons below to broadcast or manage this signal._', {
      parse_mode: 'Markdown',
      ...adminMarkup,
    });
  }
}

async function handleAdminBroadcastSignal(ctx, bot, signalId) {
  const signal = signalOps.findById(signalId);
  if (!signal) {
    await ctx.answerCbQuery('❌ Signal not found');
    return;
  }

  await ctx.answerCbQuery('🚀 Broadcasting...');
  await ctx.reply('📡 *Broadcasting signal to all active users...*', { parse_mode: 'Markdown' });

  const { broadcastSignal, startTracking, formatSignalMessage } = require('../scheduler');

  // Build signal object from DB record
  const reasons = (() => { try { return JSON.parse(signal.reasons); } catch { return []; } })();
  const fullSignal = {
    id: signal.id,
    pair: signal.pair,
    direction: signal.direction,
    trend: signal.trend,
    entry: signal.entry,
    stopLoss: signal.stop_loss,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    riskReward: signal.risk_reward,
    confidence: signal.confidence,
    strategy: signal.strategy,
    timeframe: signal.timeframe,
    reasons,
  };

  const recipients = await broadcastSignal(fullSignal, ctx.from.id);

  // Start TP tracking if not already tracking
  const existing = trackingOps.findBySignalId(signalId);
  if (!existing) {
    startTracking(fullSignal, recipients, ctx.from.id);
  }

  const broadcastLog = broadcastOps.findBySignalId(signalId);
  const successCount = broadcastLog?.success_count || recipients.length;
  const totalUsers = broadcastLog?.total_users || recipients.length;
  const failedCount = broadcastLog?.failed_count || (totalUsers - successCount);

  await ctx.reply(
    `✅ *Signal Sent Successfully!*\n\n` +
    `👥 *Users Reached:* ${successCount}\n` +
    `❌ *Failed:* ${failedCount}\n` +
    `📊 *Signal ID:* #${signalId}\n\n` +
    `🔍 *TP/SL Tracking:* Started automatically\n\n` +
    `*Broadcast Completed.* 🎉`,
    { parse_mode: 'Markdown', ...adminKeyboard() }
  );
}

async function handleViewTracker(ctx, signalId) {
  const tracking = trackingOps.findBySignalId(signalId);
  const signal = signalOps.findById(signalId);

  if (!tracking || !signal) {
    await ctx.reply('❌ Tracker not found for this signal. It may not have been broadcast yet.', adminKeyboard());
    return;
  }

  const { tp1, tp2, tp3, sl, statusLabel } = getTrackingStatusDisplay(tracking);
  const recipients = broadcastOps.getRecipientsBySignal(signalId);

  const formatNum = (n) => {
    if (!n) return '—';
    const num = parseFloat(n);
    if (signal.pair === 'XAUUSD') return num.toFixed(2);
    if (signal.pair.includes('JPY')) return num.toFixed(3);
    return num.toFixed(5);
  };

  let msg = `📈 *Signal Tracker #${signalId}*\n\n`;
  msg += `🪙 *Pair:* ${tracking.pair}\n`;
  msg += `📍 *Direction:* ${tracking.direction}\n`;
  msg += `🎯 *Entry:* \`${formatNum(tracking.entry)}\`\n`;
  msg += `🛑 *Stop Loss:* \`${formatNum(tracking.stop_loss)}\`\n\n`;
  msg += `*Targets:*\n`;
  msg += `TP1: \`${formatNum(tracking.tp1)}\` → ${tp1}\n`;
  msg += `TP2: \`${formatNum(tracking.tp2)}\` → ${tp2}\n`;
  msg += `TP3: \`${formatNum(tracking.tp3)}\` → ${tp3}\n\n`;
  msg += `📊 *Status:* ${statusLabel}\n`;
  if (tracking.result) msg += `🏁 *Result:* ${tracking.result}\n`;
  msg += `👥 *Recipients:* ${recipients.length} users\n`;

  if (tracking.tp1_hit_at) msg += `\n🎯 TP1 hit: ${new Date(tracking.tp1_hit_at).toLocaleString()}`;
  if (tracking.tp2_hit_at) msg += `\n🚀 TP2 hit: ${new Date(tracking.tp2_hit_at).toLocaleString()}`;
  if (tracking.tp3_hit_at) msg += `\n🏆 TP3 hit: ${new Date(tracking.tp3_hit_at).toLocaleString()}`;
  if (tracking.sl_hit_at) msg += `\n❌ SL hit: ${new Date(tracking.sl_hit_at).toLocaleString()}`;

  msg += `\n\n_Last checked: ${tracking.last_checked ? new Date(tracking.last_checked).toLocaleString() : 'Not yet'}_`;

  await ctx.reply(msg, { parse_mode: 'Markdown', ...trackerStatusInline(signalId) });
}

async function handleAdminSignalHistory(ctx) {
  const history = historyOps.getAll(20);
  const stats = trackingOps.getStats();

  if (history.length === 0) {
    await ctx.reply('📜 *Signal History*\n\nNo completed signals yet.', { parse_mode: 'Markdown', ...adminKeyboard() });
    return;
  }

  const fullWins = stats?.full_wins || 0;
  const partialWins = (stats?.partial_wins || 0) + (stats?.strong_partial_wins || 0);
  const losses = stats?.losses || 0;
  const total = stats?.total || 0;
  const winRate = total > 0 ? (((fullWins + partialWins) / total) * 100).toFixed(1) : '0.0';

  let msg = `📜 *Signal History (Last 20)*\n\n`;
  msg += `🏆 Wins: ${fullWins} | ⚠️ Partial: ${partialWins} | ❌ Loss: ${losses}\n`;
  msg += `📊 Win Rate: *${winRate}%*\n`;
  msg += `🎯 TP1: ${stats?.tp1_hits || 0} | TP2: ${stats?.tp2_hits || 0} | TP3: ${stats?.tp3_hits || 0}\n\n`;

  for (const h of history.slice(0, 10)) {
    const arrow = h.direction === 'BUY' ? '🟢' : '🔴';
    const resultEmoji = h.result === 'FULL WIN' ? '🏆' : h.result?.includes('PARTIAL') ? '⚠️' : '❌';
    msg += `${arrow} *${h.pair}* ${resultEmoji} ${h.result || '?'}\n`;
    msg += `  TP Reached: ${h.tp_level_reached}/3 | ${new Date(h.closed_at).toLocaleDateString()}\n`;
  }

  await ctx.reply(msg, { parse_mode: 'Markdown', ...adminKeyboard() });
}

async function handleAdminPairs(ctx) {
  const pairs = pairOps.getAll();
  await ctx.reply('📊 *Pair Management*\n\nToggle pairs on/off:', {
    parse_mode: 'Markdown',
    ...adminSignalPairsInline(pairs),
  });
}

async function handleAdminBroadcast(ctx, userId) {
  pendingBroadcast.set(String(userId), true);
  await ctx.reply(
    '📢 *Broadcast Message*\n\nType the message you want to send to ALL users:\n\n_Type /cancel to cancel._',
    { parse_mode: 'Markdown', ...require('../bot/handlers/keyboards').backKeyboard() }
  );
}

async function sendBroadcast(ctx, bot, text) {
  const users = userOps.getAll().filter(u => !u.is_blocked);
  let sent = 0, failed = 0;
  await ctx.reply(`📢 Sending to ${users.length} users...`);

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.telegram_id, text, { parse_mode: 'Markdown' });
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) {
      failed++;
      if (e.message.includes('blocked') || e.message.includes('deactivated')) {
        userOps.block(user.telegram_id);
      }
    }
  }

  await ctx.reply(`✅ Broadcast complete!\n\n📤 Sent: ${sent}\n❌ Failed: ${failed}`, adminKeyboard());
}

async function handleAdminSystem(ctx) {
  const autoEnabled = settingsOps.get('auto_signals_enabled') !== '0';
  const trackingEnabled = settingsOps.get('tracking_enabled') !== '0';
  const frequency = settingsOps.get('signal_frequency') || '15';
  const enabledPairs = pairOps.getEnabled();
  const botName = settingsOps.get('bot_name') || 'Hope Forex Signals';
  const activeTracking = trackingOps.getActive().length;

  const msg = `🛠 *System Settings*\n\n` +
    `🤖 *Bot Name:* ${botName}\n` +
    `⚡ *Auto Signals:* ${autoEnabled ? '✅ ON' : '❌ OFF'}\n` +
    `🔍 *TP Tracking:* ${trackingEnabled ? '✅ ON' : '❌ OFF'}\n` +
    `⏱ *Frequency:* Every ${frequency} min\n` +
    `📊 *Active Pairs:* ${enabledPairs.length}\n` +
    `   ${enabledPairs.join(', ')}\n` +
    `🎯 *Active Signals Tracked:* ${activeTracking}\n\n` +
    `*Subscription Prices:*\n` +
    `1 Week: $${settingsOps.get('price_1week')}\n` +
    `1 Month: $${settingsOps.get('price_1month')}\n` +
    `3 Months: $${settingsOps.get('price_3months')}\n` +
    `Lifetime: $${settingsOps.get('price_lifetime')}`;

  await ctx.reply(msg, { parse_mode: 'Markdown', ...adminKeyboard() });
}

async function handleSupportTickets(ctx) {
  const tickets = supportOps.getOpen();
  if (tickets.length === 0) {
    await ctx.reply('🎫 No open support tickets.', adminKeyboard());
    return;
  }
  await ctx.reply(`🎫 *Open Support Tickets (${tickets.length})*\n\nSelect a ticket to reply:`, {
    parse_mode: 'Markdown',
    ...supportTicketsInline(tickets),
  });
}

module.exports = {
  handleAdminPanel,
  handleAdminUsers,
  handleUserDetail,
  handleAdminStatistics,
  handleAdminPayments,
  handleAdminSignals,
  handleAdminGetSignal,
  handleAdminBroadcastSignal,
  handleViewTracker,
  handleAdminSignalHistory,
  handleAdminPairs,
  handleAdminBroadcast,
  sendBroadcast,
  handleAdminSystem,
  handleSupportTickets,
  pendingBroadcast,
  pendingMsgUser,
  pendingAddPair,
  pendingGetSignalPair,
};
