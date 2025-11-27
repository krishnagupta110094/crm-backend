const express = require("express");
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();
const jwt = require("jsonwebtoken");
const { authenticate } = require("../middleware/auth");
const { db, admin } = require('../firebase');


// ATS Resume HTML route (protected)
router.post("/Ats_resume", authenticate, async (req, res) => {
  const resume = req.body;
  if (!resume?.basicdetails?.email)
    return res.status(400).send("Invalid resume JSON");

  try {
    // Save or update resume data in Firebase first
    const email = resume.basicdetails.email.toLowerCase().trim();
    
    // Check if resume already exists for this email
    const existingResumeQuery = await db.collection('resumes')
      .where('basicdetails.email', '==', email)
      .get();

    let resumeDocId;
    const resumeData = {
      ...resume,
      updatedAt: new Date(),
      updatedBy: req.user.id,
      basicdetails: {
        ...resume.basicdetails,
        email: email
      }
    };

    if (!existingResumeQuery.empty) {
      // Update existing resume
      const existingDoc = existingResumeQuery.docs[0];
      resumeDocId = existingDoc.id;
      
      await db.collection('resumes').doc(resumeDocId).update(resumeData);
      console.log(`Updated existing resume for ${email}, ID: ${resumeDocId}`);
    } else {
      // Create new resume
      resumeData.createdAt = new Date();
      resumeData.createdBy = req.user.id;
      
      const newResumeRef = await db.collection('resumes').add(resumeData);
      resumeDocId = newResumeRef.id;
      console.log(`Created new resume for ${email}, ID: ${resumeDocId}`);
    }

    // Import GenAI service
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // HTML template for A4 size
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resume - {{NAME}}</title>
        <style>
            @page {
                size: A4;
                margin: 0.5in;
            }
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.4;
                color: #333;
                max-width: 210mm;
                margin: 0 auto;
                background: white;
            }
            .header {
                text-align: center;
                border-bottom: 2px solid #2c3e50;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .name {
                font-size: 28px;
                font-weight: bold;
                color: #2c3e50;
                margin-bottom: 5px;
            }
            .title {
                font-size: 16px;
                color: #7f8c8d;
                margin-bottom: 10px;
            }
            .contact-info {
                font-size: 12px;
                color: #555;
            }
            .section {
                margin-bottom: 20px;
            }
            .section-title {
                font-size: 16px;
                font-weight: bold;
                color: #2c3e50;
                border-bottom: 1px solid #bdc3c7;
                padding-bottom: 5px;
                margin-bottom: 10px;
            }
            .item {
                margin-bottom: 12px;
            }
            .item-header {
                font-weight: bold;
                font-size: 14px;
            }
            .item-subheader {
                font-style: italic;
                color: #7f8c8d;
                font-size: 12px;
            }
            .item-content {
                font-size: 12px;
                margin-top: 5px;
            }
            .skills-list {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .skill-item {
                background: #ecf0f1;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
            }
            @media print {
                body { margin: 0; }
                .section { page-break-inside: avoid; }
            }
        </style>
    </head>
    <body>
        <!-- Content will be generated here -->
    </body>
    </html>`;

    // Create prompt for GenAI
    const prompt = `Using this HTML template structure, generate a complete professional ATS-friendly resume in HTML format:

    ${htmlTemplate}

    Fill in the template with the following data:
    Name: ${resume.basicdetails.name}
    Title: ${resume.basicdetails.title}
    Phone: ${resume.basicdetails.phone}
    Email: ${resume.basicdetails.email}
    Website: ${resume.basicdetails.website}
    Address: ${resume.basicdetails.address}
    About: ${resume.about}
    
    Education: ${JSON.stringify(resume.education)}
    Skills: ${JSON.stringify(resume.skills)}
    Experience: ${JSON.stringify(resume.experience)}
    Projects: ${JSON.stringify(resume.projects)}
    Certifications: ${JSON.stringify(resume.certifications)}
    
    Requirements:
    - Generate ATS Friendly Resume by Using the provided HTML template structure and CSS styles
    - Generate ONLY complete HTML code, no markdown or explanations
    - Maintain the A4 formatting and professional styling
    - Use the existing CSS classes for consistent formatting`;

    const aiResult = await model.generateContent(prompt);
    const generatedHTML = aiResult.response.text();

    // Clean the response to ensure it's only HTML
    const cleanHTML = generatedHTML.replace(/```html|```/g, '').trim();

    // Update the resume document with the generated HTML
    await db.collection('resumes').doc(resumeDocId).update({
      generatedHTML: cleanHTML,
      htmlGeneratedAt: new Date(),
      htmlGeneratedBy: req.user.id
    });

    console.log(`Resume HTML generated and saved for ${email}`);

    res.setHeader('Content-Type', 'text/html');
    res.send(cleanHTML);
  } catch (err) {
    console.error("Error generating AI resume or updating Firestore:", err);
    res.status(500).send("Error generating resume HTML");
  }
});

module.exports = router;
