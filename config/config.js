require('dotenv').config();

const buildProductionConfig = () => {
  let connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'En prod : définis DATABASE_URL (postgres://user:pw@host:port/db)'
    );
  }

  if (connectionString.startsWith('postgresql://')) {
    connectionString = connectionString.replace(/^postgresql:\/\//i, 'postgres://');
  }

  return {
    url: connectionString,
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      keepAlive: true,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    logging: false,
  };
};

module.exports = {
  development: {
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false,
  },
  production: buildProductionConfig(),
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  },
};
