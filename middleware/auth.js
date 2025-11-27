const jwt = require('jsonwebtoken');
const { db } = require('../firebase');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

async function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = auth.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!payload || !payload.id) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  try {
    const userRef = db.collection('users').doc(payload.id);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(401).json({ error: 'User not found' });

    const user = snap.data();
    user.id = snap.id;
    // never attach passwordHash
    delete user.passwordHash;
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  authenticate
};