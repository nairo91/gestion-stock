'use strict';

const normalizeKey = str => {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn(
        'materiels',
        'nom_normalized',
        {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: ''
        },
        { transaction }
      );

      await queryInterface.addColumn(
        'materiels',
        'categorie_normalized',
        {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: ''
        },
        { transaction }
      );

      const [rows] = await queryInterface.sequelize.query(
        'SELECT id, nom, categorie FROM materiels',
        { transaction }
      );

      for (const row of rows) {
        const nomNormalized = normalizeKey(row.nom);
        const categorieNormalized = normalizeKey(row.categorie);
        await queryInterface.sequelize.query(
          'UPDATE materiels SET nom_normalized = ?, categorie_normalized = ? WHERE id = ?',
          {
            replacements: [nomNormalized, categorieNormalized, row.id],
            transaction
          }
        );
      }

      await queryInterface.addIndex(
        'materiels',
        ['nom_normalized', 'categorie_normalized'],
        {
          unique: true,
          name: 'materiels_nom_categorie_normalized_unique',
          transaction
        }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('materiels', 'materiels_nom_categorie_normalized_unique', { transaction });
      await queryInterface.removeColumn('materiels', 'nom_normalized', { transaction });
      await queryInterface.removeColumn('materiels', 'categorie_normalized', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
