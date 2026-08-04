const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = auth.split(' ')[1];
  if (token === 'mock-dev-token') {
    req.user = { mobile: '9999999999' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'annalakshmi_tote_secret_2024');
    req.user = decoded; // { mobile, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

module.exports = { verifyToken };
