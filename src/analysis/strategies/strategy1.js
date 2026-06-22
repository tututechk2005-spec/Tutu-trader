/**
 * Strategy 1: Smart Money Concepts (SMC)
 * - Break of Structure (BOS)
 * - Change of Character (CHOCH)
 * - Liquidity Sweep
 * - Order Blocks
 * - Fair Value Gap (FVG)
 */

function detectBOS(candles) {
  if (candles.length < 20) return null;
  const recent = candles.slice(-20);
  const prev = recent.slice(0, 10);
  const curr = recent.slice(10);

  const prevHigh = Math.max(...prev.map(c => c.high));
  const prevLow = Math.min(...prev.map(c => c.low));
  const currHigh = Math.max(...curr.map(c => c.high));
  const currLow = Math.min(...curr.map(c => c.low));

  if (currHigh > prevHigh && currLow > prevLow) {
    return { type: 'BULLISH_BOS', strength: ((currHigh - prevHigh) / prevHigh) * 100 };
  }
  if (currHigh < prevHigh && currLow < prevLow) {
    return { type: 'BEARISH_BOS', strength: ((prevLow - currLow) / prevLow) * 100 };
  }
  return null;
}

function detectCHOCH(candles) {
  if (candles.length < 30) return null;
  const recent = candles.slice(-30);

  let swingHighs = [];
  let swingLows = [];

  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i + 1].high &&
        recent[i].high > recent[i - 2].high && recent[i].high > recent[i + 2].high) {
      swingHighs.push({ index: i, price: recent[i].high });
    }
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i + 1].low &&
        recent[i].low < recent[i - 2].low && recent[i].low < recent[i + 2].low) {
      swingLows.push({ index: i, price: recent[i].low });
    }
  }

  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lastTwoHighs = swingHighs.slice(-2);
    const lastTwoLows = swingLows.slice(-2);

    if (lastTwoHighs[1].price > lastTwoHighs[0].price && lastTwoLows[1].price < lastTwoLows[0].price) {
      return { type: 'BULLISH_CHOCH' };
    }
    if (lastTwoHighs[1].price < lastTwoHighs[0].price && lastTwoLows[1].price > lastTwoLows[0].price) {
      return { type: 'BEARISH_CHOCH' };
    }
  }
  return null;
}

function detectLiquiditySweep(candles) {
  if (candles.length < 25) return null;
  const recent = candles.slice(-25);
  const lookback = recent.slice(0, 20);
  const last5 = recent.slice(-5);

  const keyHigh = Math.max(...lookback.map(c => c.high));
  const keyLow = Math.min(...lookback.map(c => c.low));

  for (const candle of last5) {
    if (candle.high > keyHigh && candle.close < keyHigh) {
      return { type: 'BEARISH_SWEEP', level: keyHigh };
    }
    if (candle.low < keyLow && candle.close > keyLow) {
      return { type: 'BULLISH_SWEEP', level: keyLow };
    }
  }
  return null;
}

function detectOrderBlock(candles) {
  if (candles.length < 15) return null;
  const recent = candles.slice(-15);

  for (let i = recent.length - 4; i >= 1; i--) {
    const candle = recent[i];
    const nextCandle = recent[i + 1];
    const bodySize = Math.abs(candle.close - candle.open);
    const rangeSize = candle.high - candle.low;

    if (rangeSize === 0) continue;
    const bodyRatio = bodySize / rangeSize;

    if (bodyRatio > 0.5) {
      // Bullish order block: bearish candle before bullish move
      if (candle.close < candle.open && nextCandle.close > nextCandle.open) {
        return {
          type: 'BULLISH_OB',
          high: candle.high,
          low: candle.low,
          midpoint: (candle.high + candle.low) / 2,
        };
      }
      // Bearish order block: bullish candle before bearish move
      if (candle.close > candle.open && nextCandle.close < nextCandle.open) {
        return {
          type: 'BEARISH_OB',
          high: candle.high,
          low: candle.low,
          midpoint: (candle.high + candle.low) / 2,
        };
      }
    }
  }
  return null;
}

