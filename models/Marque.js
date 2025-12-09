const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Marque = sequelize.define('Marque', {
  nom: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
}, {
  tableName: 'marques',
  timestamps: true,
});

module.exports = Marque;
