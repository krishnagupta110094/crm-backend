const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const { admin, db } = require('../firebase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Helper to normalize header keys
function normalizeKey(k) {
  return String(k || '').trim().toLowerCase();
}

// Convert "true"/"1"/1 to boolean
function toBoolean(v) {
  if (typeof v === 'boolean') return v;
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

// POST /dashboard/students/import
router.post('/students/import', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing file field "file" (multipart/form-data)' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'No sheets found in Excel file' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' }); // array of objects, header-driven
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(400).json({ error: 'No rows found in sheet' });
    }

    const result = {
      totalRows: rawRows.length,
      processed: 0,
      skipped: 0,
      errors: []
    };

    // Iterate and prepare batched writes (use email-based doc id for idempotency)
    let batch = db.batch();
    let opsInBatch = 0;
    const MAX_BATCH = 500;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      // Normalize keys to allow flexible column names
      const normalized = {};
      for (const k of Object.keys(row)) {
        normalized[normalizeKey(k)] = row[k];
      }

      const emailRaw = normalized['email'] || normalized['e-mail'] || normalized['email address'] || '';
      const email = String(emailRaw || '').trim().toLowerCase();

      if (!email) {
        result.skipped++;
        result.errors.push({ row: i + 2, // +2: assuming row 1 is header and sheet_to_json maps starting at row 2
          reason: 'Missing required email column' });
        continue;
      }

      // Build student doc
      const docId = encodeURIComponent(email); // safe id
      const docRef = db.collection('students').doc(docId);

      const firstName = normalized['firstname'] || normalized['first name'] || normalized['name'] || '';
      const lastName = normalized['lastname'] || normalized['last name'] || '';
      const enrolled = toBoolean(normalized['enrolled'] || normalized['is enrolled']);
      const phone = normalized['phone'] || normalized['mobile'] || '';
      const notes = normalized['notes'] || normalized['note'] || '';

      const studentData = {
        email,
        firstName: String(firstName || '').trim(),
        lastName: String(lastName || '').trim(),
        enrolled: !!enrolled,
        phone: phone ? String(phone).trim() : '',
        notes: notes ? String(notes).trim() : '',
        updatedAt: admin.firestore.Timestamp.now()
      };

      // If record is newly created we may want createdAt; set via merge so we don't overwrite createdAt on updates
      // Use set with merge so upload is idempotent and will update fields from the sheet
      batch.set(docRef, {
        ...studentData,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      opsInBatch++;
      result.processed++;

      if (opsInBatch >= MAX_BATCH) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
    }

    res.json({
      message: 'Import completed',
      summary: result
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Internal server error', details: String(err.message) });
  }
});

module.exports = router;