// models/MaterielDelivery.js
const { sequelize, Sequelize } = require('./index');
const Materiel = require('./Materiel'); // pour l'association au modèle Materiel

const MaterielDelivery = sequelize.define('MaterielDelivery', {
  quantite: {
    type: Sequelize.INTEGER,
    allowNull: false
  }
});

// Association avec Materiel
MaterielDelivery.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel' ,
  onDelete: 'CASCADE'});
// L'association avec BonLivraison est définie dans BonLivraison.js

module.exports = MaterielDelivery;
