'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('materiel_chantiers', 'deliveryPopupDismissed', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });

    await queryInterface.addColumn('materiel_chantiers', 'deliveryPopupDismissed1', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });

    await queryInterface.addColumn('materiel_chantiers', 'deliveryPopupDismissed2', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });

    await queryInterface.addColumn('materiel_chantiers', 'deliveryPopupDismissed3', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });

    await queryInterface.addColumn('materiel_chantiers', 'deliveryPopupDismissed4', {
      type: Sequelize.BOOLEAN,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed1');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed2');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed3');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryPopupDismissed4');
  }
};
