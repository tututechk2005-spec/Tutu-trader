/**
 * TP/SL Tracker — monitors all active signals 24/7
 * Checks prices every 2 minutes and fires notifications when targets are hit.
 */
const cron = require('node-cron');
const { fetchPrice } = require('../utils/twelvedata');
const { trackingOps, historyOps, broadcastOps, signalOps, userOps } = require('../utils/database');

let trackerTask = null;
let botInstance = null;

function initTracker(bot) {
  botInstance = bot;
  startTracker();
}

function startTracker() {
  if (trackerTask) trackerTask.stop();

  // Check every 2 minutes
  trackerTask = cron.schedule('*/2 * * * *', async () => {
    try {
      await runTrackerCycle();
    } catch (err) {
      console.error('Tracker error:', err.message);
    }
  });

  console.log('✅ TP/SL Tracker started (every 2 min)');
}

function stopTracker() {
  if (trackerTask) {
    trackerTask.stop();
    trackerTask = null;
  }
}

async function runTrackerCycle() {
  const activeSignals = trackingOps.getActive();
  if (activeSignals.length === 0) return;

  // Group by pair to minimize API calls
  const byPair = {};
  for (const sig of activeSignals) {
    if (!byPair[sig.pair]) byPair[sig.pair] = [];
    byPair[sig.pair].push(sig);
  }

  for (const [pair, signals] of Object.entries(byPair)) {
    let currentPrice;
    try {
      currentPrice = await fetchPrice(pair);
      await new Promise(r => setTimeout(r, 400)); // Rate limit spacing
    } catch (err) {
      console.error(`Tracker: could not fetch ${pair} price:`, err.message);
      continue;
    }

    for (const tracking of signals) {
      await checkSignalTargets(tracking, currentPrice);
    }
  }
}

async function checkSignalTargets(tracking, currentPrice) {
  if (!currentPrice || !botInstance) return;

  const isBuy = tracking.direction === 'BUY';
  const t = tracking;

  // Skip already-closed
  if (['full_win', 'loss', 'partial_win', 'strong_partial_win'].includes(t.status)) return;

  // Check Stop Loss first (only if not past any TP yet, or if tracking partial)
  const slHit = isBuy ? currentPrice <= t.stop_loss : currentPrice >= t.stop_loss;
  if (slHit && !t.sl_hit) {
    // Close signal
    trackingOps.markSL(t.id, t.tp1_hit, t.tp2_hit);
    signalOps.updateStatus(t.signal_id, 'closed');

    // Determine result for history
    let result = 'LOSS';
    let tpLevel = 0;
    if (t.tp1_hit && t.tp2_hit) { result = 'STRONG PARTIAL WIN'; tpLevel = 2; }
    else if (t.tp1_hit) { result = 'PARTIAL WIN'; tpLevel = 1; }

    // Save to history
    const signal = signalOps.findById(t.signal_id);
    if (signal) {
      historyOps.create({
        signal_id: t.signal_id,
        pair: t.pair,
        direction: t.direction,
        entry: t.entry,
        stop_loss: t.stop_loss,
        tp1: t.tp1,
        tp2: t.tp2,
        tp3: t.tp3,
        tp_level_reached: tpLevel,
        result,
        confidence: signal.confidence,
        strategy: signal.strategy,
        timeframe: signal.timeframe,
      });
    }

    await broadcastTPNotification(t.signal_id, 'SL', t.pair, t.tp1_hit, t.tp2_hit);
    return;
  }

  // Check TP3
  if (!t.tp3_hit) {
    const tp3Hit = isBuy ? currentPrice >= t.tp3 : currentPrice <= t.tp3;
    if (tp3Hit) {
      trackingOps.markTP3(t.id);
      signalOps.updateStatus(t.signal_id, 'closed');

      const signal = signalOps.findById(t.signal_id);
      if (signal) {
        historyOps.create({
          signal_id: t.signal_id, pair: t.pair, direction: t.direction,
          entry: t.entry, stop_loss: t.stop_loss, tp1: t.tp1, tp2: t.tp2, tp3: t.tp3,
          tp_level_reached: 3, result: 'FULL WIN',
          confidence: signal.confidence, strategy: signal.strategy, timeframe: signal.timeframe,
        });
      }

      await broadcastTPNotification(t.signal_id, 'TP3', t.pair);
      return;
    }
  }

  // Check TP2
  if (!t.tp2_hit) {
    const tp2Hit = isBuy ? currentPrice >= t.tp2 : currentPrice <= t.tp2;
    if (tp2Hit) {
      trackingOps.markTP2(t.id);
      await broadcastTPNotification(t.signal_id, 'TP2', t.pair);
      return;
    }
  }

  // Check TP1
  if (!t.tp1_hit) {
    const tp1Hit = isBuy ? currentPrice >= t.tp1 : currentPrice <= t.tp1;
    if (tp1Hit) {
      trackingOps.markTP1(t.id);
      await broadcastTPNotification(t.signal_id, 'TP1', t.pair);
      return;
    }
  }

  // Update last checked
  trackingOps.updateLastChecked(t.id);
}

