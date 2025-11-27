const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../firebase');

// GET /me - user details by token
router.get('/GetLoginUserDetails', authenticate, async (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    roleId: u.roleId,
    isActive: u.isActive,
    isPasswordSet: u.isPasswordSet
    //createdAt: u.createdAt || null,
    // add any other public fields
  });
});

// POST /users/ChangePassword - Change own password (alternative endpoint)
router.post('/ChangePassword', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword , userId } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Both currentPassword and newPassword are required' 
      });
    }

    // Password strength validation
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'New password must be at least 6 characters long' 
      });
    }

    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    const userData = userDoc.data();

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userData.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        error: 'Current password is incorrect' 
      });
    }

    // Check if new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, userData.passwordHash);
    if (isSamePassword) {
      return res.status(400).json({ 
        error: 'New password must be different from current password' 
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.collection('users').doc(userId).update({
      passwordHash: newPasswordHash,
      isPasswordSet: false,
      updatedAt: new Date(),
      passwordChangedAt: new Date()
    });

    res.status(200).json({
      message: 'Password changed successfully',
      passwordChangedAt: new Date()
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// POST /users - create a new user
router.post('/CreateUser', authenticate, async (req, res) => {
  try {
    const { name, roleId, email } = req.body;

    // Validation
    if (!name || !roleId || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, roleId, email' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // Check if user with this email already exists
    const existingUserQuery = await db.collection('users')
      .where('email', '==', email)
      .get();

    if (!existingUserQuery.empty) {
      return res.status(409).json({ 
        error: 'User with this email already exists' 
      });
    }

    let password = 'CRM@1234';
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user data
    const userData = {
      name: name.trim(),
      roleId: roleId,
      email: email.toLowerCase().trim(),
      passwordHash,
      isActive: true,
      isPasswordSet: true,
      createdAt: new Date(),
      createdBy: req.user.id
    };

    // Save to Firestore
    const userRef = await db.collection('users').add(userData);

    // Return created user (without password hash)
    res.status(201).json({
      id: userRef.id,
      name: userData.name,
      roleId: userData.roleId,
      email: userData.email,
      isActive: userData.isActive,
      tempPassword: password,
      isPasswordSet: userData.isPasswordSet,
      createdAt: userData.createdAt,
      createdBy: userData.createdBy
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// GET /users - Get user list with pagination and filtering
router.get('/GetUserList', authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      email, 
      name, 
      role, 
      isActive 
    } = req.query;
    
    const offset = (page - 1) * limit;

    let query = db.collection('users');

    // Apply single filter at a time to avoid composite index requirements
    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    } else if (role) {
      query = query.where('role', '==', role);
    } else if (email) {
      query = query.where('email', '>=', email.toLowerCase())
                   .where('email', '<=', email.toLowerCase() + '\uf8ff');
    }

    // Add pagination without ordering to avoid index issues
    query = query.limit(parseInt(limit)).offset(offset);

    const snapshot = await query.get();
    let users = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      users.push({
        id: doc.id,
        email: data.email,
        name: data.name,
        role: data.role,
        roleId: data.roleId,
        isActive: data.isActive,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
        // Note: passwordHash is excluded for security
      });
    });

    // Sort in memory by createdAt (descending) to maintain some order
    users.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.toDate() - a.createdAt.toDate();
    });

    // Get total count for pagination (approximate)
    const totalSnapshot = await db.collection('users').get();
    const totalCount = totalSnapshot.size;

    res.status(200).json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
      filters: {
        email: email || null,
        name: name || null,
        role: role || null,
        isActive: isActive || null
      }
    });

  } catch (error) {
    console.error('Get user list error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// POST /users/:userId/DisableUser - Disable/Enable user
router.post('/DisableUser', authenticate, async (req, res) => {
  try {
    const { userId,isActive } = req.body;

    // Validation
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ 
        error: 'isActive field is required and must be boolean (true/false)' 
      });
    }

    // Check if user exists
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    const userData = userDoc.data();

    // Prevent disabling self
    if (userId === req.user.id && !isActive) {
      return res.status(400).json({ 
        error: 'Cannot disable your own account' 
      });
    }

    // Update user status
    await db.collection('users').doc(userId).update({
      isActive,
      updatedAt: new Date(),
      updatedBy: req.user.id
    });

    res.status(200).json({
      message: `User ${isActive ? 'enabled' : 'disabled'} successfully`,
      userId,
      isActive,
      email: userData.email,
      name: userData.name
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// POST /users/ResetPassword - Update user password (Admin function)
router.post('/ResetPassword', authenticate, async (req, res) => {
  try {
    const { userId } = req.body;

    // Check if user exists
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    const userData = userDoc.data();

    // Check if new password is different from current (optional check)
    // const isSamePassword = await bcrypt.compare(newPassword, userData.passwordHash);
    // if (isSamePassword) {
    //   return res.status(400).json({ 
    //     error: 'New password must be different from current password' 
    //   });
    // }

    const newPassword = 'CRM@1234';


    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.collection('users').doc(userId).update({
      passwordHash: newPasswordHash,
      isPasswordSet: true,
      updatedAt: new Date(),
      updatedBy: req.user.id,
      passwordChangedAt: new Date()
    });

    res.status(200).json({
      message: 'Password reset successfully',
      userId,
      email: userData.email,
      name: userData.name,
      tempPassword: newPassword,
      passwordChangedAt: new Date()
    });

  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});



module.exports = router;