const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Designation = sequelize.define(
  'Designation',
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
    categorieId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'categories',
        key: 'id',
      },
    },
  },
  {
    tableName: 'designations',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['nom', 'categorieId'],
      },
    ],
  }
);

Designation.associate = function (models) {
  Designation.belongsTo(models.Categorie, {
    foreignKey: 'categorieId',
    as: 'categorie',
    onDelete: 'CASCADE',
  });
};

module.exports = Designation;
