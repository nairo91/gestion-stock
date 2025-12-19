'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('materiel_chantiers', 'alertStatus', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'critique'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('materiel_chantiers', 'alertStatus');
  }
};
