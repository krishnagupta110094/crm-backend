```markdown
# CRM (Firestore)

This is a minimal CRM backend for EdTech using Google Firestore.

Features
- Login with email & password -> returns JWT token
- GET user details by token (/me)
- GET dashboard data for StudentMaster not enrolled
- When a student is viewed, the system records who viewed it
- Change student status `called_today` (records who and when)

Prerequisites
- Node.js 18+
- A Firebase project with Firestore enabled
- A service account JSON for the Firebase project (download from Firebase Console -> Project Settings -> Service accounts)

Quick setup
1. Copy .env.example to .env and set values:
   - FIREBASE_SERVICE_ACCOUNT=./path/to/service-account.json
   - JWT_SECRET=change_this_to_a_strong_secret
   - Optionally set FIREBASE_PROJECT_ID if needed.

2. Install:
   npm install

3. Seed demo data (creates a demo user and students):
   npm run seed
   This prints the created demo user id and credentials:
     email: admin@example.com
     password: password123

4. Start:
   npm start
   or for development:
   npm run dev
