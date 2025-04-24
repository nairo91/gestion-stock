// config/database.js
require('dotenv').config();
const { Sequelize } = require('sequelize');

/**
 * Instance Sequelize UNIQUE pour toute l’application.
 * Inclut l’option SSL indispensable sur Render (PostgreSQL managé).
 */
const sequelize = new Sequelize(
  process.env.DB_NAME,          // ex. gestionstock_isaq
  process.env.DB_USER,          // ex. gestionstock_user
  process.env.DB_PASSWORD,      // ex. pMyc9YEsT7PrAwWFEOvVD3wiiseMURs
  {
    host   : process.env.DB_HOST,         // dpg-xxxxxxxx.frankfurt-postgres.render.com
    port   : process.env.DB_PORT || 5432, // 5432 par défaut
    dialect: 'postgres',

    // ➜ Ajout : Render exige SSL
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // Render fournit un certificat auto-signé
      },
    },

    logging: false, // passe à true pour voir les requêtes SQL
  }
);

module.exports = { sequelize, Sequelize };
