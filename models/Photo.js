// models/Photo.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');   // ajuste le chemin si besoin

const Photo = sequelize.define(
  'Photo',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // Chemin vers le fichier image (optionnel si stockage en BDD)
    chemin: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Données binaires de la photo pour un stockage persistant
    data: {
      type: DataTypes.BLOB('long'),
      allowNull: true,
    },

    // FK vers le matériel associé
    materielId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'materiels', key: 'id' },
      onDelete: 'CASCADE',
    },
  },
  {
    tableName: 'photos',
    timestamps: true,
  }
);

/* ======================
   Associations (dans models/index.js)
======================

Photo.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel' });

*/

module.exports = Photo;
