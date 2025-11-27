const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

// if (!serviceAccountPath) {
//   console.error('FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS must be set in env');
//   process.exit(1);
// }

// let serviceAccount;
// try {
//   const absolutePath = path.isAbsolute(serviceAccountPath)
//     ? serviceAccountPath
//     : path.join(process.cwd(), serviceAccountPath);
//   serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
// } catch (err) {
//   console.error('Failed to read service account JSON:', err.message);
//   process.exit(1);
// }

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
});

const db = admin.firestore();

module.exports = {
  admin,
  db,
};
