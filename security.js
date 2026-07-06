const cors = require('cors');
const rateLimit = require('express-rate-limit');

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const parseAllowedOrigins = () => {
  const fromEnv = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv]);
};

const buildCorsMiddleware = () => {
  const allowed = parseAllowedOrigins();
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.has(origin)) return callback(null, true);
      try {
        const parsed = new URL(origin);
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
          return callback(null, true);
        }
        // Covers both the production site and Netlify's deploy-preview/branch subdomains.
        if (parsed.hostname.endsWith('.netlify.app')) {
          return callback(null, true);
        }
      } catch {
        // fall through
      }
      return callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });
};

const corsErrorHandler = (err, req, res, next) => {
  if (err && typeof err.message === 'string' && err.message.startsWith('CORS:')) {
    return res.status(403).json({ message: 'Origin not allowed' });
  }
  return next(err);
};

const securityHeaders = (req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'DENY');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.path && req.path.startsWith('/api/')) {
    res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }
  next();
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

const buildLoginLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const username = String(req.body?.username || '').trim().toLowerCase();
    return `${ip}|${username}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      message: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות.',
    });
  },
});

module.exports = {
  buildCorsMiddleware,
  corsErrorHandler,
  securityHeaders,
  buildLoginLimiter,
  getClientIp,
  DEFAULT_ALLOWED_ORIGINS,
};
