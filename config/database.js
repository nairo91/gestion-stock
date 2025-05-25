// config/database.js
require('dotenv').config();
const { Sequelize } = require('sequelize');

let sequelize;

if (process.env.NODE_ENV === 'production') {
  // Essayons d'abord DATABASE_URL, fourni par Render (ex: postgres://user:pw@host:port/db)
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    sequelize = new Sequelize(connectionString, {
      dialect: 'postgres',
      protocol: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          // Render fournit un certificat auto-signé
          rejectUnauthorized: false,
        },
      },
      logging: false,
    });
  } else if (process.env.DB_HOST) {
    // Fallback sur DB_HOST, DB_USER, etc. si tu préfères
    sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        },
        logging: false,
      }
    );
  } else {
    throw new Error(
      'En production, il faut définir DATABASE_URL ou au moins DB_HOST, DB_NAME, DB_USER et DB_PASSWORD'
    );
  }
} else {
  // Dev local : SQLite
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false,
  });
}

module.exports = { sequelize, Sequelize };
