# 🚀 Hope Forex Signals Bot

A professional, production-ready Telegram Forex & Gold Signal Bot with AI-powered market analysis.

## Features

- **4 Analysis Strategies** with automatic fallback
  - Strategy 1: Smart Money Concepts (BOS, CHOCH, Liquidity Sweep, Order Blocks, FVG)
  - Strategy 2: Supply & Demand, Support/Resistance, Breakout Retest
  - Strategy 3: EMA 50/200, RSI, MACD
  - Strategy 4: Trend Following, Multi-Timeframe Confirmation
- **9 Forex Pairs**: XAUUSD, EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF, EURGBP
- **Auto Signal Scheduler** — 24/7 automatic signals
- **Subscription System** — 1 Week / 1 Month / 3 Months / Lifetime
- **Premium Signal Images** — Beautiful auto-generated chart cards
- **Full Admin Panel** — Users, Payments, Broadcast, Statistics
- **Support Ticket System** — User ↔ Admin messaging
- **SQLite Database** — Zero-config local storage
- **Railway Ready** — One-click deployment

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Your Telegram User ID (from [@userinfobot](https://t.me/userinfobot))
- A [Twelve Data](https://twelvedata.com) API key (free tier available)

### 2. Installation

```bash
# Clone or extract the project
cd hope-forex-signals-bot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### 3. Configure Environment

Edit `.env` with your values:

```env
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
ADMIN_CHAT_ID=123456789
TWELVE_DATA_API_KEY=your_api_key_here
```

### 4. Setup & Run

```bash
# Run setup (creates DB, generates assets)
npm run setup

# Start the bot
npm start
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `ADMIN_CHAT_ID` | ✅ | Your Telegram user ID (admin access) |
| `TWELVE_DATA_API_KEY` | ✅ | Twelve Data API key for market data |
| `SIGNAL_FREQUENCY` | ❌ | Signal interval in minutes (default: 15) |
| `DB_PATH` | ❌ | Database path (default: ./database/database.db) |

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot, show welcome screen |
| `/help` | Show help guide |
| `/admin` | Open admin panel (admin only) |
| `/reply_<id> <message>` | Reply to support ticket (admin only) |

---

## User Menu (Reply Keyboard)

| Button | Function |
|--------|----------|
| 📊 Signals | View recent trading signals |
| 📈 Market Trend | Market overview for all pairs |
| 👤 My Account | Account info & subscription status |
| 💳 Subscription | Subscribe / manage plans |
| 📞 Support | Contact support |
| ℹ️ Help | Help guide |
| ⚙️ Settings | User settings |

---

## Admin Panel

Access by tapping **Admin** buttons or sending `/admin`.

| Feature | Description |
|---------|-------------|
| 👥 Users | Browse all users, manage subscriptions |
| 📊 Statistics | Revenue, user counts, signal stats |
| 💰 Payments | Confirm/reject payment requests |
| 📢 Broadcast | Send message to all users |
| 📈 Signals | Enable/disable strategies, force signal |
| ⚙️ Settings | System configuration |
| 🛠 System | Bot status, pair management |

---

## Signal Format

```
🟢 BUY XAUUSD

📈 Trend: BULLISH

🎯 Entry: 3385.50
🛑 Stop Loss: 3378.00

💰 Take Profit 1: 3395.00
💰 Take Profit 2: 3405.00
💰 Take Profit 3: 3415.00

⚖️ Risk/Reward: 1:3
🎯 Confidence: 92%
⏱ Timeframe: H1
📊 Strategy: Smart Money Concepts

📋 Analysis:
• Bullish BOS
• Liquidity Sweep
• Bullish Order Block
• H4 Uptrend Confirmed
```

---

## Subscription Plans

| Plan | Duration | Default Price |
|------|----------|---------------|
| 1 Week | 7 days | $9.99 |
| 1 Month | 30 days | $29.99 |
| 3 Months | 90 days | $79.99 |
| Lifetime | Forever | $199.99 |

> Prices can be changed from the admin panel settings.

---

## Database Schema

The bot uses SQLite with the following tables:

- `users` — Telegram user records
- `subscriptions` — Active/expired subscription records
- `payments` — Payment requests and confirmations
- `signals` — Generated trading signals history
- `settings` — Bot configuration key-value store
- `support_tickets` — User support messages
- `pair_settings` — Per-pair enable/disable configuration

---

## Deploy on Railway

1. Create a new project on [Railway.app](https://railway.app)
2. Connect your GitHub repo or upload files
3. Set environment variables in Railway dashboard
4. Railway will auto-detect `railway.json` and deploy

Required Railway variables:
```
BOT_TOKEN=
ADMIN_CHAT_ID=
TWELVE_DATA_API_KEY=
```

---

## File Structure

```
hope-forex-signals-bot/
├── assets/
│   ├── logo.png            # Auto-generated bot logo
│   ├── welcome.jpg         # Auto-generated welcome image
│   └── premium-banner.jpg  # Auto-generated premium banner
├── database/
│   └── database.db         # SQLite database (auto-created)
├── src/
│   ├── analysis/
│   │   ├── engine.js       # Main analysis orchestrator
│   │   └── strategies/
│   │       ├── strategy1.js  # Smart Money Concepts
│   │       ├── strategy2.js  # Supply & Demand
│   │       ├── strategy3.js  # EMA + RSI + MACD
│   │       └── strategy4.js  # Trend Following (fallback)
│   ├── admin/
│   │   └── panel.js        # Admin panel handlers
│   ├── bot/
│   │   ├── commands/
│   │   │   └── start.js    # /start command
│   │   ├── handlers/
│   │   │   ├── keyboards.js  # Keyboard definitions
│   │   │   └── menu.js       # Menu handlers
│   │   └── services/
│   │       └── subscription.js  # Subscription logic
│   ├── scheduler/
│   │   └── index.js        # Signal scheduler (cron)
│   ├── support/
│   │   └── tickets.js      # Support ticket system
│   └── utils/
│       ├── database.js     # SQLite database layer
│       ├── imageGen.js     # Signal image generator
│       ├── setup.js        # Setup script
│       └── twelvedata.js   # Twelve Data API client
├── .env.example            # Environment template
├── index.js               # Main entry point
├── package.json
├── Procfile               # Railway/Heroku process file
├── railway.json           # Railway deployment config
└── README.md
```

---

## Troubleshooting

**Bot not responding?**
- Check `BOT_TOKEN` is correct
- Make sure you ran `/start` in the bot chat

**No signals being generated?**
- Verify `TWELVE_DATA_API_KEY` is valid
- Check free tier limits (8 requests/minute on free plan)
- Use `/admin` → Signals → Force Send Signal to test

**Canvas / image generation errors?**
- Try: `npm install --build-from-source canvas`
- On Linux, install system deps: `apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`
- Signals will still work without images (text fallback)

**Database errors?**
- Delete `database/database.db` and restart (fresh setup)
- Ensure `database/` directory exists

---

## License

MIT — Free to use and modify for your own trading bot.

---

*⚠️ Trading involves significant risk. This bot is for educational purposes. Always use proper risk management.*
