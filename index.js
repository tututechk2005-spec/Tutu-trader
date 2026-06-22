require('dotenv').config();

const { Telegraf, session } = require('telegraf');
const {
  initDatabase, settingsOps, pairOps, paymentOps,
  subscriptionOps, userOps, trackingOps, signalOps,
} = require('./src/utils/database');
const { ensureAssets } = require('./src/utils/imageGen');
const { handleStart } = require('./src/bot/commands/start');
const {
  handleSignals, handleMarketTrend, handleMyAccount,
  handleSubscription, handleHelp, handleSettings, handleSignalHistory,
} = require('./src/bot/handlers/menu');
const {
  isAdmin, mainKeyboard, adminKeyboard, backKeyboard,
  adminStrategyInline, adminFrequencyInline, grantSubInline,
  adminSignalPairsInline, paymentConfirmInline, adminBroadcastConfirmInline,
} = require('./src/bot/handlers/keyboards');
const {
  handleAdminPanel, handleAdminUsers, handleUserDetail,
  handleAdminStatistics, handleAdminPayments, handleAdminSignals,
  handleAdminGetSignal, handleAdminBroadcastSignal, handleViewTracker,
  handleAdminSignalHistory, handleAdminPairs, handleAdminBroadcast,
  sendBroadcast, handleAdminSystem, handleSupportTickets,
  pendingBroadcast, pendingMsgUser, pendingAddPair,
} = require('./src/admin/panel');
const { handleSupportMessage, handleUserSupportSubmit, handleAdminReply } = require('./src/support/tickets');
const { initScheduler, forceSendSignal, broadcastSignal, startTracking } = require('./src/scheduler');
const { initTracker } = require('./src/tracker');
const { activateSubscription, PLANS, getPlanPrice } = require('./src/bot/services/subscription');
const { Markup } = require('telegraf');

// ─── Validation ──────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN is required.'); process.exit(1); }

const ADMIN_ID = process.env.ADMIN_CHAT_ID;
if (!ADMIN_ID) console.warn('⚠️  ADMIN_CHAT_ID not set — admin features disabled.');

// ─── Init ────────────────────────────────────────────────────────────────────
initDatabase();

const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

// ─── COMMANDS ────────────────────────────────────────────────────────────────
bot.command('start', handleStart);
bot.command('help', handleHelp);
bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.reply('❌ Unauthorized.'); return; }
  await handleAdminPanel(ctx);
});

// Admin reply to support ticket: /reply_<id> <message>
bot.hears(/^\/reply_(\d+)\s(.+)$/s, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await handleAdminReply(ctx, parseInt(ctx.match[1]), ctx.match[2]);
});

// ─── USER REPLY KEYBOARD ─────────────────────────────────────────────────────
bot.hears('📊 Signals', handleSignals);
bot.hears('📈 Market Trend', handleMarketTrend);
bot.hears('👤 My Account', handleMyAccount);
bot.hears('💳 Subscription', handleSubscription);
bot.hears('📞 Support', handleSupportMessage);
bot.hears('ℹ️ Help', handleHelp);
bot.hears('📜 Signal History', (ctx) => handleSignalHistory(ctx, 0));
bot.hears('⚙️ Settings', async (ctx) => {
  if (isAdmin(ctx.from.id)) { await handleAdminSystem(ctx); return; }
  await handleSettings(ctx);
});

// ─── ADMIN REPLY KEYBOARD ────────────────────────────────────────────────────
bot.hears('👥 Users', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await handleAdminUsers(ctx, 0);
});
bot.hears('📊 Statistics', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await handleAdminStatistics(ctx);
});
bot.hears('💰 Payments', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await handleAdminPayments(ctx);
});
bot.hears('📢 Broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await handleAdminBroadcast(ctx, ctx.from.id);
});
bot.hears('📈 Signals', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await handleSignals(ctx); return; }
  await handleAdminSignals(ctx);
});
bot.hears('🛠 System', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await handleAdminSystem(ctx);
});
bot.hears('🔙 User View', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply('Switched to user view.', mainKeyboard(ctx.from.id));
});
bot.hears('🔙 Back', async (ctx) => {
  await ctx.reply('Main Menu', mainKeyboard(ctx.from.id));
});

