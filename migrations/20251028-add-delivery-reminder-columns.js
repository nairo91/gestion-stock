'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');
    const indexes = await queryInterface.showIndex('materiel_chantiers');

    const hasFirstReminderColumn = !!tableDefinition.deliveryReminderSentAt;
    const hasFollowUpColumn = !!tableDefinition.deliveryReminderFollowUpSentAt;

    if (!hasFirstReminderColumn) {
      await queryInterface.addColumn('materiel_chantiers', 'deliveryReminderSentAt', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'dateLivraisonPrevue',
      });
    }

    const hasFirstReminderIndex = indexes.some(
      (index) => index.name === 'materiel_chantiers_deliveryReminderSentAt_idx',
    );
    if (!hasFirstReminderIndex) {
      await queryInterface.addIndex('materiel_chantiers', ['deliveryReminderSentAt'], {
        name: 'materiel_chantiers_deliveryReminderSentAt_idx',
      });
    }

    if (!hasFollowUpColumn) {
      await queryInterface.addColumn('materiel_chantiers', 'deliveryReminderFollowUpSentAt', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'deliveryReminderSentAt',
      });
    }

    const hasFollowUpIndex = indexes.some(
      (index) => index.name === 'materiel_chantiers_deliveryReminderFollowUpSentAt_idx',
    );
    if (!hasFollowUpIndex) {
      await queryInterface.addIndex('materiel_chantiers', ['deliveryReminderFollowUpSentAt'], {
        name: 'materiel_chantiers_deliveryReminderFollowUpSentAt_idx',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('materiel_chantiers', 'materiel_chantiers_deliveryReminderFollowUpSentAt_idx');
    await queryInterface.removeIndex('materiel_chantiers', 'materiel_chantiers_deliveryReminderSentAt_idx');

    await queryInterface.removeColumn('materiel_chantiers', 'deliveryReminderFollowUpSentAt');
    await queryInterface.removeColumn('materiel_chantiers', 'deliveryReminderSentAt');
  },
};
