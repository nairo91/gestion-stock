// models/Emplacement.js
module.exports = (sequelize, DataTypes) => {
  const Emplacement = sequelize.define('Emplacement', {
    nom: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING
    },
    chantierId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  });

  Emplacement.associate = function(models) {
    Emplacement.belongsTo(models.Chantier, {
      foreignKey: 'chantierId',
      as: 'chantier'
    });

    Emplacement.belongsTo(models.Emplacement, {
      foreignKey: 'parentId',
      as: 'parent'
    });

    Emplacement.hasMany(models.Emplacement, {
      foreignKey: 'parentId',
      as: 'enfants'
    });
  };

  return Emplacement;
};
