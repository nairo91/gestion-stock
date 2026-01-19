'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');

    if (!tableDefinition.lastReceptionAt) {
      await queryInterface.addColumn('materiel_chantiers', 'lastReceptionAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    const indexes = await queryInterface.showIndex('materiel_chantiers');
    const indexName = 'materiel_chantiers_lastReceptionAt_idx';
    const hasIndex = indexes.some(index => index.name === indexName);

    if (!hasIndex) {
      await queryInterface.addIndex('materiel_chantiers', ['lastReceptionAt'], {
        name: indexName
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('materiel_chantiers');
    const indexName = 'materiel_chantiers_lastReceptionAt_idx';
    const hasIndex = indexes.some(index => index.name === indexName);

    if (hasIndex) {
      await queryInterface.removeIndex('materiel_chantiers', indexName);
    }

    await queryInterface.removeColumn('materiel_chantiers', 'lastReceptionAt');
  }
};
