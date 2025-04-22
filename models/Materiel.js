// models/Materiel.js
const { sequelize, Sequelize } = require('./index');
const Historique = require('./Historique');
const Vehicule = require('./Vehicule');
const Chantier = require('./Chantier');

const Materiel = sequelize.define('Materiel', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: Sequelize.STRING,
    allowNull: false
  },
  // Nouveau champ : Référence interne
  reference: {
    type: Sequelize.STRING,
    allowNull: true,
    defaultValue: ''
  },
  // Nouveau champ : code-barres ou QR code scanné
  barcode: {
    type: Sequelize.STRING,
    allowNull: true,
    defaultValue: null,
    unique: false // Passez à true si vous voulez imposer l'unicité
  },
  quantite: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  description: {
    type: Sequelize.TEXT
  },
  prix: {
    type: Sequelize.FLOAT,
    allowNull: false
  },
  categorie: {
    type: Sequelize.STRING,
    allowNull: false,
    defaultValue: 'Autre'
  },
  rack: {
    type: Sequelize.STRING,
    allowNull: true
  },
  compartiment: {
    type: Sequelize.STRING,
    allowNull: true
  },
  niveau: {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  vehiculeId: {
    type: Sequelize.INTEGER,
    allowNull: true
  },
  chantierId: {
    type: Sequelize.INTEGER,
    allowNull: true
  }
});

// Associations
Materiel.hasMany(Historique, { foreignKey: 'materielId', as: 'historiques' });
Historique.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel' });

Materiel.belongsTo(Vehicule, { foreignKey: 'vehiculeId', as: 'vehicule' });
Materiel.belongsTo(Chantier, { foreignKey: 'chantierId', as: 'chantier' });

module.exports = Materiel;
