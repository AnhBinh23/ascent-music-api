const attempts = new Map();

const WINDOW_MS    = 15 * 60 * 1000;
const MAX_LOGIN    = 10;
const MAX_REGISTER = 5;
const MAX_TRIAL    = 10;

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of attempts) {
    if (now - data.start > WINDOW_MS) attempts.delete(key);
  }
}, 30 * 60 * 1000);

function createLimiter(maxAttempts, windowMs = WINDOW_MS) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.originalUrl}`;
    const now = Date.now();
    const record = attempts.get(key);

    if (!record || now - record.start > windowMs) {
      attempts.set(key, { count: 1, start: now });
      return next();
    }

    record.count++;
    if (record.count > maxAttempts) {
      const retryAfter = Math.ceil((windowMs - (now - record.start)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Quá nhiều yêu cầu. Vui lòng đợi ${Math.ceil(retryAfter / 60)} phút.`,
      });
    }

    next();
  };
}

module.exports = {
  loginLimiter:    createLimiter(MAX_LOGIN),
  registerLimiter: createLimiter(MAX_REGISTER),
  trialLimiter:    createLimiter(MAX_TRIAL),
};
