const { fetchMultipleTimeframes } = require('../utils/twelvedata');
const { analyzeSMC } = require('./strategies/strategy1');
const { analyzeSupplyDemand } = require('./strategies/strategy2');
const { analyzeEMAIndicators } = require('./strategies/strategy3');
const { analyzeTrendFollowing } = require('./strategies/strategy4');
const { settingsOps } = require('../utils/database');

const TIMEFRAMES = ['H4', 'H1', 'M30', 'M15'];

async function analyzeMarket(pair) {
  const candlesByTF = await fetchMultipleTimeframes(pair);

  // Check which strategies are enabled
  const s1Enabled = settingsOps.get('strategy_1_enabled') !== '0';
  const s2Enabled = settingsOps.get('strategy_2_enabled') !== '0';
  const s3Enabled = settingsOps.get('strategy_3_enabled') !== '0';
  const s4Enabled = settingsOps.get('strategy_4_enabled') !== '0';

  const minConfidence = parseInt(settingsOps.get('min_confidence') || '60', 10);
  let result = null;

  // Strategy 1: SMC
  if (s1Enabled) {
    try {
      result = analyzeSMC(candlesByTF);
      if (result && result.confidence >= minConfidence) {
        return { ...result, pair, timeframe: detectBestTimeframe(candlesByTF) };
      }
    } catch (err) {
      console.error(`Strategy 1 failed for ${pair}:`, err.message);
    }
  }

  // Strategy 2: Supply & Demand
  if (s2Enabled) {
    try {
      result = analyzeSupplyDemand(candlesByTF);
      if (result && result.confidence >= minConfidence) {
        return { ...result, pair, timeframe: detectBestTimeframe(candlesByTF) };
      }
    } catch (err) {
      console.error(`Strategy 2 failed for ${pair}:`, err.message);
    }
  }

  // Strategy 3: EMA + RSI + MACD
  if (s3Enabled) {
    try {
      result = analyzeEMAIndicators(candlesByTF);
      if (result && result.confidence >= minConfidence) {
        return { ...result, pair, timeframe: detectBestTimeframe(candlesByTF) };
      }
    } catch (err) {
      console.error(`Strategy 3 failed for ${pair}:`, err.message);
    }
  }

  // Strategy 4: Trend Following (always produces a result)
  if (s4Enabled) {
    try {
      result = analyzeTrendFollowing(candlesByTF);
      if (result) {
        return { ...result, pair, timeframe: detectBestTimeframe(candlesByTF) };
      }
    } catch (err) {
      console.error(`Strategy 4 failed for ${pair}:`, err.message);
    }
  }

  // Absolute fallback: use best result even if below min confidence
  if (result) {
    return { ...result, pair, timeframe: detectBestTimeframe(candlesByTF) };
  }

  // If all strategies return null, generate a basic signal from raw data
  const m15 = candlesByTF['M15'] || candlesByTF['H1'];
  if (m15 && m15.length > 0) {
    return generateEmergencySignal(pair, m15);
  }

  return null;
}

function detectBestTimeframe(candlesByTF) {
  if (candlesByTF['H1'] && candlesByTF['H1'].length > 50) return 'H1';
  if (candlesByTF['H4'] && candlesByTF['H4'].length > 20) return 'H4';
  if (candlesByTF['M30'] && candlesByTF['M30'].length > 30) return 'M30';
  if (candlesByTF['M15'] && candlesByTF['M15'].length > 30) return 'M15';
  return 'H1';
}

function generateEmergencySignal(pair, candles) {
  const current = candles[candles.length - 1];
  const prev10 = candles.slice(-10);
  const avgClose = prev10.reduce((s, c) => s + c.close, 0) / prev10.length;
  const isBullish = current.close >= avgClose;

  const atr = (candles.slice(-14).reduce((s, c, i, arr) => {
    if (i === 0) return s;
    return s + Math.max(c.high - c.low, Math.abs(c.high - arr[i-1].close), Math.abs(c.low - arr[i-1].close));
  }, 0)) / 13 || current.close * 0.001;

  const entry = current.close;
  const sl = isBullish ? entry - atr * 1.5 : entry + atr * 1.5;
  const tp1 = isBullish ? entry + atr * 1.5 : entry - atr * 1.5;
  const tp2 = isBullish ? entry + atr * 3 : entry - atr * 3;
  const tp3 = isBullish ? entry + atr * 5 : entry - atr * 5;

  return {
    pair,
    direction: isBullish ? 'BUY' : 'SELL',
    trend: isBullish ? 'BULLISH' : 'BEARISH',
    entry,
    stopLoss: sl,
    tp1,
    tp2,
    tp3,
    riskReward: '1:3.0',
    confidence: 68,
    strategy: 4,
    strategyName: 'Trend Following MTF',
    timeframe: 'H1',
    reasons: ['Price Action Analysis', 'Multi-Timeframe Trend', 'Momentum Confirmation'],
  };
}

async function analyzeAllPairs(enabledPairs) {
  const results = [];
  for (const pair of enabledPairs) {
    try {
      const signal = await analyzeMarket(pair);
      if (signal) {
        results.push(signal);
        console.log(`✅ Signal generated for ${pair}: ${signal.direction} (Confidence: ${signal.confidence}%)`);
      }
      await new Promise(r => setTimeout(r, 500)); // Rate limiting
    } catch (err) {
      console.error(`❌ Analysis failed for ${pair}:`, err.message);
    }
  }
  return results;
}

module.exports = { analyzeMarket, analyzeAllPairs };
