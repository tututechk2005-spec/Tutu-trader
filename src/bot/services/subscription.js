const { subscriptionOps, paymentOps, settingsOps } = require('../../utils/database');
const moment = require('moment');

const PLANS = {
  '1week': { label: '1 Week', days: 7, key: 'price_1week' },
  '1month': { label: '1 Month', days: 30, key: 'price_1month' },
  '3months': { label: '3 Months', days: 90, key: 'price_3months' },
  lifetime: { label: 'Lifetime', days: null, key: 'price_lifetime' },
};

function getPlanPrice(planKey) {
  const plan = PLANS[planKey];
  if (!plan) return null;
  return parseFloat(settingsOps.get(plan.key) || '0');
}

function getPlanExpiry(planKey) {
  const plan = PLANS[planKey];
  if (!plan) return null;
  if (plan.days === null) return null; // Lifetime
  return moment().add(plan.days, 'days').toISOString();
}

function isSubscribed(telegramId) {
  subscriptionOps.expireOld();
  return subscriptionOps.isActive(telegramId);
}

function getSubscriptionInfo(telegramId) {
  subscriptionOps.expireOld();
  const sub = subscriptionOps.getActive(telegramId);
  if (!sub) return null;
  return {
    ...sub,
    expiresIn: sub.expires_at ? moment(sub.expires_at).fromNow() : 'Never',
    expiresFormatted: sub.expires_at ? moment(sub.expires_at).format('DD MMM YYYY HH:mm') : 'Lifetime',
  };
}

function activateSubscription(telegramId, planKey, paymentId = null) {
  const expiry = getPlanExpiry(planKey);
  return subscriptionOps.create(telegramId, planKey, expiry, paymentId);
}

function createPaymentRequest(telegramId, planKey) {
  const price = getPlanPrice(planKey);
  if (price === null) return null;
  return paymentOps.create(telegramId, planKey, price);
}

function formatPlansMessage() {
  const lines = ['💳 *Choose Your Subscription Plan*\n'];
  for (const [key, plan] of Object.entries(PLANS)) {
    const price = getPlanPrice(key);
    const emoji = key === 'lifetime' ? '♾️' : key === '3months' ? '🏆' : key === '1month' ? '⭐' : '🔑';
    lines.push(`${emoji} *${plan.label}* — $${price?.toFixed(2) || '?'}`);
  }
  lines.push('\nSelect a plan below to request access:');
  return lines.join('\n');
}

module.exports = {
  PLANS,
  getPlanPrice,
  getPlanExpiry,
  isSubscribed,
  getSubscriptionInfo,
  activateSubscription,
  createPaymentRequest,
  formatPlansMessage,
};
