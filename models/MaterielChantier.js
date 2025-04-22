const { sequelize, Sequelize } = require('./index');
const Chantier = require('./Chantier');
const Materiel = require('./Materiel');

const MaterielChantier = sequelize.define('MaterielChantier', {
  quantite: {
    type: Sequelize.INTEGER,
    allowNull: false
  }
}, {
  timestamps: true
});

// Associations : un MaterielChantier appartient à un Chantier et à un Materiel
MaterielChantier.belongsTo(Chantier, { foreignKey: 'chantierId', as: 'chantier' });
MaterielChantier.belongsTo(Materiel, { foreignKey: 'materielId', as: 'materiel' });

module.exports = MaterielChantier;