// ─── SUBSCRIPTION CALLBACKS ──────────────────────────────────────────────────
bot.action(/^subscribe_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const planKey = ctx.match[1];
  if (!PLANS[planKey]) { await ctx.reply('❌ Invalid plan.'); return; }

  const price = getPlanPrice(planKey);
  const planLabel = PLANS[planKey].label;
  const paymentId = require('./src/bot/services/subscription').createPaymentRequest(String(ctx.from.id), planKey);

  const msg = `💳 *Payment Request: ${planLabel}*\n\n` +
    `💵 Amount: *$${price.toFixed(2)} USD*\n` +
    `🆔 Order ID: #${paymentId}\n\n` +
    `📌 *Payment Instructions:*\n` +
    `Send the exact amount to our payment details.\nContact support with your payment proof.\n\n` +
    `We activate your subscription within 1 hour of payment confirmation.`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });

  if (ADMIN_ID) {
    const name = ctx.from.first_name || ctx.from.username || ctx.from.id;
    const username = ctx.from.username ? ` (@${ctx.from.username})` : '';
    bot.telegram.sendMessage(ADMIN_ID,
      `💳 *New Payment Request #${paymentId}*\n\n👤 ${name}${username}\n🆔 \`${ctx.from.id}\`\n📦 Plan: *${planLabel}*\n💵 Amount: *$${price.toFixed(2)}*`,
      { parse_mode: 'Markdown', ...paymentConfirmInline(paymentId, ctx.from.id) }
    ).catch(() => {});
  }
});

// ─── PAYMENT MANAGEMENT ──────────────────────────────────────────────────────
bot.action(/^confirm_pay_(\d+)_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌ Unauthorized'); return; }
  await ctx.answerCbQuery('✅ Confirming...');

  const paymentId = parseInt(ctx.match[1]);
  const userId = ctx.match[2];

  paymentOps.confirm(paymentId, ctx.from.id);
  const payment = paymentOps.findById(paymentId);
  if (!payment) { await ctx.reply('Payment not found.'); return; }

  activateSubscription(userId, payment.plan);
  await ctx.editMessageText(
    `✅ Payment #${paymentId} confirmed!\n\nUser ${userId} activated: *${PLANS[payment.plan]?.label || payment.plan}*`,
    { parse_mode: 'Markdown' }
  );

  bot.telegram.sendMessage(userId,
    `🎉 *Subscription Activated!*\n\n✅ Your *${PLANS[payment.plan]?.label || payment.plan}* plan is now active!\n\nYou will now receive trading signals automatically.\nTap 📊 *Signals* to see the latest ones.`,
    { parse_mode: 'Markdown', ...mainKeyboard(userId) }
  ).catch(() => {});
});

bot.action(/^reject_pay_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌ Unauthorized'); return; }
  await ctx.answerCbQuery('❌ Rejected');
  await ctx.editMessageText('❌ Payment rejected.');
});

// ─── ADMIN SIGNAL MANAGEMENT ─────────────────────────────────────────────────
bot.action('admin_get_signal', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery('🔄 Generating...');
  await handleAdminGetSignal(ctx, bot);
});

bot.action(/^broadcast_signal_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  const signalId = parseInt(ctx.match[1]);
  await handleAdminBroadcastSignal(ctx, bot, signalId);
});

bot.action(/^view_tracker_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await handleViewTracker(ctx, parseInt(ctx.match[1]));
});

bot.action('admin_signal_history', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await handleAdminSignalHistory(ctx);
});

bot.action(/^delete_signal_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery('🗑 Deleting...');
  signalOps.updateStatus(parseInt(ctx.match[1]), 'deleted');
  await ctx.editMessageText(`🗑 Signal #${ctx.match[1]} has been deleted and removed from tracking.`);
});

bot.action('admin_stats_inline', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await handleAdminStatistics(ctx);
});

// ─── STRATEGY TOGGLES ────────────────────────────────────────────────────────
bot.action('toggle_s1', makeStrategyToggle('strategy_1_enabled'));
bot.action('toggle_s2', makeStrategyToggle('strategy_2_enabled'));
bot.action('toggle_s3', makeStrategyToggle('strategy_3_enabled'));
bot.action('toggle_s4', makeStrategyToggle('strategy_4_enabled'));

