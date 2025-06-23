const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Materiel = sequelize.define(
  'Materiel',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nom: { type: DataTypes.STRING, allowNull: false },
    reference: { type: DataTypes.STRING },
    barcode: { type: DataTypes.STRING, unique: true },
    quantite: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    description: { type: DataTypes.TEXT },
    prix: { type: DataTypes.DECIMAL(10, 2) },
    categorie: { type: DataTypes.STRING },
    fournisseur: { type: DataTypes.STRING },
    rack: { type: DataTypes.STRING },
    compartiment: { type: DataTypes.STRING },
    niveau: { type: DataTypes.INTEGER },
    vehiculeId: { type: DataTypes.INTEGER },
    chantierId: { type: DataTypes.INTEGER },
    emplacementId: { type: DataTypes.INTEGER }
  },
  {
    tableName: 'materiels',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['barcode'] },
      { fields: ['categorie', 'nom'] }
    ]
  }
);

// ✅ Déclaration différée des relations
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

  Materiel.hasMany(models.Photo, {
    foreignKey: 'materielId',
    as: 'photos',
    onDelete: 'CASCADE'
  });
};

module.exports = Materiel;
