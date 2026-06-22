const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '../../assets');

function getPipDigits(pair) {
  if (pair === 'XAUUSD') return 2;
  if (pair.includes('JPY')) return 3;
  return 5;
}

function formatPrice(price, pair) {
  const digits = getPipDigits(pair);
  return price.toFixed(digits === 3 ? 3 : digits === 2 ? 2 : 5);
}

async function generateSignalImage(signal) {
  const W = 900;
  const H = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isBuy = signal.direction.toUpperCase() === 'BUY';
  const primaryColor = isBuy ? '#00C851' : '#FF4444';
  const accentColor = isBuy ? '#00FF7F' : '#FF6B6B';
  const bgGradientStart = '#0A0E1A';
  const bgGradientEnd = '#111827';

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, bgGradientStart);
  bgGrad.addColorStop(1, bgGradientEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Grid lines (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Top accent bar
  const topBarGrad = ctx.createLinearGradient(0, 0, W, 0);
  topBarGrad.addColorStop(0, primaryColor);
  topBarGrad.addColorStop(0.5, accentColor);
  topBarGrad.addColorStop(1, primaryColor);
  ctx.fillStyle = topBarGrad;
  ctx.fillRect(0, 0, W, 6);

  // Logo area
  const logoPath = path.join(ASSETS_DIR, 'logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, 30, 20, 60, 60);
    } catch (e) { /* skip */ }
  }

  // Brand name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('HOPE FOREX SIGNALS', 105, 45);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '13px Arial';
  ctx.fillText('AI-Powered Professional Trading Signals', 105, 68);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(30, 92, W - 60, 1);

  // Direction badge
  const badgeX = W - 200;
  const badgeY = 20;
  const badgeW = 170;
  const badgeH = 56;
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
  badgeGrad.addColorStop(0, primaryColor + 'CC');
  badgeGrad.addColorStop(1, primaryColor + '66');
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 12);
  ctx.fill();
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 2;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 12);
  ctx.stroke();

  const dirSymbol = isBuy ? '▲' : '▼';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${dirSymbol} ${signal.direction.toUpperCase()}`, badgeX + badgeW / 2, badgeY + 38);
  ctx.textAlign = 'left';

  // Pair name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 56px Arial';
  ctx.fillText(signal.pair, 30, 165);

  // Trend badge
  const trendBadgeGrad = ctx.createLinearGradient(0, 110, 0, 145);
  trendBadgeGrad.addColorStop(0, primaryColor + '33');
  trendBadgeGrad.addColorStop(1, primaryColor + '11');
  ctx.fillStyle = trendBadgeGrad;
  roundRect(ctx, 30, 175, 180, 32, 8);
  ctx.fill();
  ctx.strokeStyle = primaryColor + '88';
  ctx.lineWidth = 1;
  roundRect(ctx, 30, 175, 180, 32, 8);
  ctx.stroke();
  ctx.fillStyle = primaryColor;
  ctx.font = 'bold 14px Arial';
  ctx.fillText(`TREND: ${(signal.trend || 'BULLISH').toUpperCase()}`, 42, 196);

  // Separator line
  ctx.strokeStyle = primaryColor + '44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 220);
  ctx.lineTo(W - 30, 220);
  ctx.stroke();

  // Price data section
  const col1X = 30;
  const col2X = 240;
  const col3X = 480;
  const col4X = 680;
  const startY = 250;
  const rowH = 72;

  const boxes = [
    { label: 'ENTRY', value: formatPrice(signal.entry, signal.pair), color: '#FFFFFF', x: col1X, y: startY },
    { label: 'STOP LOSS', value: formatPrice(signal.stopLoss, signal.pair), color: '#FF4444', x: col2X, y: startY },
    { label: 'TP 1', value: formatPrice(signal.tp1, signal.pair), color: '#00C851', x: col3X, y: startY },
    { label: 'TP 2', value: formatPrice(signal.tp2, signal.pair), color: '#00C851', x: col4X, y: startY },
    { label: 'TP 3', value: formatPrice(signal.tp3, signal.pair), color: '#00E676', x: col1X, y: startY + rowH },
    { label: 'RISK/REWARD', value: signal.riskReward || '1:3', color: '#FFB300', x: col2X, y: startY + rowH },
    { label: 'TIMEFRAME', value: signal.timeframe || 'H1', color: '#40C4FF', x: col3X, y: startY + rowH },
    { label: 'STRATEGY', value: `S${signal.strategy || '1'}`, color: '#CE93D8', x: col4X, y: startY + rowH },
  ];

  for (const box of boxes) {
    const bW = box.x === col4X ? W - box.x - 30 : 185;
    const bH = 62;

    // Box background
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, box.x, box.y, bW, bH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, bW, bH, 10);
    ctx.stroke();

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px Arial';
    ctx.fillText(box.label, box.x + 10, box.y + 18);

    // Value
    ctx.fillStyle = box.color;
    ctx.font = 'bold 20px Arial';
    ctx.fillText(box.value, box.x + 10, box.y + 46);
  }

  // Confidence meter
  const confY = startY + rowH * 2 + 15;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  roundRect(ctx, 30, confY, W - 60, 58, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, 30, confY, W - 60, 58, 10);
  ctx.stroke();

  const conf = signal.confidence || 85;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px Arial';
  ctx.fillText('CONFIDENCE SCORE', 44, confY + 18);

  ctx.fillStyle = primaryColor;
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(`${conf}%`, W - 44, confY + 18);
  ctx.textAlign = 'left';

  const barX = 44;
  const barY = confY + 26;
  const barW = W - 88;
  const barH = 14;

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, barX, barY, barW, barH, 7);
  ctx.fill();

  const confGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  confGrad.addColorStop(0, primaryColor);
  confGrad.addColorStop(1, accentColor);
  ctx.fillStyle = confGrad;
  roundRect(ctx, barX, barY, barW * (conf / 100), barH, 7);
  ctx.fill();

  // Reasons section
  const reasons = signal.reasons || [];
  if (reasons.length > 0) {
    const reasonsY = confY + 70;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, 30, reasonsY, W - 60, 44, 10);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px Arial';
    ctx.fillText('ANALYSIS:', 44, reasonsY + 16);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '12px Arial';
    const reasonText = reasons.slice(0, 4).join('  •  ');
    ctx.fillText(reasonText, 44, reasonsY + 34);
  }

  // Timestamp
  const now = new Date();
  const timeStr = now.toUTCString().replace(' GMT', ' UTC');
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '11px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(timeStr, W - 30, H - 10);
  ctx.textAlign = 'left';

  // Bottom disclaimer
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '10px Arial';
  ctx.fillText('⚠ Trading involves risk. Past performance is not indicative of future results.', 30, H - 10);

  return canvas.toBuffer('image/png');
}

async function generateWelcomeImage() {
  const W = 900;
  const H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0A0E1A');
  bgGrad.addColorStop(0.5, '#0D1B2A');
  bgGrad.addColorStop(1, '#0A0E1A');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Decorative circles
  drawGlowCircle(ctx, W * 0.8, H * 0.2, 200, '#00C851', 0.06);
  drawGlowCircle(ctx, W * 0.1, H * 0.8, 180, '#1565C0', 0.06);
  drawGlowCircle(ctx, W * 0.5, H * 0.5, 300, '#FFB300', 0.03);

  // Top bar
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, '#00C851');
  topGrad.addColorStop(0.5, '#00E676');
  topGrad.addColorStop(1, '#00C851');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 5);
  ctx.fillRect(0, H - 5, W, 5);

  // Logo
  const logoPath = path.join(ASSETS_DIR, 'logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, W / 2 - 50, 40, 100, 100);
    } catch (e) { /* skip */ }
  } else {
    // Draw placeholder logo circle
    const logoGrad = ctx.createRadialGradient(W / 2, 90, 0, W / 2, 90, 50);
    logoGrad.addColorStop(0, '#00E676');
    logoGrad.addColorStop(1, '#00C851');
    ctx.fillStyle = logoGrad;
    ctx.beginPath();
    ctx.arc(W / 2, 90, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('H', W / 2, 105);
    ctx.textAlign = 'left';
  }

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 44px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🚀 Hope Forex Signals', W / 2, 200);

  // Subtitle
  const subGrad = ctx.createLinearGradient(0, 220, W, 220);
  subGrad.addColorStop(0, '#00C851');
  subGrad.addColorStop(0.5, '#FFB300');
  subGrad.addColorStop(1, '#00C851');
  ctx.fillStyle = subGrad;
  ctx.font = 'bold 20px Arial';
  ctx.fillText('AI-Powered Forex & Gold Signals', W / 2, 240);

  // Feature list
  const features = [
    '✅ Real-Time Signals',
    '✅ Gold & Forex Pairs',
    '✅ Smart Money Concepts',
    '✅ Risk Management',
    '✅ 24/7 Auto Signals',
  ];

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '17px Arial';
  let fy = 290;
  const colW = 200;
  for (let i = 0; i < features.length; i++) {
    const x = i < 3 ? W / 2 - 220 : W / 2 - 60;
    const y = i < 3 ? 280 + (i * 36) : 280 + ((i - 3) * 36);
    ctx.fillText(features[i], x, y);
  }

  // Bottom text
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '13px Arial';
  ctx.fillText('Professional Trading Signals • Trusted by Thousands', W / 2, H - 20);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

async function generatePremiumBanner() {
  const W = 900;
  const H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#1A0533');
  bgGrad.addColorStop(0.5, '#2D1B69');
  bgGrad.addColorStop(1, '#1A0533');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  drawGlowCircle(ctx, W * 0.9, H * 0.2, 150, '#FFB300', 0.1);
  drawGlowCircle(ctx, W * 0.1, H * 0.8, 120, '#9C27B0', 0.1);

  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, '#FFB300');
  topGrad.addColorStop(0.5, '#FF8F00');
  topGrad.addColorStop(1, '#FFB300');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 5);

  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('💎 PREMIUM MEMBERSHIP', W / 2, 110);

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '20px Arial';
  ctx.fillText('Unlock All Signals • Priority Access • 24/7 Support', W / 2, 155);

  const plans = ['1 Week', '1 Month', '3 Months', 'Lifetime'];
  const prices = ['$9.99', '$29.99', '$79.99', '$199.99'];
  const planW = 190;
  const planStartX = W / 2 - (planW * 2 + 30);

  for (let i = 0; i < plans.length; i++) {
    const px = planStartX + i * (planW + 20);
    const py = 185;
    const ph = 80;

    ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
    roundRect(ctx, px, py, planW, ph, 10);
    ctx.fill();
    ctx.strokeStyle = '#FFB300';
    ctx.lineWidth = 1.5;
    roundRect(ctx, px, py, planW, ph, 10);
    ctx.stroke();

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(plans[i], px + planW / 2, py + 28);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(prices[i], px + planW / 2, py + 58);
  }

  ctx.textAlign = 'left';
  return canvas.toBuffer('image/png');
}

async function generateLogoImage() {
  const W = 200;
  const H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Transparent background
  ctx.clearRect(0, 0, W, H);

  // Outer glow
  const outerGrad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 100);
  outerGrad.addColorStop(0, '#00C851CC');
  outerGrad.addColorStop(1, '#00C85100');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 100, 0, Math.PI * 2);
  ctx.fill();

  // Main circle
  const mainGrad = ctx.createRadialGradient(W / 2, H / 2 - 10, 10, W / 2, H / 2, 80);
  mainGrad.addColorStop(0, '#00E676');
  mainGrad.addColorStop(0.6, '#00C851');
  mainGrad.addColorStop(1, '#007E33');
  ctx.fillStyle = mainGrad;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 80, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#00FF7F';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 80, 0, Math.PI * 2);
  ctx.stroke();

  // Letter H
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', W / 2, H / 2 + 4);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return canvas.toBuffer('image/png');
}

function drawGlowCircle(ctx, x, y, r, color, alpha) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, '0'));
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

async function ensureAssets() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  const logoPath = path.join(ASSETS_DIR, 'logo.png');
  const welcomePath = path.join(ASSETS_DIR, 'welcome.jpg');
  const bannerPath = path.join(ASSETS_DIR, 'premium-banner.jpg');

  if (!fs.existsSync(logoPath)) {
    const buf = await generateLogoImage();
    fs.writeFileSync(logoPath, buf);
    console.log('✅ Generated logo.png');
  }

  if (!fs.existsSync(welcomePath)) {
    const buf = await generateWelcomeImage();
    fs.writeFileSync(welcomePath, buf);
    console.log('✅ Generated welcome.jpg');
  }

  if (!fs.existsSync(bannerPath)) {
    const buf = await generatePremiumBanner();
    fs.writeFileSync(bannerPath, buf);
    console.log('✅ Generated premium-banner.jpg');
  }
}

module.exports = { generateSignalImage, generateWelcomeImage, generatePremiumBanner, ensureAssets };
