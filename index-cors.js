const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); 

// Initialize app
const app = express();

// Enable CORS for frontend
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const importRoutes = require('./routes/import');
const certificateRoutes = require('./routes/certificates');
const atsresumeRoutes = require('./routes/atsresume');
const masterRoutes = require('./routes/master');


app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use('/images', express.static(path.join(__dirname, 'images')));


app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/File', importRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/resume', atsresumeRoutes);
app.use('/api/master', masterRoutes);


// Default route
app.get('/', (req, res) => {
  res.send('Server is running');
});

// Error handling middleware 
app.use((err, req, res, next) => {
  console.error('Internal server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
