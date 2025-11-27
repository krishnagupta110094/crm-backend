const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { db } = require('../firebase');
const bgSrc = 'http://localhost:3000/images/certificate-bg.png';
const logoSrc = 'http://localhost:3000/images/logo.png';

// POST /certificates/generate - Generate course completion certificate
router.post('/GenerateCertificate', authenticate, async (req, res) => {
  try {
    const { email, name, courseName, fromDate, toDate } = req.body;

    // Validation
    if (!email || !name || !courseName || !fromDate || !toDate) {
      return res.status(400).json({ 
        error: 'Missing required fields: email, name, courseName, fromDate, toDate' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // Validate dates
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date format. Use YYYY-MM-DD format' 
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({ 
        error: 'From date must be before to date' 
      });
    }

    // Calculate duration
    const durationMs = endDate - startDate;
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
    const durationWeeks = Math.ceil(durationDays / 7);

    // Format dates for display
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    };

    const formattedFromDate = formatDate(startDate);
    const formattedToDate = formatDate(endDate);
    const issueDate = formatDate(new Date());

    // Create certificate record in Firestore
    const certificateData = {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      courseName: courseName.trim(),
      fromDate: startDate,
      toDate: endDate,
      formattedFromDate,
      formattedToDate,
      duration: `${durationWeeks} weeks`,
      durationWeeks,
      durationDays,
      issueDate: new Date(),
      issuedBy: req.user.id,
      createdAt: new Date(),
      status: 'active'
    };

    // Save to Firestore and get the document ID as certificate ID
    const certificateRef = await db.collection('certificates').add(certificateData);
    const certificateId = 'CERT-' + certificateRef.id.toUpperCase();

    // Update the document with the formatted certificate ID
    await certificateRef.update({ certificateId });

    // Generate HTML certificate
    const certificateHTML = generateCertificateHTML({
      email,
      name: name.trim(),
      courseName: courseName.trim(),
      fromDate: formattedFromDate,
      toDate: formattedToDate,
      duration: `${durationWeeks} weeks`,
      certificateId,
      issueDate
    });

    // Set response headers for HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${certificateId}.html"`);
    
    res.status(200).send(certificateHTML);

  } catch (error) {
    console.error('Certificate generation error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// GET /certificates/:certificateId - Retrieve certificate by ID
router.get('/GetCertificate/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;

    // Validate certificate ID format
    if (!certificateId || !certificateId.startsWith('CERT-')) {
      return res.status(400).json({ 
        error: 'Invalid certificate ID format' 
      });
    }

    // Query Firestore for the certificate
    const certificateDoc = await db.collection('certificates');
    const certificateDoc1 = await certificateDoc.where('certificateId', '==', certificateId).limit(1).get() ;

    if (certificateDoc1.empty) {
      return res.status(404).json({ 
        error: 'Certificate not found' 
      });
    }

    const certificateData = certificateDoc1.docs[0].data();

    // Generate and return the HTML certificate
    const certificateHTML = generateCertificateHTML({
      email: certificateData.email,
      name: certificateData.name,
      courseName: certificateData.courseName,
      fromDate: certificateData.formattedFromDate,
      toDate: certificateData.formattedToDate,
      duration: certificateData.duration,
      certificateId: certificateData.certificateId,
      issueDate: certificateData.issueDate.toDate().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    });

    // Set response headers for HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${certificateId}.html"`);
    
    res.status(200).send(certificateHTML);

  } catch (error) {
    console.error('Certificate retrieval error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// GET /certificates - List all certificates (with pagination)
router.get('/GetCertificateList', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10, email, courseName } = req.query;
    const offset = (page - 1) * limit;

    let query = db.collection('certificates');

    // Apply filters if provided
    if (email) {
      query = query.where('email', '==', email.toLowerCase());
    }
    if (courseName) {
      query = query.where('courseName', '==', courseName);
    }

    // Add ordering and pagination
    query = query.orderBy('createdAt', 'desc').limit(parseInt(limit)).offset(offset);

    const snapshot = await query.get();
    const certificates = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      certificates.push({
        id: doc.id,
        certificateId: data.certificateId,
        email: data.email,
        name: data.name,
        courseName: data.courseName,
        duration: data.duration,
        issueDate: data.issueDate,
        status: data.status
      });
    });

    res.status(200).json({
      certificates,
      page: parseInt(page),
      limit: parseInt(limit),
      total: certificates.length
    });

  } catch (error) {
    console.error('Certificate listing error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

// Function to generate certificate HTML
function generateCertificateHTML(data) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate of Course Completion</title>
  <style>
    body {
      margin: 0;
      font-family: 'Poppins', sans-serif;
      background-color: #001f3f;
    }
    .certificate {
      width: 900px;
      height: 650px;
      margin: 40px auto;
      position: relative;
      background: url('${bgSrc}') no-repeat center center;
      background-size: cover;
      color: white;
      padding: 40px;
      box-sizing: border-box;
    }
    .logo-section {
      display: flex;
      align-items: center;
      position: absolute;
      top: 30px;
      left: 30px;
    }
    .logo-section img {
      height: 60px;
    }
    .logo-section span {
      font-size: 28px;
      font-weight: bold;
      color: #00e0ff;
      margin-left: 5px;
    }
    .cert-box {
      position: absolute;
      top: 30px;
      right: 30px;
      padding: 12px 20px;
      border: 2px solid #ffffff;
      border-radius: 12px;
      font-weight: bold;
      color: white;
      font-size: 18px;
      text-align: center;
    }
    h1 {
      text-align: center;
      font-size: 36px;
      margin-top: 100px;
      color: #00e0ff;
    }
    .presented {
      text-align: center;
      font-size: 20px;
      margin-top: 20px;
      letter-spacing: 1px;
    }
    .name {
      text-align: center;
      font-size: 32px;
      font-style: italic;
      margin-top: 10px;
      color: #00e0ff;
    }
    .description {
      text-align: center;
      font-size: 16px;
      line-height: 1.6;
      margin: 20px 40px;
      color: #cce7f0;
    }
    .course-name {
      font-size: 20px;
      font-weight: bold;
      margin-top: 10px;
      color: #00e0ff;
    }
    .duration-info {
      background: rgba(0,0,0,0.2);
      padding: 12px 20px;
      border-radius: 10px;
      margin: 20px auto;
      width: fit-content;
      color: #cce7f0;
      text-align: center;
      font-size: 14px;
    }
    .footer {
      position: absolute;
      bottom: 30px;
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 0 40px;
      box-sizing: border-box;
    }
    .footer .side {
      width: 30%;
      text-align: center;
    }
    .certificate-info {
      text-align: center;
      font-size: 14px;
      color: #cce7f0;
      line-height: 1.4;
    }
    .signature-line {
      border-top: 2px solid #cce7f0;
      margin: 10px auto;
      width: 150px;
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="logo-section">
      <img src="${logoSrc}" alt="NammaWeb Logo"/>
      <span>NammaWeb</span>
    </div>
    <h1>CERTIFICATE OF COURSE COMPLETION</h1>

    <div class="presented">PRESENTED TO</div>
    <div class="name">${data.name}</div>

    <div class="description">
      has successfully completed the comprehensive course program on
      <div class="course-name">${data.courseName}</div>
      During this program, the student has demonstrated exceptional dedication,
      skill development, and has been found to be a keen and enthusiastic candidate.
    </div>

    <div class="duration-info">
      Course Duration: ${data.duration} <br>
      From: ${data.fromDate} To: ${data.toDate}
    </div>

    <div class="footer">
      <div class="side">
        <div>Founder & CEO</div>
        <div class="signature-line"></div>
        <div>MALLIKARJUN S NANDYAL</div>
      </div>

      <div class="certificate-info">
        <div>Certificate ID: ${data.certificateId}</div>
        <div>Issue Date: ${data.issueDate}</div>
      </div>

      <div class="side">
        <div>Managing Director</div>
        <div class="signature-line"></div>
        <div>P. DAKSHAYANI</div>
      </div>
    </div>
  </div>
</body>
</html>`
};
module.exports = router;