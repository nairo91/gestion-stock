// models/MaterielDelivery.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');   // ajuste le chemin si besoin

/**
 * Table d’association entre un Bon de livraison et les matériels livrés.
 * Chaque ligne indique la quantité livrée d’un matériel pour un bon donné.
 */
const MaterielDelivery = sequelize.define(
  'MaterielDelivery',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    quantite: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
      },
    },
  },
  {
    tableName: 'materiel_deliveries',
    timestamps: true,
  }
);

/* ======================
   Associations à ajouter dans models/index.js
======================

const BonLivraison = require('./BonLivraison');
const Materiel     = require('./Materiel');

MaterielDelivery.belongsTo(BonLivraison, {
  foreignKey: 'bonLivraisonId',
  as: 'bonLivraison',
  onDelete: 'CASCADE',
});

MaterielDelivery.belongsTo(Materiel, {
  foreignKey: 'materielId',
  as: 'materiel',
  onDelete: 'CASCADE',
});

BonLivraison.hasMany(MaterielDelivery, {
  foreignKey: 'bonLivraisonId',
  as: 'materiels',
});

Materiel.hasMany(MaterielDelivery, {
  foreignKey: 'materielId',
  as: 'deliveries',
});

*/

module.exports = MaterielDelivery;
