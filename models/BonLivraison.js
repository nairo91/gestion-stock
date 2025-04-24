// models/BonLivraison.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');   // ajuste le chemin si besoin

const BonLivraison = sequelize.define(
  'BonLivraison',
  {
    id: {
      type      : DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    fournisseur: {
      type     : DataTypes.STRING,
      allowNull: false,
    },

    dateLivraison: {
      type     : DataTypes.DATEONLY,
      allowNull: false,
    },

    reference: {
      type     : DataTypes.STRING,
      allowNull: true,
    },

    receptionneur: {
      type     : DataTypes.STRING,
      allowNull: true,
    },

    // « Stock dépôt », « Chantier », « Véhicule »
    destination: {
      type     : DataTypes.ENUM('Stock dépôt', 'Chantier', 'Véhicule'),
      allowNull: false,
    },

    // FK optionnelle vers le chantier destinataire
    chantierId: {
      type      : DataTypes.INTEGER,
      allowNull : true,
      references: { model: 'chantiers', key: 'id' },
      onDelete  : 'SET NULL',
    },
  },
  {
    tableName : 'bon_livraisons',
    timestamps: true,
  }
);

/* ======================
   Associations à POUSSER dans models/index.js
======================

const BonLivraison = require('./BonLivraison');
const Chantier     = require('./Chantier');

BonLivraison.belongsTo(Chantier, {
  foreignKey: 'chantierId',
  as        : 'chantier',
  onDelete  : 'SET NULL',
});

Chantier.hasMany(BonLivraison, {
  foreignKey: 'chantierId',
  as        : 'bonsLivraison',
});

*/

module.exports = BonLivraison;
