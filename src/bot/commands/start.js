const path = require('path');
const fs = require('fs');
const { userOps, settingsOps } = require('../../utils/database');
const { mainKeyboard, isAdmin } = require('../handlers/keyboards');

const ASSETS_DIR = path.join(__dirname, '../../../assets');

async function handleStart(ctx) {
  const user = ctx.from;
  userOps.upsert(user);

  const welcomeMsg = settingsOps.get('welcome_message') ||
    '🚀 Welcome to Hope Forex Signals\n\nAI Powered Forex & Gold Signals\n\n✅ Real Time Signals\n✅ Gold Signals\n✅ Forex Signals\n✅ Smart Money Concepts\n✅ Risk Management';

  // Send welcome image
  const welcomePath = path.join(ASSETS_DIR, 'welcome.jpg');
  if (fs.existsSync(welcomePath)) {
    try {
      await ctx.replyWithPhoto({ source: welcomePath }, {
        caption: welcomeMsg,
        parse_mode: 'Markdown',
      });
    } catch (e) {
      await ctx.reply(welcomeMsg, { parse_mode: 'Markdown' });
    }
  } else {
    await ctx.reply(welcomeMsg, { parse_mode: 'Markdown' });
  }

  // Send keyboard
  const name = user.first_name || 'Trader';
  const adminGreeting = isAdmin(user.id) ? '\n\n👑 *Admin Panel Active* — You have full access.' : '';

  await ctx.reply(
    `Welcome back, *${name}*! 👋${adminGreeting}\n\nUse the menu below to navigate:`,
    {
      parse_mode: 'Markdown',
      ...mainKeyboard(user.id),
    }
  );
}

module.exports = { handleStart };
