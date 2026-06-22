const axios = require('axios');

const BASE_URL = 'https://api.twelvedata.com';

const PAIR_MAP = {
  XAUUSD: { symbol: 'XAU/USD', type: 'physical_currency' },
  EURUSD: { symbol: 'EUR/USD', type: 'forex' },
  GBPUSD: { symbol: 'GBP/USD', type: 'forex' },
  USDJPY: { symbol: 'USD/JPY', type: 'forex' },
  AUDUSD: { symbol: 'AUD/USD', type: 'forex' },
  NZDUSD: { symbol: 'NZD/USD', type: 'forex' },
  USDCAD: { symbol: 'USD/CAD', type: 'forex' },
  USDCHF: { symbol: 'USD/CHF', type: 'forex' },
  EURGBP: { symbol: 'EUR/GBP', type: 'forex' },
};

const TF_MAP = {
  M15: '15min',
  M30: '30min',
  H1: '1h',
  H4: '4h',
};

async function fetchCandles(pair, timeframe, outputSize = 100) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not set');

  const symbol = PAIR_MAP[pair]?.symbol || pair.replace(/([A-Z]{3})([A-Z]{3})/, '$1/$2');
  const interval = TF_MAP[timeframe] || timeframe;

  try {
    const response = await axios.get(`${BASE_URL}/time_series`, {
      params: {
        symbol,
        interval,
        outputsize: outputSize,
        apikey: apiKey,
        format: 'JSON',
      },
      timeout: 15000,
    });

    if (response.data.status === 'error') {
      throw new Error(response.data.message || 'API error');
    }

    const values = response.data.values;
    if (!values || values.length === 0) {
      throw new Error('No data returned');
    }

    // Return in chronological order (oldest first)
    return values.reverse().map(v => ({
      datetime: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || 0),
    }));
  } catch (err) {
    if (err.response?.status === 429) {
      throw new Error('API rate limit reached. Please wait before retrying.');
    }
    throw err;
  }
}

async function fetchPrice(pair) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not set');

  const symbol = PAIR_MAP[pair]?.symbol || pair.replace(/([A-Z]{3})([A-Z]{3})/, '$1/$2');

  const response = await axios.get(`${BASE_URL}/price`, {
    params: { symbol, apikey: apiKey },
    timeout: 10000,
  });

  if (response.data.status === 'error') {
    throw new Error(response.data.message || 'API error');
  }

  return parseFloat(response.data.price);
}

async function fetchMultipleTimeframes(pair) {
  const timeframes = ['M15', 'M30', 'H1', 'H4'];
  const results = {};

  for (const tf of timeframes) {
    try {
      results[tf] = await fetchCandles(pair, tf, 150);
      await new Promise(r => setTimeout(r, 300)); // Respect rate limits
    } catch (err) {
      console.error(`Failed to fetch ${pair} ${tf}:`, err.message);
      results[tf] = null;
    }
  }

  return results;
}

module.exports = { fetchCandles, fetchPrice, fetchMultipleTimeframes, PAIR_MAP };
