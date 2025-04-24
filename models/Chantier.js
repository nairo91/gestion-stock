// models/Chantier.js
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');   // ajuste le chemin si besoin

const Chantier = sequelize.define(
  'Chantier',
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

    localisation: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: 'chantiers',
    timestamps: true,            // createdAt / updatedAt
  }
);

/* ======================
   Associations (à placer dans le fichier central)
======================

Chantier.hasMany(MaterielChantier, {
  foreignKey: 'chantierId',
  as: 'materiels',
  onDelete: 'CASCADE',
});

Chantier.hasMany(BonLivraison, {
  foreignKey: 'chantierId',
  as: 'bonsLivraison',
  onDelete: 'SET NULL',
});

*/

module.exports = Chantier;
