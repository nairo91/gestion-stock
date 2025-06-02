// models/Materiel.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');      // ajuste le chemin si besoin

const Materiel = sequelize.define(
  'Materiel',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    /* --- Informations de base --- */
    nom: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    barcode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },

    /* --- Stock & tarification --- */
    quantite: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    prix: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    categorie: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    /* --- Emplacement physique (dépôt) --- */
    rack: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    compartiment: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    niveau: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    /* --- FK vers véhicule ou chantier (mutuellement exclusifs) --- */
    vehiculeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'vehicules', key: 'id' },
      onDelete: 'SET NULL',
    },

    chantierId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'chantiers', key: 'id' },
      onDelete: 'SET NULL',
    },

    emplacementId: {
  type: DataTypes.INTEGER,
  allowNull: true,
  references: { model: 'emplacements', key: 'id' },
  onDelete: 'SET NULL',
},

  },
  {
    tableName: 'materiels',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['barcode'] },
      // index composite utile dans les recherches
      { fields: ['categorie', 'nom'] },
    ],
  }
);



module.exports = Materiel;

