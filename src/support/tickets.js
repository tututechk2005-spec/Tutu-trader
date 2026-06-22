const { supportOps, userOps } = require('../utils/database');
const { mainKeyboard } = require('../bot/handlers/keyboards');

const ADMIN_ID = process.env.ADMIN_CHAT_ID;
const pendingReplies = new Map(); // admin waiting to reply to ticket

async function handleSupportMessage(ctx) {
  userOps.upsert(ctx.from);

  const msg = `📞 *Support*\n\nNeed help? Send us a message and our team will respond as soon as possible.\n\n⏰ *Response time:* Usually within 1-2 hours\n\nSimply type your message below and press send:`;

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...require('../bot/handlers/keyboards').backKeyboard(),
  });

  ctx.session = ctx.session || {};
  ctx.session.awaitingSupport = true;
}

async function handleUserSupportSubmit(ctx, bot) {
  if (!ctx.session?.awaitingSupport) return false;

  const text = ctx.message.text;
  if (!text || text === '🔙 Back') {
    ctx.session.awaitingSupport = false;
    return false;
  }

  const userId = String(ctx.from.id);
  const result = supportOps.create(userId, text);
  const ticketId = result.lastInsertRowid;

  ctx.session.awaitingSupport = false;

  await ctx.reply(
    `✅ *Support ticket #${ticketId} created!*\n\nOur team will reply soon. You will be notified when there is a response.`,
    { parse_mode: 'Markdown', ...mainKeyboard(ctx.from.id) }
  );

  // Notify admin
  if (ADMIN_ID) {
    const name = ctx.from.first_name || ctx.from.username || userId;
    const username = ctx.from.username ? ` (@${ctx.from.username})` : '';
    try {
      await bot.telegram.sendMessage(ADMIN_ID,
        `📩 *New Support Ticket #${ticketId}*\n\n👤 From: ${name}${username}\n🆔 ID: \`${userId}\`\n\n💬 Message:\n${text}\n\nReply with /reply_${ticketId} <your message>`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Could not notify admin:', e.message);
    }
  }

  return true;
}

async function handleAdminReply(ctx, ticketId, replyText) {
  const ticket = supportOps.findById(ticketId);
  if (!ticket) {
    await ctx.reply(`❌ Ticket #${ticketId} not found.`);
    return;
  }

  supportOps.reply(ticketId, replyText);

  await ctx.reply(`✅ Reply sent to ticket #${ticketId}.`);

  // Notify user
  try {
    await ctx.telegram.sendMessage(ticket.telegram_id,
      `📩 *Support Reply — Ticket #${ticketId}*\n\n*Your message:*\n_${ticket.message}_\n\n*Our reply:*\n${replyText}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    await ctx.reply(`⚠️ Could not deliver reply to user ${ticket.telegram_id}: ${e.message}`);
  }
}

module.exports = { handleSupportMessage, handleUserSupportSubmit, handleAdminReply, pendingReplies };
