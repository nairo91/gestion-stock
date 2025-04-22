// models/Vehicule.js
const { sequelize, Sequelize } = require('./index');

const Vehicule = sequelize.define('Vehicule', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  plaque: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: Sequelize.STRING,
    allowNull: true
  }
}, {
  // Options supplémentaires si besoin
});

module.exports = Vehicule;
