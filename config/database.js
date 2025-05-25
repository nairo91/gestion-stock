// config/database.js
require('dotenv').config();
const { Sequelize } = require('sequelize');

let sequelize;

if (process.env.NODE_ENV === 'production') {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'En prod : définis DATABASE_URL (postgres://user:pw@host:port/db)'
    );
  }

  // Si quelqu’un a mis postgresql:// à la place de postgres://
  if (connectionString.startsWith('postgresql://')) {
    connectionString = connectionString.replace(
      /^postgresql:\/\//i,
      'postgres://'
    );
  }

  console.log('🔗 DB CONNECTION STRING:', connectionString);

  sequelize = new Sequelize(connectionString, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      keepAlive: true
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: false,
  });

} else {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false
  });
}

module.exports = { sequelize, Sequelize };
