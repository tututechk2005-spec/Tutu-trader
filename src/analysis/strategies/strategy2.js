/**
 * Strategy 2: Supply & Demand / Support & Resistance / Breakout Retest
 */

function findSupportsAndResistances(candles, lookback = 50) {
  const recent = candles.slice(-lookback);
  const levels = [];
  const tolerance = (Math.max(...recent.map(c => c.high)) - Math.min(...recent.map(c => c.low))) * 0.002;

  for (let i = 2; i < recent.length - 2; i++) {
    // Swing high = resistance
    if (recent[i].high > recent[i - 1].high &&
        recent[i].high > recent[i + 1].high &&
        recent[i].high > recent[i - 2].high &&
        recent[i].high > recent[i + 2].high) {
      const existing = levels.find(l => l.type === 'resistance' && Math.abs(l.price - recent[i].high) < tolerance);
      if (existing) {
        existing.touches++;
        existing.strength = Math.min(100, existing.strength + 10);
      } else {
        levels.push({ type: 'resistance', price: recent[i].high, touches: 1, strength: 50 });
      }
    }
    // Swing low = support
    if (recent[i].low < recent[i - 1].low &&
        recent[i].low < recent[i + 1].low &&
        recent[i].low < recent[i - 2].low &&
        recent[i].low < recent[i + 2].low) {
      const existing = levels.find(l => l.type === 'support' && Math.abs(l.price - recent[i].low) < tolerance);
      if (existing) {
        existing.touches++;
        existing.strength = Math.min(100, existing.strength + 10);
      } else {
        levels.push({ type: 'support', price: recent[i].low, touches: 1, strength: 50 });
      }
    }
  }

  return levels.sort((a, b) => b.strength - a.strength);
}

function findSupplyDemandZones(candles) {
  const zones = [];
  const len = candles.length;
  if (len < 20) return zones;

  for (let i = 3; i < len - 3; i++) {
    const c = candles[i];
    const bodySize = Math.abs(c.close - c.open);
    const rangeSize = c.high - c.low;
    if (rangeSize === 0) continue;

    // Strong impulse candle = potential S/D zone origin
    if (bodySize / rangeSize > 0.7) {
      const prevCandles = candles.slice(Math.max(0, i - 3), i);
      const nextCandles = candles.slice(i + 1, Math.min(len, i + 4));
      const prevRange = prevCandles.reduce((acc, pc) => acc + (pc.high - pc.low), 0) / (prevCandles.length || 1);
      const thisRange = rangeSize;

      if (thisRange > prevRange * 1.5) {
        // Demand zone: strong bullish candle
        if (c.close > c.open) {
          zones.push({
            type: 'demand',
            upper: c.open,
            lower: Math.min(c.open, c.low),
            midpoint: (c.open + c.low) / 2,
            strength: Math.min(100, 50 + (bodySize / rangeSize) * 50),
          });
        }
        // Supply zone: strong bearish candle
        if (c.close < c.open) {
          zones.push({
            type: 'supply',
            upper: Math.max(c.open, c.high),
            lower: c.open,
            midpoint: (c.open + c.high) / 2,
            strength: Math.min(100, 50 + (bodySize / rangeSize) * 50),
          });
        }
      }
    }
  }

  return zones.slice(-10);
}

