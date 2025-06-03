const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Materiel = sequelize.define(
  'Materiel',
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

    reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    barcode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },

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

    vehiculeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    chantierId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    emplacementId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    }
  },
  {
    tableName: 'materiels',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['barcode'] },
      { fields: ['categorie', 'nom'] },
    ],
  }
);

// ✅ Ajoute ceci à la fin pour déclarer les associations proprement
Materiel.associate = function (models) {
  Materiel.belongsTo(models.Emplacement, {
    foreignKey: 'emplacementId',
    as: 'emplacement',
    onDelete: 'SET NULL'
  });

  Materiel.belongsTo(models.Vehicule, {
    foreignKey: 'vehiculeId',
    as: 'vehicule',
    onDelete: 'SET NULL'
  });

  Materiel.belongsTo(models.Chantier, {
    foreignKey: 'chantierId',
    as: 'chantier',
    onDelete: 'SET NULL'
  });
};

module.exports = Materiel;
