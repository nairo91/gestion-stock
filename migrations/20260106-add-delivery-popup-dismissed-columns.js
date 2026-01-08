'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');

    const columns = [
      'deliveryPopupDismissed',
      'deliveryPopupDismissed1',
      'deliveryPopupDismissed2',
      'deliveryPopupDismissed3',
      'deliveryPopupDismissed4'
    ];

    for (const column of columns) {
      if (tableDefinition[column]) {
        continue;
      }

      await queryInterface.addColumn('materiel_chantiers', column, {
        type: Sequelize.BOOLEAN,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed4');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed3');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed2');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed1');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed');
  }
};
