const { sequelize, Sequelize } = require('./index');

const Chantier = sequelize.define('Chantier', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: Sequelize.STRING,
    allowNull: false
  },
  localisation: {
    type: Sequelize.STRING,
    allowNull: false
  }
}, {
  timestamps: true
});

module.exports = Chantier;
