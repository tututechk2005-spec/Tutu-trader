/**
 * Strategy 3: EMA 50/200 + RSI + MACD
 */

function calculateEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateEMASeries(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result = new Array(period - 1).fill(null);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod + signalPeriod) return null;

  const fastEMA = calculateEMASeries(closes, fastPeriod);
  const slowEMA = calculateEMASeries(closes, slowPeriod);

  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  if (macdLine.length < signalPeriod) return null;

  const signal = calculateEMA(macdLine, signalPeriod);
  const macdValue = macdLine[macdLine.length - 1];
  const histogram = macdValue - signal;

  const prevMacd = macdLine[macdLine.length - 2];
  const prevSignal = calculateEMA(macdLine.slice(0, -1), signalPeriod);

  return {
    macd: macdValue,
    signal,
    histogram,
    prevMacd,
    prevSignal,
    bullishCross: prevMacd < prevSignal && macdValue > signal,
    bearishCross: prevMacd > prevSignal && macdValue < signal,
  };
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

function analyzeEMAIndicators(candlesByTF) {
  const h1 = candlesByTF['H1'];
  const h4 = candlesByTF['H4'];
  const m15 = candlesByTF['M15'];
  const m30 = candlesByTF['M30'];

  const primary = h1 || m30;
  if (!primary || primary.length < 60) return null;
  if (!m15 || m15.length < 30) return null;

  const primaryCloses = primary.map(c => c.close);
  const m15Closes = m15.map(c => c.close);

  const ema50_h1 = calculateEMA(primaryCloses, 50);
  const ema200_h1 = calculateEMA(primaryCloses, Math.min(200, primaryCloses.length - 1));
  const rsi = calculateRSI(m15Closes, 14);
  const macd = calculateMACD(primaryCloses);
  const atr = calculateATR(m15);

  if (ema50_h1 === null || rsi === null || !macd || !atr) return null;

  const currentPrice = m15[m15.length - 1].close;
  const reasons = [];
  let bullishScore = 0;
  let bearishScore = 0;

  // EMA 50 vs price
  if (currentPrice > ema50_h1) {
    bullishScore += 2;
    reasons.push('Price Above EMA 50');
  } else {
    bearishScore += 2;
    reasons.push('Price Below EMA 50');
  }

  // EMA 200 (golden/death cross)
  if (ema200_h1 !== null) {
    if (ema50_h1 > ema200_h1) {
      bullishScore += 3;
      reasons.push('Golden Cross (EMA50 > EMA200)');
    } else {
      bearishScore += 3;
      reasons.push('Death Cross (EMA50 < EMA200)');
    }
    if (currentPrice > ema200_h1) bullishScore += 1;
    else bearishScore += 1;
  }

  // RSI
  if (rsi < 35) {
    bullishScore += 3;
    reasons.push(`RSI Oversold (${rsi.toFixed(1)})`);
  } else if (rsi > 65) {
    bearishScore += 3;
    reasons.push(`RSI Overbought (${rsi.toFixed(1)})`);
  } else if (rsi > 50) {
    bullishScore += 1;
    reasons.push(`RSI Bullish Zone (${rsi.toFixed(1)})`);
  } else {
    bearishScore += 1;
    reasons.push(`RSI Bearish Zone (${rsi.toFixed(1)})`);
  }

  // MACD
  if (macd.bullishCross) {
    bullishScore += 4;
    reasons.push('MACD Bullish Crossover');
  } else if (macd.bearishCross) {
    bearishScore += 4;
    reasons.push('MACD Bearish Crossover');
  } else if (macd.macd > macd.signal) {
    bullishScore += 2;
    reasons.push('MACD Above Signal');
  } else {
    bearishScore += 2;
    reasons.push('MACD Below Signal');
  }

  // H4 confirmation
  if (h4 && h4.length > 20) {
    const h4Closes = h4.map(c => c.close);
    const h4EMA50 = calculateEMA(h4Closes, Math.min(50, h4Closes.length - 1));
    if (h4EMA50 !== null) {
      if (currentPrice > h4EMA50) {
        bullishScore += 2;
        reasons.push('H4 EMA50 Bullish');
      } else {
        bearishScore += 2;
        reasons.push('H4 EMA50 Bearish');
      }
    }
  }

  const totalScore = bullishScore + bearishScore;
  if (totalScore === 0) return null;
  if (bullishScore === bearishScore) {
    // Break tie using momentum
    const recent5 = m15.slice(-5);
    if (recent5[recent5.length - 1].close > recent5[0].close) bullishScore++;
    else bearishScore++;
  }

  const isBullish = bullishScore > bearishScore;
  const confidence = Math.min(91, 55 + Math.abs(bullishScore - bearishScore) * 4 + (macd.bullishCross || macd.bearishCross ? 8 : 0));

  let entry = currentPrice;
  let stopLoss, tp1, tp2, tp3;

  if (isBullish) {
    stopLoss = Math.min(currentPrice - atr * 1.5, ema50_h1 - atr * 0.5);
    tp1 = entry + atr * 1.5;
    tp2 = entry + atr * 3.0;
    tp3 = entry + atr * 5.0;
  } else {
    stopLoss = Math.max(currentPrice + atr * 1.5, ema50_h1 + atr * 0.5);
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
    strategy: 3,
    strategyName: 'EMA + RSI + MACD',
    reasons: reasons.slice(0, 5),
  };
}

module.exports = { analyzeEMAIndicators };
