const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db, admin } = require('../firebase');

router.get('/GetUserRoles', authenticate, async (req, res) => {
    try {

        let query = db.collection('roles');

        const snapshot = await query.get();
        let roles = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            roles.push({
                roleId: data.roleId,
                roleName: data.roleName
            });
        });

        // Sort in memory by createdAt (descending) to maintain some order
        roles.sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return b.createdAt.toDate() - a.createdAt.toDate();
        });
        res.status(200).json({ data:roles });

    } catch (error) {
        console.error('Get user list error:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

module.exports = router;