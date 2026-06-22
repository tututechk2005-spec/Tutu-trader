const path = require('path');
const fs = require('fs');
const { userOps, subscriptionOps, signalOps, settingsOps, pairOps, historyOps, trackingOps } = require('../../utils/database');
const { isSubscribed, getSubscriptionInfo, formatPlansMessage, PLANS } = require('../services/subscription');
const { mainKeyboard, backKeyboard, subscriptionInline, signalHistoryPaginationInline, isAdmin } = require('./keyboards');
const { getTrackingStatusDisplay } = require('../../tracker');

const ASSETS_DIR = path.join(__dirname, '../../../assets');

async function handleSignals(ctx) {
  const userId = ctx.from.id;
  userOps.upsert(ctx.from);

  if (!isSubscribed(userId)) {
    const bannerPath = path.join(ASSETS_DIR, 'premium-banner.jpg');
    const msg = '🔒 *Premium Access Required*\n\nYou need an active subscription to receive signals.\n\nSubscribe now to unlock:\n• Real-time Forex & Gold signals\n• AI-powered analysis\n• 24/7 auto signals\n• TP/SL tracking notifications\n• Risk management';
    if (fs.existsSync(bannerPath)) {
      try {
        await ctx.replyWithPhoto({ source: bannerPath }, { caption: msg, parse_mode: 'Markdown', ...subscriptionInline(PLANS) });
        return;
      } catch (e) { /* fall through */ }
    }
    await ctx.reply(msg, { parse_mode: 'Markdown', ...subscriptionInline(PLANS) });
    return;
  }

  const recentSignals = signalOps.getRecent(5);

  if (recentSignals.length === 0) {
    await ctx.reply(
      '📊 *Live Signals*\n\nNo signals have been generated yet.\n\n⏰ Signals are sent automatically. Make sure you have an active subscription to receive them when they arrive.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  let msg = '📊 *Recent Signals*\n\n';
  for (const sig of recentSignals) {
    const arrow = sig.direction === 'BUY' ? '🟢' : '🔴';
    const tracking = trackingOps.findBySignalId(sig.id);
    let statusBadge = '';
    if (tracking) {
      const { statusLabel } = getTrackingStatusDisplay(tracking);
      statusBadge = ` — ${statusLabel}`;
    }

    const reasons = (() => { try { return JSON.parse(sig.reasons); } catch { return []; } })();
    msg += `${arrow} *${sig.direction} ${sig.pair}*${statusBadge}\n`;
    msg += `Entry: \`${sig.entry}\` | SL: \`${sig.stop_loss}\`\n`;
    msg += `TP1: \`${sig.tp1}\` TP2: \`${sig.tp2}\` TP3: \`${sig.tp3}\`\n`;
    msg += `Confidence: ${sig.confidence}% | ${sig.timeframe || 'H1'}\n`;
    if (reasons.length > 0) msg += `_${reasons[0]}_\n`;
    msg += `🕐 ${new Date(sig.created_at).toUTCString()}\n\n`;
  }

  await ctx.reply(msg, { parse_mode: 'Markdown', ...mainKeyboard(ctx.from.id) });
}

async function handleMarketTrend(ctx) {
  userOps.upsert(ctx.from);

  if (!isSubscribed(ctx.from.id)) {
    await ctx.reply('🔒 *Premium Required*\n\nSubscribe to access market trend analysis.', {
      parse_mode: 'Markdown', ...subscriptionInline(PLANS),
    });
    return;
  }

  const enabledPairs = pairOps.getEnabled();
  const recentSignals = signalOps.getRecent(30);

  let msg = '📈 *Market Trend Overview*\n\n';
  for (const pair of enabledPairs.slice(0, 9)) {
    const pairSigs = recentSignals.filter(s => s.pair === pair);
    if (pairSigs.length === 0) {
      msg += `• *${pair}*: ⏳ Analyzing...\n`;
    } else {
      const latest = pairSigs[0];
      const tracking = trackingOps.findBySignalId(latest.id);
      const arrow = latest.direction === 'BUY' ? '🟢 ▲' : '🔴 ▼';
      let statusSuffix = '';
      if (tracking) {
        const { statusLabel } = getTrackingStatusDisplay(tracking);
        statusSuffix = ` | ${statusLabel}`;
      }
      msg += `• *${pair}*: ${arrow} ${latest.trend} (${latest.confidence}%)${statusSuffix}\n`;
    }
  }

  msg += `\n_Updated: ${new Date().toUTCString()}_`;

  await ctx.reply(msg, { parse_mode: 'Markdown', ...mainKeyboard(ctx.from.id) });
}

async function handleMyAccount(ctx) {
  userOps.upsert(ctx.from);
  const userId = String(ctx.from.id);
  const user = userOps.findById(userId);
  const subInfo = getSubscriptionInfo(userId);

  const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Unknown';
  const username = ctx.from.username ? `@${ctx.from.username}` : 'Not set';

  let msg = `👤 *My Account*\n\n`;
  msg += `📋 *Name:* ${name}\n`;
  msg += `🆔 *User ID:* \`${userId}\`\n`;
  msg += `👤 *Username:* ${username}\n\n`;

  if (subInfo) {
    const planLabel = PLANS[subInfo.plan]?.label || subInfo.plan;
    msg += `💳 *Subscription:*\n`;
    msg += `  Plan: *${planLabel}*\n`;
    msg += `  Status: ✅ *Active*\n`;
    msg += `  Expires: *${subInfo.expiresFormatted}*\n`;
    msg += `  (${subInfo.expiresIn})\n\n`;
  } else {
    msg += `💳 *Subscription:* ❌ Inactive\n_Subscribe to receive signals_\n\n`;
  }

  msg += `📊 *Signals Received:* ${user?.signals_received || 0}\n`;
  msg += `📅 *Joined:* ${user ? new Date(user.joined_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}`;

  await ctx.reply(msg, { parse_mode: 'Markdown', ...mainKeyboard(ctx.from.id) });
}

async function handleSubscription(ctx) {
  userOps.upsert(ctx.from);
  const subInfo = getSubscriptionInfo(String(ctx.from.id));

  if (subInfo) {
    const planLabel = PLANS[subInfo.plan]?.label || subInfo.plan;
    const msg = `💳 *Your Subscription*\n\n✅ *Status:* Active\n📦 *Plan:* ${planLabel}\n📅 *Expires:* ${subInfo.expiresFormatted}\n⏳ *Time Left:* ${subInfo.expiresIn}\n\nWant to upgrade or renew?`;
    await ctx.reply(msg, { parse_mode: 'Markdown', ...subscriptionInline(PLANS) });
  } else {
    const bannerPath = path.join(ASSETS_DIR, 'premium-banner.jpg');
    const msg = formatPlansMessage();
    if (fs.existsSync(bannerPath)) {
      try {
        await ctx.replyWithPhoto({ source: bannerPath }, { caption: msg, parse_mode: 'Markdown', ...subscriptionInline(PLANS) });
        return;
      } catch (e) { /* fall through */ }
    }
    await ctx.reply(msg, { parse_mode: 'Markdown', ...subscriptionInline(PLANS) });
  }
}

async function handleHelp(ctx) {
  userOps.upsert(ctx.from);

  const msg = `ℹ️ *Help & Guide*\n\n*How to use Hope Forex Signals:*\n\n1️⃣ *Subscribe* — Choose a plan to unlock signals\n2️⃣ *Receive Signals* — Signals are sent automatically 24/7\n3️⃣ *Track Progress* — Get automatic TP1/TP2/TP3 notifications\n4️⃣ *View History* — See all past signals in 📜 Signal History\n5️⃣ *Trade Safely* — Never risk more than 1-2% per trade\n\n📊 *Signal Format:*\n• Entry — Where to enter the trade\n• Stop Loss — Maximum loss level\n• TP1/TP2/TP3 — Take profit targets (auto-tracked!)\n• Confidence — Signal strength (higher = better)\n\n🎯 *TP Tracker:*\nWhen a signal's TP or SL is hit, you receive an automatic notification. No need to watch the charts!\n\n⚠️ *Risk Warning:*\nForex trading involves risk. Past performance does not guarantee future results.\n\n📞 Need help? Use the *Support* menu.`;

  await ctx.reply(msg, { parse_mode: 'Markdown', ...mainKeyboard(ctx.from.id) });
}

async function handleSettings(ctx) {
  userOps.upsert(ctx.from);
  const msg = `⚙️ *Settings*\n\nYour preferences:\n\n• Signal Notifications: ✅ Enabled\n• TP/SL Alerts: ✅ Enabled\n• Image Signals: ✅ Enabled\n• Language: English 🇬🇧\n\n_More settings coming soon._`;
  await ctx.reply(msg, { parse_mode: 'Markdown', ...mainKeyboard(ctx.from.id) });
}

async function handleSignalHistory(ctx, page = 0) {
  userOps.upsert(ctx.from);

  if (!isSubscribed(ctx.from.id) && !isAdmin(ctx.from.id)) {
    await ctx.reply('🔒 *Premium Required*\n\nSubscribe to view your signal history.', {
      parse_mode: 'Markdown', ...subscriptionInline(PLANS),
    });
    return;
  }

  const pageSize = 5;
  const allHistory = historyOps.getAll(100);
  const total = allHistory.length;

  if (total === 0) {
    await ctx.reply('📜 *Signal History*\n\nNo completed signals yet.\n\n_Signals appear here after TP or SL is hit._', {
      parse_mode: 'Markdown', ...mainKeyboard(ctx.from.id),
    });
    return;
  }

  const stats = historyOps.getStats();
  const winRate = stats.total > 0
    ? (((stats.full_wins + stats.partial_wins) / stats.total) * 100).toFixed(1)
    : '0.0';

  const pageItems = allHistory.slice(page * pageSize, (page + 1) * pageSize);

  let msg = `📜 *Signal History*\n\n`;
  msg += `📊 *Overview:*\n`;
  msg += `Total: ${stats.total} | Wins: ${stats.full_wins} | Partial: ${stats.partial_wins} | Loss: ${stats.losses}\n`;
  msg += `Win Rate: *${winRate}%*\n\n`;
  msg += `─────────────────\n`;

  for (const h of pageItems) {
    const arrow = h.direction === 'BUY' ? '🟢' : '🔴';
    const resultEmoji = getResultEmoji(h.result);
    const tpReached = h.tp_level_reached > 0 ? `TP${h.tp_level_reached}` : 'SL';
    const dateStr = new Date(h.closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    msg += `${arrow} *${h.direction} ${h.pair}*\n`;
    msg += `${resultEmoji} *${h.result}* | Reached: ${tpReached}\n`;
    msg += `Entry: \`${h.entry}\` | Conf: ${h.confidence}%\n`;
    msg += `📅 ${dateStr}\n\n`;
  }

  const trackStats = trackingOps.getStats();
  msg += `─────────────────\n`;
  msg += `🎯 TP1 Hits: ${trackStats?.tp1_hits || 0} | TP2: ${trackStats?.tp2_hits || 0} | TP3: ${trackStats?.tp3_hits || 0}\n`;
  msg += `_Page ${page + 1} of ${Math.ceil(total / pageSize)}_`;

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...signalHistoryPaginationInline(page, total, isAdmin(ctx.from.id)),
  });
}

function getResultEmoji(result) {
  if (!result) return '⏳';
  if (result === 'FULL WIN') return '🏆';
  if (result === 'STRONG PARTIAL WIN') return '🥈';
  if (result === 'PARTIAL WIN') return '⚠️';
  if (result === 'LOSS') return '❌';
  return '⏳';
}

module.exports = {
  handleSignals, handleMarketTrend, handleMyAccount, handleSubscription,
  handleHelp, handleSettings, handleSignalHistory,
};
