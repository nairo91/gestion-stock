// src/script/testConnection.js
require('dotenv').config();
const { sequelize } = require('../config/database');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Authentification réussie : la DB est joignable !');
  } catch (err) {
    console.error('❌ Échec de la connexion :', err);
  } finally {
    process.exit(0);
  }
})();