bot.action('toggle_auto', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  const current = settingsOps.get('auto_signals_enabled');
  settingsOps.set('auto_signals_enabled', current === '0' ? '1' : '0');
  await handleAdminSignals(ctx);
});

bot.action('force_signal', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery('⚡ Generating...');
  await handleAdminGetSignal(ctx, bot);
});

bot.action('change_freq', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await ctx.reply('⏱ *Select Signal Frequency:*', { parse_mode: 'Markdown', ...adminFrequencyInline() });
});

bot.action(/^freq_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  const freq = ctx.match[1];
  settingsOps.set('signal_frequency', freq);
  await ctx.answerCbQuery(`✅ Set to ${freq} min`);
  await ctx.editMessageText(`✅ Signal frequency updated to *${freq} minutes*.`, { parse_mode: 'Markdown' });
});

bot.action('admin_pairs', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await handleAdminPairs(ctx);
});

// ─── PAIR TOGGLES ────────────────────────────────────────────────────────────
bot.action(/^toggle_pair_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  const pair = ctx.match[1];
  const isNowEnabled = pairOps.toggle(pair);
  await ctx.answerCbQuery(`${pair} ${isNowEnabled ? 'enabled ✅' : 'disabled ❌'}`);
  await handleAdminPairs(ctx);
});

bot.action('add_pair', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  pendingAddPair.set(String(ctx.from.id), true);
  await ctx.reply('Enter the new pair symbol (e.g. GBPJPY):', backKeyboard());
});

// ─── SIGNAL HISTORY PAGINATION ───────────────────────────────────────────────
bot.action(/^history_page_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await handleSignalHistory(ctx, parseInt(ctx.match[1]));
});

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────
bot.action(/^user_detail_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await handleUserDetail(ctx, ctx.match[1]);
});

bot.action(/^users_page_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await handleAdminUsers(ctx, parseInt(ctx.match[1]));
});

bot.action('admin_users', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await handleAdminUsers(ctx, 0);
});

bot.action(/^grant_sub_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  await ctx.reply('Select subscription plan:', grantSubInline(ctx.match[1]));
});

bot.action(/^grant_(\w+)_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  const planKey = ctx.match[1];
  const userId = ctx.match[2];
  if (!PLANS[planKey]) { await ctx.answerCbQuery('Invalid plan'); return; }
  activateSubscription(userId, planKey);
  await ctx.answerCbQuery(`✅ ${PLANS[planKey].label} granted!`);
  await ctx.editMessageText(`✅ *${PLANS[planKey].label}* granted to user \`${userId}\`.`, { parse_mode: 'Markdown' });
  bot.telegram.sendMessage(userId,
    `🎉 *Subscription Activated!*\n\n✅ Admin granted you a *${PLANS[planKey].label}* plan!\n\nTap 📊 *Signals* to receive trading signals.`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});
});

bot.action(/^block_user_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  userOps.block(ctx.match[1]);
  await ctx.answerCbQuery('🚫 User blocked');
  await ctx.editMessageText(`🚫 User \`${ctx.match[1]}\` blocked.`, { parse_mode: 'Markdown' });
});

bot.action(/^msg_user_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  pendingMsgUser.set(String(ctx.from.id), ctx.match[1]);
  await ctx.reply(`Type message for user \`${ctx.match[1]}\`:`, { parse_mode: 'Markdown', ...backKeyboard() });
});

// ─── SUPPORT TICKETS ─────────────────────────────────────────────────────────
bot.action(/^reply_ticket_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  const { supportOps } = require('./src/utils/database');
  const ticket = supportOps.findById(parseInt(ctx.match[1]));
  if (!ticket) { await ctx.reply('Ticket not found.'); return; }
  await ctx.reply(
    `💬 Reply to ticket #${ctx.match[1]}:\n\n_User: "${ticket.message}"_\n\nUse: /reply_${ctx.match[1]} <your message>`,
    { parse_mode: 'Markdown' }
  );
});

