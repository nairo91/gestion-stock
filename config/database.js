// config/database.js
require('dotenv').config()
const { Sequelize } = require('sequelize')

let sequelize

if (process.env.NODE_ENV === 'production' && process.env.DB_HOST) {
  // Sur Render (production), on se connecte à Postgres
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host   : process.env.DB_HOST,
      port   : process.env.DB_PORT || 5432,
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      logging: false
    }
  )
} else {
  // En développement local, on utilise SQLite (fichier database.sqlite à la racine)
  sequelize = new Sequelize({
    dialect : 'sqlite',
    storage : './database.sqlite',
    logging : false
  })
}

module.exports = { sequelize, Sequelize }
