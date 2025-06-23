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

    // Chemin vers le fichier image
    chemin: {
      type: DataTypes.STRING,
      allowNull: false,
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
