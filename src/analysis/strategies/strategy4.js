/**
 * Strategy 4: Trend Following + Multi Timeframe Confirmation + Momentum Analysis
 * Fallback strategy - always produces a signal
 */

function calculateSMA(values, period) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function detectTrend(candles, period = 20) {
  if (candles.length < period) return 'neutral';
  const recent = candles.slice(-period);
  const firstHalf = recent.slice(0, period / 2);
  const secondHalf = recent.slice(period / 2);

  const firstAvg = firstHalf.reduce((a, c) => a + c.close, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, c) => a + c.close, 0) / secondHalf.length;

  const change = (secondAvg - firstAvg) / firstAvg * 100;
  if (change > 0.1) return 'bullish';
  if (change < -0.1) return 'bearish';
  return 'neutral';
}

function calculateMomentum(candles, period = 10) {
  if (candles.length < period + 1) return 0;
  const current = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - period].close;
  return ((current - past) / past) * 100;
}

function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function detectHigherHighsLowerLows(candles) {
  if (candles.length < 15) return 'neutral';
  const recent = candles.slice(-15);

  const highs = [];
  const lows = [];

  for (let i = 1; i < recent.length - 1; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i + 1].high) {
      highs.push(recent[i].high);
    }
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i + 1].low) {
      lows.push(recent[i].low);
    }
  }

  if (highs.length >= 2 && lows.length >= 2) {
    const hhhl = highs[highs.length - 1] > highs[highs.length - 2] &&
                 lows[lows.length - 1] > lows[lows.length - 2];
    const lhll = highs[highs.length - 1] < highs[highs.length - 2] &&
                 lows[lows.length - 1] < lows[lows.length - 2];
    if (hhhl) return 'bullish';
    if (lhll) return 'bearish';
  }

  return 'neutral';
}

