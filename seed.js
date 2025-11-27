require('dotenv').config();
const bcrypt = require('bcrypt');
const { db } = require('./firebase');

async function seed() {
  try {
    // create a demo user
    const password = '123456';
    const passwordHash = await bcrypt.hash(password, 10);

    const userData = {
      email: 'admin@example.com',
      passwordHash,
      name: 'Admin User',
      createdAt: new Date()
    };

    const userRef = await db.collection('users').add(userData);
    console.log('Created demo user:');
    console.log('  id:', userRef.id);
    console.log('  email: admin@example.com');
    console.log('  password:', password);

    // // create students
    // const students = [
    //   { firstName: 'Alice', lastName: 'Anderson', email: 'alice@example.com', enrolled: false, createdAt: new Date() },
    //   { firstName: 'Bob', lastName: 'Brown', email: 'bob@example.com', enrolled: false, createdAt: new Date() },
    //   { firstName: 'Cara', lastName: 'Clark', email: 'cara@example.com', enrolled: true, createdAt: new Date() },
    //   { firstName: 'Daniel', lastName: 'Dawson', email: 'daniel@example.com', enrolled: false, createdAt: new Date() }
    // ];

    // for (const s of students) {
    //   const r = await db.collection('students').add(s);
    //   console.log(' Created student', s.firstName, 'id=', r.id);
    // }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();