require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const connectDB = require('./utils/db');

// Routes
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const signatureRoutes = require('./routes/signatures');
const auditRoutes = require('./routes/audit');
const publicRoutes = require('./routes/public');
const aiRoutes = require('./routes/ai');

const app = express();

const allowedOrigins = [
  ...(process.env.CLIENT_URLS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  process.env.CLIENT_URL,
  'http://localhost:5173',
].filter(Boolean);

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/docs', documentRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 SignatureFlow server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error('Stop the existing process on this port or run with a different PORT value.');
    process.exit(1);
  }

  throw err;
});
