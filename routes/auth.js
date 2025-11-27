const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../firebase');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ responseCode: 400, message: 'email and password required' });

    const usersRef = db.collection('users');
    const q = await usersRef.where('email', '==', email).where('isActive', '==', true).limit(1).get();
    if (q.empty) return res.status(401).json({ responseCode: 401, message: 'Invalid Login ID/Credentials' });

    const doc = q.docs[0];
    const user = doc.data();

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ responseCode:400, message: 'Invalid Password/Email' });

    const token = jwt.sign({ id: doc.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ responseCode: 200, message: 'Login successful', auth_key:token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ responseCode: 500, message: 'Internal server error' });
  }
});

module.exports = router;