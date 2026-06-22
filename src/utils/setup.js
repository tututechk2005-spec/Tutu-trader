/**
 * Setup script - run once to initialize the bot
 * Usage: node src/utils/setup.js
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');

async function setup() {
  console.log('🔧 Setting up Hope Forex Signals Bot...\n');

  // Check environment variables
  const required = ['BOT_TOKEN', 'ADMIN_CHAT_ID', 'TWELVE_DATA_API_KEY'];
  let missing = false;
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ Missing: ${key}`);
      missing = true;
    } else {
      console.log(`✅ ${key}: Set`);
    }
  }

  if (missing) {
    console.log('\n⚠️  Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }

  // Initialize database
  console.log('\n📦 Initializing database...');
  const { initDatabase } = require('./database');
  initDatabase();

  // Generate assets
  console.log('\n🎨 Generating assets...');
  try {
    const { ensureAssets } = require('./imageGen');
    await ensureAssets();
  } catch (err) {
    console.warn('⚠️  Asset generation failed:', err.message);
    console.log('   This may be because canvas is not installed. Run: npm install');
  }

  console.log('\n✅ Setup complete! Run `npm start` to start the bot.');
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
