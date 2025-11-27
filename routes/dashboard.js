const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db, admin } = require('../firebase');

// GET /dashboard/students?enrolled=false  - default returns not enrolled
router.get('/students', authenticate, async (req, res) => {
  try {
    const enrolledQuery = req.query.enrolled;
    let q = db.collection('students');

    if (typeof enrolledQuery !== 'undefined') {
      // treat 'false' or '0' as false
      const enrolledBool = !(enrolledQuery === 'false' || enrolledQuery === '0' || enrolledQuery === '0');
      // but user might pass 'false' explicitly, so:
      if (enrolledQuery === 'false' || enrolledQuery === '0') {
        q = q.where('enrolled', '==', false);
      } else if (enrolledQuery === 'true' || enrolledQuery === '1') {
        q = q.where('enrolled', '==', true);
      }
    } else {
      // default: not enrolled
      q = q.where('enrolled', '==', false);
    }

    const snap = await q.orderBy('createdAt', 'desc').get();
    const students = [];
    for (const doc of snap.docs) {
      const s = doc.data();
      s.id = doc.id;

      // fetch views for this student
      const viewsSnap = await db.collection('views').where('studentId', '==', doc.id).orderBy('viewed_at', 'desc').get();
      const viewers = [];
      for (const vdoc of viewsSnap.docs) {
        const v = vdoc.data();
        // attempt to fetch user basic info
        let userInfo = null;
        if (v.userId) {
          const udoc = await db.collection('users').doc(v.userId).get();
          if (udoc.exists) {
            const ud = udoc.data();
            userInfo = { id: udoc.id, email: ud.email, name: ud.name };
          }
        }
        viewers.push({
          viewed_at: v.viewed_at ? v.viewed_at.toDate?.() || v.viewed_at : null,
          user: userInfo || { id: v.userId }
        });
      }

      students.push({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        enrolled: s.enrolled || false,
        called_today: s.called_today || false,
        last_called_at: s.last_called_at ? s.last_called_at.toDate?.() || s.last_called_at : null,
        called_by_user_id: s.called_by_user_id || null,
        viewers
      });
    }

    res.json(students);
  } catch (err) {
    console.error('GET students error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /dashboard/students/:id - view a student (and record who viewed)
router.get('/students/:id', authenticate, async (req, res) => {
  try {
    const studentId = req.params.id;
    const sdoc = await db.collection('students').doc(studentId).get();
    if (!sdoc.exists) return res.status(404).json({ error: 'Student not found' });
    const student = sdoc.data();
    student.id = sdoc.id;

    // Record view
    const view = {
      userId: req.user.id,
      studentId: studentId,
      viewed_at: admin.firestore.Timestamp.now()
    };
    await db.collection('views').add(view);

    // Return student info + viewers
    const viewsSnap = await db.collection('views').where('studentId', '==', studentId).orderBy('viewed_at', 'desc').get();
    const viewers = [];
    for (const vdoc of viewsSnap.docs) {
      const v = vdoc.data();
      let userInfo = null;
      if (v.userId) {
        const udoc = await db.collection('users').doc(v.userId).get();
        if (udoc.exists) {
          const ud = udoc.data();
          userInfo = { id: udoc.id, email: ud.email, name: ud.name };
        }
      }
      viewers.push({
        viewed_at: v.viewed_at ? v.viewed_at.toDate?.() || v.viewed_at : null,
        user: userInfo || { id: v.userId }
      });
    }

    res.json({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      enrolled: student.enrolled || false,
      called_today: student.called_today || false,
      last_called_at: student.last_called_at ? student.last_called_at.toDate?.() || student.last_called_at : null,
      called_by_user_id: student.called_by_user_id || null,
      viewers
    });
  } catch (err) {
    console.error('View student error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /dashboard/students/:id/status  - change status called_today
router.patch('/students/:id/status', authenticate, async (req, res) => {
  try {
    const studentId = req.params.id;
    const { called_today } = req.body;
    if (typeof called_today === 'undefined') {
      return res.status(400).json({ error: 'called_today boolean is required in body' });
    }

    const studentRef = db.collection('students').doc(studentId);
    const sdoc = await studentRef.get();
    if (!sdoc.exists) return res.status(404).json({ error: 'Student not found' });

    if (called_today) {
      await studentRef.update({
        called_today: true,
        last_called_at: admin.firestore.Timestamp.now(),
        called_by_user_id: req.user.id
      });
    } else {
      await studentRef.update({
        called_today: false,
        last_called_at: null,
        called_by_user_id: null
      });
    }

    const updated = (await studentRef.get()).data();
    res.json({
      id: studentId,
      called_today: updated.called_today || false,
      last_called_at: updated.last_called_at ? updated.last_called_at.toDate?.() || updated.last_called_at : null,
      called_by_user_id: updated.called_by_user_id || null
    });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;