function detectBreakoutRetest(candles, levels) {
  if (candles.length < 10 || levels.length === 0) return null;

  const currentPrice = candles[candles.length - 1].close;
  const recent5 = candles.slice(-5);
  const recent15 = candles.slice(-15);
  const recentHigh = Math.max(...recent15.map(c => c.high));
  const recentLow = Math.min(...recent15.map(c => c.low));
  const atr = calculateATR(candles);

  if (!atr) return null;

  for (const level of levels) {
    if (level.strength < 40) continue;

    // Bullish breakout retest of resistance
    if (level.type === 'resistance') {
      const breakout = recentHigh > level.price;
      const retest = recent5.some(c => c.low <= level.price * 1.002 && c.low >= level.price * 0.998);
      if (breakout && retest) {
        return {
          type: 'BULLISH_BREAKOUT_RETEST',
          level: level.price,
          strength: level.strength,
        };
      }
    }

    // Bearish breakout retest of support
    if (level.type === 'support') {
      const breakout = recentLow < level.price;
      const retest = recent5.some(c => c.high >= level.price * 0.998 && c.high <= level.price * 1.002);
      if (breakout && retest) {
        return {
          type: 'BEARISH_BREAKOUT_RETEST',
          level: level.price,
          strength: level.strength,
        };
      }
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

function analyzeSupplyDemand(candlesByTF) {
  const h1 = candlesByTF['H1'];
  const m30 = candlesByTF['M30'];
  const m15 = candlesByTF['M15'];

  if (!h1 || h1.length < 30) return null;
  if (!m15 || m15.length < 20) return null;

  const levels = findSupportsAndResistances(h1, 60);
  const zones = findSupplyDemandZones(m30 || h1);
  const breakout = detectBreakoutRetest(m15, levels);

  const currentPrice = m15[m15.length - 1].close;
  const atr = calculateATR(m15);
  if (!atr) return null;

  // Find nearest S/R levels
  const supportLevels = levels.filter(l => l.type === 'support' && l.price < currentPrice)
    .sort((a, b) => b.price - a.price);
  const resistanceLevels = levels.filter(l => l.type === 'resistance' && l.price > currentPrice)
    .sort((a, b) => a.price - b.price);

  const nearestSupport = supportLevels[0];
  const nearestResistance = resistanceLevels[0];

  const demandZones = zones.filter(z => z.type === 'demand' && z.upper < currentPrice * 1.005)
    .sort((a, b) => b.upper - a.upper);
  const supplyZones = zones.filter(z => z.type === 'supply' && z.lower > currentPrice * 0.995)
    .sort((a, b) => a.lower - b.lower);

  let direction = null;
  const reasons = [];
  let confidence = 62;

  // Determine bias from breakout
  if (breakout) {
    direction = breakout.type.includes('BULLISH') ? 'BUY' : 'SELL';
    reasons.push(breakout.type.includes('BULLISH') ? 'Bullish Breakout Retest' : 'Bearish Breakout Retest');
    confidence += 15;
  }

  // Determine bias from S/R proximity
  if (!direction) {
    if (nearestSupport && nearestResistance) {
      const distToSupport = currentPrice - nearestSupport.price;
      const distToResistance = nearestResistance.price - currentPrice;

      if (distToSupport < distToResistance && nearestSupport.strength > 50) {
        direction = 'BUY';
        reasons.push(`Strong Support at ${nearestSupport.price.toFixed(4)}`);
        confidence += nearestSupport.touches * 5;
      } else if (nearestResistance.strength > 50) {
        direction = 'SELL';
        reasons.push(`Strong Resistance at ${nearestResistance.price.toFixed(4)}`);
        confidence += nearestResistance.touches * 5;
      }
    }
  }

  // Demand/Supply zones
  if (demandZones.length > 0) {
    const dz = demandZones[0];
    if (currentPrice <= dz.upper * 1.003) {
      if (!direction) direction = 'BUY';
      if (direction === 'BUY') {
        reasons.push('Price in Demand Zone');
        confidence += 10;
      }
    }
  }

  if (supplyZones.length > 0) {
    const sz = supplyZones[0];
    if (currentPrice >= sz.lower * 0.997) {
      if (!direction) direction = 'SELL';
      if (direction === 'SELL') {
        reasons.push('Price in Supply Zone');
        confidence += 10;
      }
    }
  }

  if (!direction) {
    // Fallback: use recent price action momentum
    const recent10 = m15.slice(-10);
    const firstClose = recent10[0].close;
    const lastClose = recent10[recent10.length - 1].close;
    direction = lastClose > firstClose ? 'BUY' : 'SELL';
    reasons.push('Recent Price Momentum');
  }

  confidence = Math.min(92, confidence);
  const isBullish = direction === 'BUY';

  let entry = currentPrice;
  let stopLoss, tp1, tp2, tp3;

  if (isBullish) {
    stopLoss = nearestSupport ? Math.min(currentPrice - atr * 1.2, nearestSupport.price - atr * 0.3) : currentPrice - atr * 1.5;
    tp1 = nearestResistance ? nearestResistance.price * 0.999 : currentPrice + atr * 1.5;
    tp2 = currentPrice + atr * 3.0;
    tp3 = currentPrice + atr * 5.0;
  } else {
    stopLoss = nearestResistance ? Math.max(currentPrice + atr * 1.2, nearestResistance.price + atr * 0.3) : currentPrice + atr * 1.5;
    tp1 = nearestSupport ? nearestSupport.price * 1.001 : currentPrice - atr * 1.5;
    tp2 = currentPrice - atr * 3.0;
    tp3 = currentPrice - atr * 5.0;
  }

  const riskPips = Math.abs(entry - stopLoss);
  const rewardPips = Math.abs(tp3 - entry);
  const rr = riskPips > 0 ? (rewardPips / riskPips).toFixed(1) : '3.0';

  return {
    direction,
    trend: isBullish ? 'BULLISH' : 'BEARISH',
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskReward: `1:${rr}`,
    confidence,
    strategy: 2,
    strategyName: 'Supply & Demand',
    reasons,
  };
}

module.exports = { analyzeSupplyDemand };
