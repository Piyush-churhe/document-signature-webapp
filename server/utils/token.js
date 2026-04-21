const crypto = require('crypto');

const generateSigningToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const getTokenExpiry = (hours = 72) => {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hours);
  return expiry;
};

module.exports = { generateSigningToken, getTokenExpiry };