async function broadcastTPNotification(signalId, hitType, pair, tp1Hit = false, tp2Hit = false) {
  if (!botInstance) return;

  // Get all recipients of this signal
  const recipients = broadcastOps.getRecipientsBySignal(signalId);
  if (recipients.length === 0) {
    // Fallback: notify all active users (for auto-generated signals)
    const { subscriptionOps, userOps } = require('../utils/database');
    subscriptionOps.expireOld();
    const allUsers = userOps.getAll().filter(u => !u.is_blocked);
    const active = allUsers.filter(u => subscriptionOps.isActive(u.telegram_id)).map(u => u.telegram_id);
    recipients.push(...active);
  }

  if (recipients.length === 0) return;

  const message = buildTPMessage(hitType, pair, tp1Hit, tp2Hit);
  let sent = 0, failed = 0;

  for (const userId of recipients) {
    try {
      await botInstance.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
      sent++;
      await new Promise(r => setTimeout(r, 80));
    } catch (err) {
      failed++;
      if (err.message.includes('blocked') || err.message.includes('deactivated')) {
        userOps.block(userId);
      }
    }
  }

  const type = hitType === 'SL' ? (tp1Hit ? (tp2Hit ? 'strong_partial_win' : 'partial_win') : 'loss') : hitType.toLowerCase();
  console.log(`📡 ${hitType} notification for Signal #${signalId} ${pair}: sent ${sent}/${recipients.length}`);
}

function buildTPMessage(hitType, pair, tp1Hit = false, tp2Hit = false) {
  const tp1 = (hitType === 'TP2' || hitType === 'TP3' || tp1Hit) ? '✅' : '❌';
  const tp2 = (hitType === 'TP2' || hitType === 'TP3' || tp2Hit) ? '✅' : '❌';
  const tp3 = hitType === 'TP3' ? '✅' : '❌';

  switch (hitType) {
    case 'TP1':
      return `🎯 *TP1 HIT*\n\n*Pair:* ${pair}\n\nTarget 1 Reached Successfully ✅\n\n*Progress:*\nTP1 ✅\nTP2 ⏳\nTP3 ⏳\n\n📌 Consider Moving Stop Loss To Break Even.\n\n💰 *Profit Secured.*`;

    case 'TP2':
      return `🚀 *TP2 HIT*\n\n*Pair:* ${pair}\n\nTarget 2 Reached Successfully ✅\n\n*Progress:*\nTP1 ✅\nTP2 ✅\nTP3 ⏳\n\n📈 Trade Is Performing Strongly.\n\n💎 *Keep Holding Remaining Position.*`;

    case 'TP3':
      return `🏆 *TP3 HIT*\n\n*Pair:* ${pair}\n\nFINAL TARGET REACHED 🎉\n\n*Progress:*\nTP1 ✅\nTP2 ✅\nTP3 ✅\n\n✨ *Result: FULL WIN*\n\nSignal Closed Successfully.\n\n*Congratulations Traders* 🎉`;

    case 'SL': {
      if (!tp1Hit && !tp2Hit) {
        return `❌ *STOP LOSS HIT*\n\n*Pair:* ${pair}\n\n*Progress:*\nTP1 ❌\nTP2 ❌\nTP3 ❌\n\n📊 *Result: LOSS*\n\nSignal Closed. Next opportunity coming soon 💪`;
      }
      if (tp1Hit && !tp2Hit) {
        return `⚠️ *SIGNAL CLOSED*\n\n*Pair:* ${pair}\n\n*Progress:*\nTP1 ✅\nTP2 ❌\nTP3 ❌\n\n📊 *Result: PARTIAL WIN*\n\nSome Profit Was Secured Before Reversal. 💰`;
      }
      return `⚠️ *SIGNAL CLOSED*\n\n*Pair:* ${pair}\n\n*Progress:*\nTP1 ✅\nTP2 ✅\nTP3 ❌\n\n📊 *Result: STRONG PARTIAL WIN*\n\nMost Targets Reached Successfully. 🏅`;
    }

    default:
      return `📊 Signal Update — ${pair}`;
  }
}

function getTrackingStatusDisplay(tracking) {
  const tp1 = tracking.tp1_hit ? '✅' : '⏳';
  const tp2 = tracking.tp2_hit ? '✅' : '⏳';
  const tp3 = tracking.tp3_hit ? '✅' : '⏳';
  const sl = tracking.sl_hit ? '❌' : '🔵';

  let statusLabel = '⏳ Active';
  if (tracking.status === 'full_win') statusLabel = '🏆 Full Win';
  else if (tracking.status === 'partial_win') statusLabel = '⚠️ Partial Win';
  else if (tracking.status === 'strong_partial_win') statusLabel = '🥈 Strong Partial Win';
  else if (tracking.status === 'loss') statusLabel = '❌ Loss';
  else if (tracking.status === 'tp1_hit') statusLabel = '🎯 TP1 Hit';
  else if (tracking.status === 'tp2_hit') statusLabel = '🚀 TP2 Hit';

  return { tp1, tp2, tp3, sl, statusLabel };
}

module.exports = { initTracker, stopTracker, runTrackerCycle, buildTPMessage, broadcastTPNotification, getTrackingStatusDisplay };
