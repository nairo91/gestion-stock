// models/index.js
require('dotenv').config();

/* ============ 1) Connexion ============ */
/* On RÉUTILISE l’instance créée dans config/database.js */
const { sequelize, Sequelize } = require('../config/database');

/* ============ 2) Imports de modèles ============ */
const User             = require('./User');
const Materiel         = require('./Materiel');
const Chantier         = require('./Chantier');
const Vehicule         = require('./Vehicule');
const Photo            = require('./Photo');

const BonLivraison     = require('./BonLivraison');
const MaterielChantier = require('./MaterielChantier');
const MaterielDelivery = require('./MaterielDelivery');

const Historique       = require('./Historique');

/* ============ 3) Associations ============ */
/* --- Chantier ⟷ Materiel (pivot : MaterielChantier) --- */
MaterielChantier.belongsTo(Chantier, { foreignKey: 'chantierId', as: 'chantier',  onDelete: 'CASCADE' });
MaterielChantier.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel',  onDelete: 'CASCADE' });
Chantier.hasMany(MaterielChantier,   { foreignKey: 'chantierId', as: 'materielChantiers' });
Materiel.hasMany(MaterielChantier,   { foreignKey: 'materielId', as: 'materielChantiers' });

/* --- BonLivraison ⟷ Materiel (pivot : MaterielDelivery) --- */
MaterielDelivery.belongsTo(BonLivraison, { foreignKey: 'bonLivraisonId', as: 'bonLivraison', onDelete: 'CASCADE' });
MaterielDelivery.belongsTo(Materiel,     { foreignKey: 'materielId',     as: 'materiel',     onDelete: 'CASCADE' });
BonLivraison.hasMany(MaterielDelivery,   { foreignKey: 'bonLivraisonId', as: 'materiels' });
Materiel.hasMany(MaterielDelivery,       { foreignKey: 'materielId',     as: 'deliveries' });

/* --- Chantier ⟷ BonLivraison (livraison vers un chantier) --- */
BonLivraison.belongsTo(Chantier, { foreignKey: 'chantierId', as: 'chantier', onDelete: 'SET NULL' });
Chantier.hasMany(BonLivraison,  { foreignKey: 'chantierId', as: 'bonsLivraison' });

/* --- Vehicule ⟷ Materiel --- */
Vehicule.hasMany(Materiel,   { foreignKey: 'vehiculeId', as: 'materiels', onDelete: 'SET NULL' });
Materiel.belongsTo(Vehicule, { foreignKey: 'vehiculeId', as: 'vehicule',  onDelete: 'SET NULL' });

/* --- Materiel ⟷ Photo --- */
Photo.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel', onDelete: 'CASCADE' });
Materiel.hasMany(Photo,   { foreignKey: 'materielId', as: 'photos' });

/* --- Historique ⟷ (Materiel / User) --- */
Historique.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel', onDelete: 'SET NULL' });
Historique.belongsTo(User,     { foreignKey: 'userId',     as: 'user',     onDelete: 'SET NULL' });
Materiel.hasMany(Historique,   { foreignKey: 'materielId', as: 'historiques' });
User.hasMany(Historique,       { foreignKey: 'userId',     as: 'historiques' });

/* ============ 4) Export ============ */
module.exports = {
  sequelize,
  Sequelize,

  // Accès pratique aux modèles
  User,
  Materiel,
  Chantier,
  Vehicule,
  Photo,
  BonLivraison,
  MaterielChantier,
  MaterielDelivery,
  Historique,
};
