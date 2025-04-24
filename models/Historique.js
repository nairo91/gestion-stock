// models/Historique.js
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');      // ajuste le chemin si besoin

const Historique = sequelize.define(
  'Historique',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // Stock concerné : ‘depot’, ‘chantier’, ‘vehicule’, etc.
    stockType: {
      type: DataTypes.ENUM('depot', 'chantier', 'vehicule'),
      allowNull: false,
    },

    // Action : CREATE, UPDATE, DELETE, DELIVERY_TO_CHANTIER…
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Quantités avant / après (null si pas applicable)
    oldQuantite: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    newQuantite: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Libellé lisible (nom du matériel ou autre)
    materielNom: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    /* ===== Clés étrangères facultatives ===== */
    materielId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'materiels', key: 'id' },
      onDelete: 'SET NULL',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
  },
  {
    tableName: 'historiques',
    timestamps: true,           // createdAt / updatedAt
  }
);

/* ======================
   Associations (à placer dans le fichier central)
======================

Historique.belongsTo(Materiel, { foreignKey: 'materielId',  as: 'materiel' });
Historique.belongsTo(User,     { foreignKey: 'userId',      as: 'user'     });

*/

module.exports = Historique;
