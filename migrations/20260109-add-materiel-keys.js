'use strict';

const normalizeValue = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('materiels');

    if (!tableDefinition.nomKey) {
      await queryInterface.addColumn('materiels', 'nomKey', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableDefinition.categorieKey) {
      await queryInterface.addColumn('materiels', 'categorieKey', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    const [rows] = await queryInterface.sequelize.query(
      'SELECT id, nom, categorie, "nomKey", "categorieKey" FROM "materiels"'
    );

    for (const row of rows) {
      const nomKey = row.nomKey || normalizeValue(row.nom);
      const categorieKey = row.categorieKey || normalizeValue(row.categorie);

      await queryInterface.sequelize.query(
        'UPDATE "materiels" SET "nomKey" = :nomKey, "categorieKey" = :categorieKey WHERE id = :id',
        {
          replacements: {
            id: row.id,
            nomKey,
            categorieKey
          }
        }
      );
    }

    const indexes = await queryInterface.showIndex('materiels');
    const indexName = 'materiels_nomKey_categorieKey_idx';
    const hasIndex = indexes.some(index => index.name === indexName);

    if (!hasIndex) {
      await queryInterface.addIndex('materiels', ['nomKey', 'categorieKey'], {
        name: indexName
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('materiels');
    const indexName = 'materiels_nomKey_categorieKey_idx';
    const hasIndex = indexes.some(index => index.name === indexName);

    if (hasIndex) {
      await queryInterface.removeIndex('materiels', indexName);
    }

    const tableDefinition = await queryInterface.describeTable('materiels');

    if (tableDefinition.nomKey) {
      await queryInterface.removeColumn('materiels', 'nomKey');
    }

    if (tableDefinition.categorieKey) {
      await queryInterface.removeColumn('materiels', 'categorieKey');
    }
  }
};
