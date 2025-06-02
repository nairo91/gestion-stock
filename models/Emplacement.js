// models/Emplacement.js
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');

/**
 * Emplacement : rack, bac ou conteneur spécifique à un Chantier
 */
const Emplacement = sequelize.define(
  'Emplacement',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    nom: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    chantierId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    }
  },
  {
    tableName: 'emplacements',
    timestamps: true,
  }
);

module.exports = Emplacement;

const Materiel = require('./Materiel');
Emplacement.hasMany(Materiel, {
  foreignKey: 'emplacementId',
  as: 'materiels'
});