function analyzeTrendFollowing(candlesByTF) {
  const h4 = candlesByTF['H4'];
  const h1 = candlesByTF['H1'];
  const m30 = candlesByTF['M30'];
  const m15 = candlesByTF['M15'];

  // Use whatever timeframes we have
  const primary = h1 || m30 || m15;
  const entry_tf = m15 || m30 || h1;

  if (!primary || primary.length < 15) {
    return generateForcedSignal(entry_tf);
  }

  const currentPrice = entry_tf[entry_tf.length - 1].close;
  const atr = calculateATR(entry_tf) || calculateATR(primary) || currentPrice * 0.001;

  const primaryCloses = primary.map(c => c.close);
  const primaryTrend = detectTrend(primary, Math.min(20, primary.length - 1));
  const hhll = detectHigherHighsLowerLows(primary);
  const momentum = calculateMomentum(entry_tf, Math.min(10, entry_tf.length - 2));

  const ema20 = calculateEMA(primaryCloses, Math.min(20, primaryCloses.length - 1));
  const ema50 = calculateEMA(primaryCloses, Math.min(50, primaryCloses.length - 1));
  const sma20 = calculateSMA(primaryCloses, Math.min(20, primaryCloses.length));

  let bullishScore = 0;
  let bearishScore = 0;
  const reasons = [];

  // Trend direction
  if (primaryTrend === 'bullish') { bullishScore += 3; reasons.push('Uptrend Confirmed'); }
  else if (primaryTrend === 'bearish') { bearishScore += 3; reasons.push('Downtrend Confirmed'); }

  // HH/HL or LH/LL structure
  if (hhll === 'bullish') { bullishScore += 3; reasons.push('Higher Highs & Higher Lows'); }
  else if (hhll === 'bearish') { bearishScore += 3; reasons.push('Lower Highs & Lower Lows'); }

  // Momentum
  if (momentum > 0.05) { bullishScore += 2; reasons.push(`Positive Momentum (+${momentum.toFixed(2)}%)`); }
  else if (momentum < -0.05) { bearishScore += 2; reasons.push(`Negative Momentum (${momentum.toFixed(2)}%)`); }

  // EMA confluence
  if (ema20 !== null) {
    if (currentPrice > ema20) { bullishScore += 1; }
    else { bearishScore += 1; }
  }
  if (ema50 !== null) {
    if (currentPrice > ema50) { bullishScore += 2; reasons.push('Above EMA50'); }
    else { bearishScore += 2; reasons.push('Below EMA50'); }
  }

  // H4 trend confirmation
  if (h4 && h4.length > 10) {
    const h4Trend = detectTrend(h4, Math.min(20, h4.length - 1));
    if (h4Trend === 'bullish') {
      bullishScore += 3;
      reasons.push('H4 Uptrend Confirmed');
    } else if (h4Trend === 'bearish') {
      bearishScore += 3;
      reasons.push('H4 Downtrend Confirmed');
    }
  }

  // Multi-timeframe alignment
  const tfScores = [];
  const tfs = [h4, h1, m30, m15].filter(Boolean);
  for (const tf of tfs) {
    if (tf.length > 5) {
      const tfTrend = detectTrend(tf, Math.min(20, tf.length - 1));
      tfScores.push(tfTrend);
    }
  }
  const aligned = tfScores.filter(t => t !== 'neutral');
  const bullishTFs = aligned.filter(t => t === 'bullish').length;
  const bearishTFs = aligned.filter(t => t === 'bearish').length;

  if (bullishTFs >= 2 && bullishTFs > bearishTFs) {
    bullishScore += 3;
    reasons.push(`Multi-TF Bullish Alignment (${bullishTFs}/${aligned.length})`);
  } else if (bearishTFs >= 2 && bearishTFs > bullishTFs) {
    bearishScore += 3;
    reasons.push(`Multi-TF Bearish Alignment (${bearishTFs}/${aligned.length})`);
  }

  // Always decide a direction (Strategy 4 never fails)
  let isBullish;
  if (bullishScore === bearishScore) {
    // Use very recent candles as tiebreaker
    const last3 = entry_tf.slice(-3);
    isBullish = last3[last3.length - 1].close >= last3[0].close;
    reasons.push('Price Action Tiebreaker');
  } else {
    isBullish = bullishScore > bearishScore;
  }

  const confidence = Math.min(89, 60 + Math.abs(bullishScore - bearishScore) * 3 + (aligned.length * 2));

  let entry = currentPrice;
  let stopLoss, tp1, tp2, tp3;

  if (isBullish) {
    stopLoss = entry - atr * 1.5;
    tp1 = entry + atr * 1.5;
    tp2 = entry + atr * 3.0;
    tp3 = entry + atr * 5.0;
  } else {
    stopLoss = entry + atr * 1.5;
    tp1 = entry - atr * 1.5;
    tp2 = entry - atr * 3.0;
    tp3 = entry - atr * 5.0;
  }

  const riskPips = Math.abs(entry - stopLoss);
  const rewardPips = Math.abs(tp3 - entry);
  const rr = riskPips > 0 ? (rewardPips / riskPips).toFixed(1) : '3.0';

  return {
    direction: isBullish ? 'BUY' : 'SELL',
    trend: isBullish ? 'BULLISH' : 'BEARISH',
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskReward: `1:${rr}`,
    confidence,
    strategy: 4,
    strategyName: 'Trend Following MTF',
    reasons: reasons.slice(0, 5),
  };
}

function generateForcedSignal(candles) {
  if (!candles || candles.length === 0) return null;
  const currentPrice = candles[candles.length - 1].close;
  const atr = calculateATR(candles) || currentPrice * 0.001;
  const momentum = calculateMomentum(candles, Math.min(5, candles.length - 2));
  const isBullish = momentum >= 0;

  const entry = currentPrice;
  const stopLoss = isBullish ? entry - atr * 1.5 : entry + atr * 1.5;
  const tp1 = isBullish ? entry + atr * 1.5 : entry - atr * 1.5;
  const tp2 = isBullish ? entry + atr * 3.0 : entry - atr * 3.0;
  const tp3 = isBullish ? entry + atr * 5.0 : entry - atr * 5.0;

  return {
    direction: isBullish ? 'BUY' : 'SELL',
    trend: isBullish ? 'BULLISH' : 'BEARISH',
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskReward: '1:3.0',
    confidence: 65,
    strategy: 4,
    strategyName: 'Trend Following MTF',
    reasons: ['Momentum Analysis', 'Multi-Timeframe Trend'],
  };
}

module.exports = { analyzeTrendFollowing };
