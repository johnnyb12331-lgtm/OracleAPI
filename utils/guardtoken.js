const jwt = require("jsonwebtoken");

const parseLifetimeToDays = (str) => {
  if (!str) return 1; // default 1 day if undefined
  if (str.endsWith("d")) {
    return parseInt(str.replace("d", ""));
  } else if (str.endsWith("m")) {
    return parseInt(str.replace("m", "")) / (60 * 24); // minute => day
  }
  return 1; // default 1 day
};


function parseDurationToMs(duration) {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

const REFRESH_TOKEN_LIFETIME_DAYS = parseLifetimeToDays(process.env.REFRESH_TOKEN_LIFETIME);

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_LIFETIME,
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_LIFETIME,
  });
};

module.exports = {
  generateAccessToken,
    generateRefreshToken,
    REFRESH_TOKEN_LIFETIME_DAYS,
    parseDurationToMs
};