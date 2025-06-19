const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const reglementsRoutes = require('./routes/reglements');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/reglements', reglementsRoutes);

// Route de test
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Reglements is running!',
    timestamp: new Date().toISOString(),
    endpoints: {
      reglements: '/api/reglements'
    }
  });
});

// Middleware de gestion d'erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// Gestion des routes non trouvées
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});