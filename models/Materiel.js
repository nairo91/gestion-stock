const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Materiel = sequelize.define(
  'Materiel',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nom: { type: DataTypes.STRING, allowNull: false },
    reference: { type: DataTypes.STRING },
    barcode: { type: DataTypes.STRING, allowNull: true },
    qr_code_value: { type: DataTypes.STRING, allowNull: true, unique: true },
    quantite: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const rawValue = this.getDataValue('quantite');
        if (rawValue === null || rawValue === undefined) {
          return rawValue;
        }
        const parsed = parseFloat(rawValue);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
    },
    description: { type: DataTypes.TEXT },
    prix: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    categorie: { type: DataTypes.STRING },
    fournisseur: { type: DataTypes.STRING },
    rack: { type: DataTypes.STRING },
    compartiment: { type: DataTypes.STRING },
    niveau: { type: DataTypes.INTEGER },
    position: { type: DataTypes.STRING },
    vehiculeId: { type: DataTypes.INTEGER },
    chantierId: { type: DataTypes.INTEGER },
    emplacementId: { type: DataTypes.INTEGER }
  },
  {
    tableName: 'materiels',
    timestamps: true,
    indexes: [
      { fields: ['barcode'] },
      { unique: true, fields: ['qr_code_value'] },
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

Materiel.addHook('afterCreate', async materiel => {
  if (!materiel.qr_code_value) {
    materiel.qr_code_value = `MAT_${materiel.id}`;
    await materiel.save();
  }
});

module.exports = Materiel;
