'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');

    if (!tableDefinition.alertStatus) {
      await queryInterface.addColumn('materiel_chantiers', 'alertStatus', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'critique'
      });
    }
  },

  async down(queryInterface) {
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');

    if (tableDefinition.alertStatus) {
      await queryInterface.removeColumn('materiel_chantiers', 'alertStatus');
    }
  }
};
