'use strict';

module.exports = {
  async up(queryInterface) {
    const indexes = await queryInterface.showIndex('materiel_chantiers');
    const indexName = 'materiel_chantiers_chantierId_materielId_unique';
    const hasIndex = indexes.some(index => index.name === indexName);

    if (!hasIndex) {
      await queryInterface.addIndex(
        'materiel_chantiers',
        ['chantierId', 'materielId'],
        {
          name: indexName,
          unique: true
        }
      );
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('materiel_chantiers');
    const indexName = 'materiel_chantiers_chantierId_materielId_unique';
    const hasIndex = indexes.some(index => index.name === indexName);

    if (hasIndex) {
      await queryInterface.removeIndex('materiel_chantiers', indexName);
    }
  }
};
