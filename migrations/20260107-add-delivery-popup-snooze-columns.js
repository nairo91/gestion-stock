'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');

    const columns = [
      'deliveryPopupSnoozeUntil',
      'deliveryPopupSnoozeUntil1',
      'deliveryPopupSnoozeUntil2',
      'deliveryPopupSnoozeUntil3',
      'deliveryPopupSnoozeUntil4'
    ];

    for (const column of columns) {
      if (tableDefinition[column]) {
        continue;
      }

      await queryInterface.addColumn('materiel_chantiers', column, {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupSnoozeUntil4');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupSnoozeUntil3');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupSnoozeUntil2');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupSnoozeUntil1');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupSnoozeUntil');
  }
};
