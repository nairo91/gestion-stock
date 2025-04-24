// models/Vehicule.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');   // ajuste le chemin si besoin

const Vehicule = sequelize.define(
  'Vehicule',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    plaque: {
      type     : DataTypes.STRING,
      allowNull: false,
      unique   : true,
    },

    description: {
      type     : DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName : 'vehicules',
    timestamps: true,
  }
);

/* ======================
   Associations à POUSSER dans models/index.js
======================

const Vehicule = require('./Vehicule');
const Materiel = require('./Materiel');

Vehicule.hasMany(Materiel, {
  foreignKey: 'vehiculeId',
  as        : 'materiels',
  onDelete  : 'SET NULL',
});

Materiel.belongsTo(Vehicule, {
  foreignKey: 'vehiculeId',
  as        : 'vehicule',
  onDelete  : 'SET NULL',
});

*/

module.exports = Vehicule;
