const jwt = require('jsonwebtoken');

const authguard = (req, res, next) => {
  console.log('authguard triggered - authguard.js:4');
  
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'Authorization required' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authorization required' });

  console.log('Token to verify: - authguard.js:12', token.substring(0, 20) + '...');
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.error('Token verification failed:', {
        error: err.message,
        tokenExpired: err.name === 'TokenExpiredError',
        tokenStart: token.substring(0, 20) + '...',
        currentTime: new Date().toISOString()
      });
      return res.status(403).json({ message: 'Invalid or expired token' });
    }

    console.log('Decoded token: - authguard.js:16', decoded);
    req.user = { userId: decoded.userId || decoded.id };
    console.log('Set req.user: - authguard.js:18', req.user);
    next();
  });
};

module.exports = authguard;