// ─── BROADCAST TEXT ──────────────────────────────────────────────────────────
bot.action('broadcast_confirm', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
  await ctx.answerCbQuery();
  const text = pendingBroadcast.get(`msg_${ctx.from.id}`);
  if (!text) { await ctx.reply('No message queued.'); return; }
  pendingBroadcast.delete(`msg_${ctx.from.id}`);
  await sendBroadcast(ctx, bot, text);
});

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
bot.action('back_main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Main Menu', mainKeyboard(ctx.from.id));
});
bot.action('admin_back', async (ctx) => {
  if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery(); return; }
  await ctx.answerCbQuery();
  await handleAdminPanel(ctx);
});
bot.action('view_signals', async (ctx) => {
  await ctx.answerCbQuery();
  await handleSignals(ctx);
});

// ─── TEXT MESSAGE HANDLER ────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  const userId = String(ctx.from.id);
  const text = ctx.message.text;

  // Admin: pending broadcast message
  if (isAdmin(ctx.from.id) && pendingBroadcast.get(userId)) {
    pendingBroadcast.delete(userId);
    pendingBroadcast.set(`msg_${userId}`, text);
    await ctx.reply(
      `📢 *Confirm Broadcast*\n\n${text}\n\n⚠️ This will be sent to ALL users. Confirm?`,
      { parse_mode: 'Markdown', ...adminBroadcastConfirmInline() }
    );
    return;
  }

  // Admin: pending message to specific user
  if (isAdmin(ctx.from.id) && pendingMsgUser.get(userId)) {
    const targetId = pendingMsgUser.get(userId);
    pendingMsgUser.delete(userId);
    try {
      await bot.telegram.sendMessage(targetId, `📩 *Message from Admin:*\n\n${text}`, { parse_mode: 'Markdown' });
      await ctx.reply(`✅ Message sent to user ${targetId}.`, adminKeyboard());
    } catch (e) {
      await ctx.reply(`❌ Could not send: ${e.message}`, adminKeyboard());
    }
    return;
  }

  // Admin: pending add pair
  if (isAdmin(ctx.from.id) && pendingAddPair.get(userId)) {
    pendingAddPair.delete(userId);
    const pair = text.toUpperCase().replace(/[^A-Z]/g, '');
    if (pair.length < 6) { await ctx.reply('❌ Invalid pair. Use format like GBPJPY.'); return; }
    pairOps.enable(pair);
    await ctx.reply(`✅ Pair *${pair}* added and enabled.`, { parse_mode: 'Markdown', ...adminKeyboard() });
    return;
  }

  // User: support message
  if (ctx.session?.awaitingSupport) {
    const handled = await handleUserSupportSubmit(ctx, bot);
    if (handled) return;
  }

  // Default fallback
  await ctx.reply('Use the buttons below to navigate. 👇', mainKeyboard(ctx.from.id));
});

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`Bot error [${ctx.updateType}]:`, err.message);
  if (ctx.reply) ctx.reply('⚠️ An error occurred. Please try again.').catch(() => {});
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function makeStrategyToggle(key) {
  return async (ctx) => {
    if (!isAdmin(ctx.from.id)) { await ctx.answerCbQuery('❌'); return; }
    await ctx.answerCbQuery();
    const current = settingsOps.get(key);
    settingsOps.set(key, current === '0' ? '1' : '0');
    await handleAdminSignals(ctx);
  };
}

// ─── STARTUP ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting Hope Forex Signals Bot...');

  try { await ensureAssets(); } catch (err) { console.warn('⚠️ Asset gen failed:', err.message); }

  // Start signal scheduler
  initScheduler(bot);

  // Start TP/SL tracker
  initTracker(bot);

  await bot.launch();
  const me = await bot.telegram.getMe();
  console.log(`✅ Bot @${me.username} is live!`);
  console.log(`👑 Admin ID: ${ADMIN_ID || 'NOT SET'}`);
  console.log(`📊 Auto signals: ${settingsOps.get('auto_signals_enabled') !== '0' ? 'ON' : 'OFF'}`);
  console.log(`⏱ Frequency: every ${settingsOps.get('signal_frequency') || '15'} min`);
  console.log(`🔍 TP Tracker: running every 2 min`);
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
