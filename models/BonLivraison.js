// models/BonLivraison.js
const { sequelize, Sequelize } = require('./index');
const MaterielDelivery = require('./MaterielDelivery');
const Chantier = require('./Chantier'); // pour l’association

const BonLivraison = sequelize.define('BonLivraison', {
  fournisseur: {
    type: Sequelize.STRING,
    allowNull: false
  },
  dateLivraison: {
    type: Sequelize.DATE,
    allowNull: false
  },
  reference: {
    type: Sequelize.STRING,
    allowNull: true
  },
  receptionneur: {
    type: Sequelize.STRING,
    allowNull: false
  },
  destination: {
    type: Sequelize.STRING,
    allowNull: false
  },

  // NOUVEAU CHAMP : chantierId
  chantierId: {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: {
      model: 'Chantiers', // nom de la table
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  }
}, {
  // freezeTableName: true,
  // tableName: 'BonLivraison'
});

// Association : un BonLivraison a plusieurs MaterielDelivery
BonLivraison.hasMany(MaterielDelivery, {
  foreignKey: 'bonLivraisonId',
  as: 'materiels'
});
MaterielDelivery.belongsTo(BonLivraison, {
  foreignKey: 'bonLivraisonId',
  as: 'bonLivraison'
});

// Association : un BonLivraison appartient (optionnellement) à un Chantier
BonLivraison.belongsTo(Chantier, {
  foreignKey: 'chantierId',
  as: 'chantier'
});

module.exports = BonLivraison;
