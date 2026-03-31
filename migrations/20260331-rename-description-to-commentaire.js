'use strict';

const TABLE_NAMES = [
  'materiels',
  'vehicules',
  'emplacements',
  'Materiels',
  'Vehicules',
  'Emplacements'
];

async function describeTableSafe(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch (_) {
    return null;
  }
}

async function syncColumnRename(queryInterface, Sequelize, tableName, fromColumn, toColumn) {
  const tableDefinition = await describeTableSafe(queryInterface, tableName);
  if (!tableDefinition) {
    return;
  }

  const hasFromColumn = Boolean(tableDefinition[fromColumn]);
  const hasToColumn = Boolean(tableDefinition[toColumn]);

  if (hasFromColumn && hasToColumn) {
    await queryInterface.sequelize.query(
      `UPDATE "${tableName}" SET "${toColumn}" = COALESCE("${toColumn}", "${fromColumn}") WHERE "${toColumn}" IS NULL AND "${fromColumn}" IS NOT NULL`
    );
    await queryInterface.removeColumn(tableName, fromColumn);
  } else if (hasFromColumn) {
    await queryInterface.renameColumn(tableName, fromColumn, toColumn);
  } else if (!hasToColumn) {
    return;
  }

  await queryInterface.changeColumn(tableName, toColumn, {
    type: Sequelize.TEXT,
    allowNull: true
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const tableName of TABLE_NAMES) {
      await syncColumnRename(queryInterface, Sequelize, tableName, 'description', 'commentaire');
    }
  },

  async down(queryInterface, Sequelize) {
    for (const tableName of TABLE_NAMES) {
      await syncColumnRename(queryInterface, Sequelize, tableName, 'commentaire', 'description');
    }
  }
};
