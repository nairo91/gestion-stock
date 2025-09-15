require('dotenv').config();

const { sequelize, Sequelize } = require('../config/database');

const User             = require('./User');
const Materiel         = require('./Materiel');
const Chantier         = require('./Chantier');
const Vehicule         = require('./Vehicule');
const Photo            = require('./Photo');
const BonLivraison     = require('./BonLivraison');
const MaterielChantier = require('./MaterielChantier');
const MaterielDelivery = require('./MaterielDelivery');
const Historique       = require('./Historique');
const Emplacement      = require('./Emplacement');
const Categorie        = require('./Categorie');

// 📦 Regroupement de tous les modèles
const models = {
  User,
  Materiel,
  Chantier,
  Vehicule,
  Photo,
  BonLivraison,
  MaterielChantier,
  MaterielDelivery,
  Historique,
  Emplacement,
  Categorie,
};

// Associations manuelles
MaterielChantier.belongsTo(Chantier, { foreignKey: 'chantierId', as: 'chantier', onDelete: 'CASCADE' });
MaterielChantier.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel', onDelete: 'CASCADE' });
Chantier.hasMany(MaterielChantier,   { foreignKey: 'chantierId', as: 'materielChantiers' });
Materiel.hasMany(MaterielChantier,   { foreignKey: 'materielId', as: 'materielChantiers' });

MaterielDelivery.belongsTo(BonLivraison, { foreignKey: 'bonLivraisonId', as: 'bonLivraison', onDelete: 'CASCADE' });
MaterielDelivery.belongsTo(Materiel,     { foreignKey: 'materielId', as: 'materiel', onDelete: 'CASCADE' });
BonLivraison.hasMany(MaterielDelivery,   { foreignKey: 'bonLivraisonId', as: 'materiels' });
Materiel.hasMany(MaterielDelivery,       { foreignKey: 'materielId', as: 'deliveries' });

BonLivraison.belongsTo(Chantier, { foreignKey: 'chantierId', as: 'chantier', onDelete: 'SET NULL', constraints: false });
Chantier.hasMany(BonLivraison,  { foreignKey: 'chantierId', as: 'bonsLivraison' });

Vehicule.hasMany(Materiel, { foreignKey: 'vehiculeId', as: 'materiels', onDelete: 'SET NULL' });

Photo.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel', onDelete: 'CASCADE' });
//Materiel.hasMany(Photo,   { foreignKey: 'materielId', as: 'photos' });

Historique.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel', onDelete: 'SET NULL' });
Historique.belongsTo(User,     { foreignKey: 'userId', as: 'user', onDelete: 'SET NULL' });
Materiel.hasMany(Historique,   { foreignKey: 'materielId', as: 'historiques' });
User.hasMany(Historique,       { foreignKey: 'userId', as: 'historiques' });


Chantier.hasMany(Emplacement,  { foreignKey: 'chantierId', as: 'emplacements' });

// 🔁 Appel des .associate() avec tous les modèles déjà définis
if (typeof Materiel.associate === 'function') Materiel.associate(models);
if (typeof Emplacement.associate === 'function') Emplacement.associate(models);

/* Export global */
module.exports = {
  sequelize,
  Sequelize,
  User,
  Materiel,
  Chantier,
  Vehicule,
  Photo,
  BonLivraison,
  MaterielChantier,
  MaterielDelivery,
  Historique,
  Emplacement,
  Categorie,
};
