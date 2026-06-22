const cron = require('node-cron');
const { analyzeAllPairs } = require('../analysis/engine');
const { signalOps, userOps, subscriptionOps, settingsOps, pairOps, trackingOps, broadcastOps } = require('../utils/database');
const { generateSignalImage } = require('../utils/imageGen');

let schedulerTask = null;
let botInstance = null;
let lastSignalTime = {};

function initScheduler(bot) {
  botInstance = bot;
  startScheduler();
}

function startScheduler() {
  if (schedulerTask) schedulerTask.stop();

  schedulerTask = cron.schedule('* * * * *', async () => {
    try {
      const autoEnabled = settingsOps.get('auto_signals_enabled');
      if (autoEnabled === '0') return;

      const frequency = parseInt(settingsOps.get('signal_frequency') || '15', 10);
      const now = Date.now();
      const lastTime = lastSignalTime._last || 0;
      if (now - lastTime < frequency * 60 * 1000) return;

      lastSignalTime._last = now;
      await runSignalCycle();
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  });

  console.log('✅ Signal scheduler started');
}

async function runSignalCycle() {
  const enabledPairs = pairOps.getEnabled();
  if (enabledPairs.length === 0) return;

  console.log(`🔄 Running signal analysis for ${enabledPairs.length} pairs...`);

  const pairsToAnalyze = shuffleArray(enabledPairs).slice(0, Math.min(3, enabledPairs.length));

  try {
    const signals = await analyzeAllPairs(pairsToAnalyze);

    for (const signal of signals) {
      const minConf = parseInt(settingsOps.get('min_confidence') || '65', 10);
      if (signal.confidence < minConf) continue;

      const signalId = signalOps.create(signal);
      const recipients = await broadcastSignal({ ...signal, id: signalId });

      // Start tracking
      if (recipients.length > 0) {
        startTracking({ ...signal, id: signalId }, recipients, 'auto');
      }
    }
  } catch (err) {
    console.error('Signal cycle error:', err.message);
  }
}

async function forceSendSignal(pair, ctx = null) {
  if (!botInstance) return null;

  const enabledPairs = pair ? [pair] : pairOps.getEnabled().slice(0, 1);

  try {
    const signals = await analyzeAllPairs(enabledPairs);
    if (signals.length === 0) {
      if (ctx) await ctx.reply('⚠️ No signal generated. Check API key and pair availability.');
      return null;
    }

    const signal = signals[0];
    const signalId = signalOps.create(signal);
    const fullSignal = { ...signal, id: signalId };

    // Return signal for admin preview instead of auto-broadcasting
    return fullSignal;
  } catch (err) {
    console.error('Force signal error:', err.message);
    if (ctx) await ctx.reply(`❌ Error: ${err.message}`);
    return null;
  }
}

/**
 * Broadcast signal to all active subscribers.
 * Returns array of telegram IDs that received the signal.
 */
async function broadcastSignal(signal, adminId = 'auto') {
  if (!botInstance) return [];

  subscriptionOps.expireOld();
  const allUsers = userOps.getAll().filter(u => !u.is_blocked);
  const activeUsers = allUsers.filter(u => subscriptionOps.isActive(u.telegram_id));

  if (activeUsers.length === 0) {
    console.log(`No active subscribers for signal ${signal.pair}`);
    return [];
  }

  // Create broadcast log entry
  const broadcastId = broadcastOps.create(signal.id, adminId);

  // Generate image
  let imageBuffer = null;
  try {
    imageBuffer = await generateSignalImage(signal);
  } catch (err) {
    console.error('Image generation failed:', err.message);
  }

  const messageText = formatSignalMessage(signal);
  const recipients = [];
  let sent = 0, failed = 0;

  for (const user of activeUsers) {
    try {
      if (imageBuffer) {
        await botInstance.telegram.sendPhoto(user.telegram_id, { source: imageBuffer }, {
          caption: messageText,
          parse_mode: 'Markdown',
        });
      } else {
        await botInstance.telegram.sendMessage(user.telegram_id, messageText, {
          parse_mode: 'Markdown',
        });
      }
      userOps.incrementSignals(user.telegram_id);
      broadcastOps.addRecipient(broadcastId, signal.id, user.telegram_id);
      recipients.push(user.telegram_id);
      sent++;
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      failed++;
      if (err.message.includes('blocked') || err.message.includes('deactivated')) {
        userOps.block(user.telegram_id);
      }
    }
  }

  broadcastOps.update(broadcastId, activeUsers.length, sent, failed);
  signalOps.updateSentCount(signal.id, sent);
  console.log(`📡 Signal ${signal.pair} ${signal.direction} → ${sent}/${activeUsers.length} users (Broadcast #${broadcastId})`);

  return recipients;
}

/**
 * Start TP/SL tracking for a broadcasted signal.
 */
function startTracking(signal, recipients, adminId) {
  try {
    // Create tracking record
    const trackingId = trackingOps.create(signal);
    console.log(`🔍 Tracking started for Signal #${signal.id} ${signal.pair} (Tracking #${trackingId})`);
  } catch (err) {
    console.error('Failed to start tracking:', err.message);
  }
}

function formatSignalMessage(signal) {
  const arrow = signal.direction === 'BUY' ? '🟢' : '🔴';
  const reasons = Array.isArray(signal.reasons) ? signal.reasons
    : (() => { try { return JSON.parse(signal.reasons); } catch { return []; } })();

  const formatNum = (n) => {
    if (!n) return '—';
    const num = typeof n === 'number' ? n : parseFloat(n);
    if (isNaN(num)) return '—';
    if (signal.pair === 'XAUUSD') return num.toFixed(2);
    if (signal.pair.includes('JPY')) return num.toFixed(3);
    return num.toFixed(5);
  };

  let msg = `${arrow} *${signal.direction} ${signal.pair}*\n\n`;
  msg += `📈 *Trend:* ${signal.trend || 'BULLISH'}\n\n`;
  msg += `🎯 *Entry:* \`${formatNum(signal.entry)}\`\n`;
  msg += `🛑 *Stop Loss:* \`${formatNum(signal.stopLoss || signal.stop_loss)}\`\n\n`;
  msg += `💰 *Take Profit 1:* \`${formatNum(signal.tp1)}\`\n`;
  msg += `💰 *Take Profit 2:* \`${formatNum(signal.tp2)}\`\n`;
  msg += `💰 *Take Profit 3:* \`${formatNum(signal.tp3)}\`\n\n`;
  msg += `⚖️ *Risk/Reward:* ${signal.riskReward || signal.risk_reward || '1:3'}\n`;
  msg += `🎯 *Confidence:* ${signal.confidence}%\n`;
  msg += `⏱ *Timeframe:* ${signal.timeframe || 'H1'}\n`;
  msg += `📊 *Strategy:* ${getStrategyName(signal.strategy)}\n\n`;

  if (reasons.length > 0) {
    msg += `📋 *Analysis:*\n`;
    reasons.slice(0, 5).forEach(r => { msg += `• ${r}\n`; });
  }

  msg += `\n_${new Date().toUTCString()}_`;
  return msg;
}

function getStrategyName(stratNum) {
  const names = { 1: 'Smart Money Concepts', 2: 'Supply & Demand', 3: 'EMA + RSI + MACD', 4: 'Trend Following MTF' };
  return names[stratNum] || 'AI Analysis';
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
}

module.exports = {
  initScheduler, startScheduler, stopScheduler,
  forceSendSignal, broadcastSignal, startTracking, formatSignalMessage,
};
