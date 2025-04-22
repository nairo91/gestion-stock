// models/Photo.js
const { sequelize, Sequelize } = require('./index');
const Materiel = require('./Materiel');

const Photo = sequelize.define('Photo', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    chemin: { type: Sequelize.STRING, allowNull: false }
});

// Définir la relation entre Materiel et Photo
Materiel.hasMany(Photo, { foreignKey: 'materielId', as: 'photos' });
Photo.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel' });

module.exports = Photo;
