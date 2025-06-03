const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Emplacement = sequelize.define('Emplacement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nom: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  chantierId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'emplacements',
  timestamps: true,
});

Emplacement.associate = function (models) {
  Emplacement.belongsTo(models.Chantier, {
    foreignKey: 'chantierId',
    as: 'chantier',
    onDelete: 'CASCADE',
  });

  Emplacement.belongsTo(models.Emplacement, {
    foreignKey: 'parentId',
    as: 'parent',
    onDelete: 'SET NULL',
  });

  Emplacement.hasMany(models.Emplacement, {
    foreignKey: 'parentId',
    as: 'sousEmplacements',
  });
};

module.exports = Emplacement;