function detectFVG(candles) {
  if (candles.length < 5) return null;
  const recent = candles.slice(-5);

  for (let i = 0; i < recent.length - 2; i++) {
    const c1 = recent[i];
    const c2 = recent[i + 1];
    const c3 = recent[i + 2];

    // Bullish FVG: gap between c1.high and c3.low
    if (c3.low > c1.high) {
      return {
        type: 'BULLISH_FVG',
        upper: c3.low,
        lower: c1.high,
        midpoint: (c3.low + c1.high) / 2,
      };
    }
    // Bearish FVG: gap between c3.high and c1.low
    if (c3.high < c1.low) {
      return {
        type: 'BEARISH_FVG',
        upper: c1.low,
        lower: c3.high,
        midpoint: (c1.low + c3.high) / 2,
      };
    }
  }
  return null;
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

function analyzeSMC(candlesByTF) {
  const h4 = candlesByTF['H4'];
  const h1 = candlesByTF['H1'];
  const m30 = candlesByTF['M30'];
  const m15 = candlesByTF['M15'];

  if (!h1 || h1.length < 30) return null;
  if (!m15 || m15.length < 30) return null;

  const bos = detectBOS(h1);
  const choch = detectCHOCH(h1);
  const sweep = detectLiquiditySweep(m30 || h1);
  const ob = detectOrderBlock(m15);
  const fvg = detectFVG(m15);

  const signals = [bos, choch, sweep, ob, fvg].filter(Boolean);
  if (signals.length < 2) return null;

  const currentPrice = m15[m15.length - 1].close;
  const atr = calculateATR(m15) || calculateATR(h1);
  if (!atr) return null;

  // Determine direction
  let bullishCount = 0;
  let bearishCount = 0;

  signals.forEach(s => {
    if (!s) return;
    const t = s.type || '';
    if (t.includes('BULL') || t.includes('BULLISH')) bullishCount++;
    if (t.includes('BEAR') || t.includes('BEARISH')) bearishCount++;
  });

  // H4 trend bias
  if (h4 && h4.length > 10) {
    const h4Recent = h4.slice(-10);
    const h4Trend = h4Recent[h4Recent.length - 1].close > h4Recent[0].close ? 'bullish' : 'bearish';
    if (h4Trend === 'bullish') bullishCount++;
    else bearishCount++;
  }

  if (bullishCount === bearishCount) return null;
  const isBullish = bullishCount > bearishCount;

  const reasons = [];
  if (bos) reasons.push(bos.type.replace('_', ' '));
  if (choch) reasons.push(choch.type.replace('_', ' '));
  if (sweep) reasons.push(`Liquidity Sweep at ${sweep.level?.toFixed(2) || 'key level'}`);
  if (ob) reasons.push(`${ob.type === 'BULLISH_OB' ? 'Bullish' : 'Bearish'} Order Block`);
  if (fvg) reasons.push(`${fvg.type === 'BULLISH_FVG' ? 'Bullish' : 'Bearish'} FVG`);
  if (h4) reasons.push('H4 Trend Confirmed');

  const confidence = Math.min(95, 60 + signals.length * 7 + (Math.abs(bullishCount - bearishCount) * 5));

  let entry, stopLoss, tp1, tp2, tp3;

  if (isBullish) {
    entry = currentPrice;
    stopLoss = entry - atr * 1.5;
    if (ob && ob.type === 'BULLISH_OB') stopLoss = Math.min(stopLoss, ob.low - atr * 0.3);
    tp1 = entry + atr * 1.5;
    tp2 = entry + atr * 3.0;
    tp3 = entry + atr * 5.0;
  } else {
    entry = currentPrice;
    stopLoss = entry + atr * 1.5;
    if (ob && ob.type === 'BEARISH_OB') stopLoss = Math.max(stopLoss, ob.high + atr * 0.3);
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
    strategy: 1,
    strategyName: 'Smart Money Concepts',
    reasons,
  };
}

module.exports = { analyzeSMC };
