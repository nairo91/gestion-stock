"use strict";

/**
 * Ajoute des colonnes pour mémoriser la quantité prévue initiale par créneau
 * (1, 2, 3, 4). Elles sont initialisées à partir des valeurs existantes afin
 * que l'affichage "Qte init prév" reste cohérent avec l'historique.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');

    if (!tableDefinition.quantitePrevueInitiale1) {
      await queryInterface.addColumn('materiel_chantiers', 'quantitePrevueInitiale1', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!tableDefinition.quantitePrevueInitiale2) {
      await queryInterface.addColumn('materiel_chantiers', 'quantitePrevueInitiale2', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!tableDefinition.quantitePrevueInitiale3) {
      await queryInterface.addColumn('materiel_chantiers', 'quantitePrevueInitiale3', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!tableDefinition.quantitePrevueInitiale4) {
      await queryInterface.addColumn('materiel_chantiers', 'quantitePrevueInitiale4', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    // Pré-remplir les nouvelles colonnes avec les valeurs actuelles
    await queryInterface.sequelize.query(`
      UPDATE "materiel_chantiers"
      SET
        "quantitePrevueInitiale1" = COALESCE("quantitePrevue1", "quantitePrevue"),
        "quantitePrevueInitiale2" = "quantitePrevue2",
        "quantitePrevueInitiale3" = "quantitePrevue3",
        "quantitePrevueInitiale4" = "quantitePrevue4"
      WHERE
        (
          "quantitePrevueInitiale1" IS NULL OR
          "quantitePrevueInitiale2" IS NULL OR
          "quantitePrevueInitiale3" IS NULL OR
          "quantitePrevueInitiale4" IS NULL
        );
    `);
  },

  async down(queryInterface) {
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');

    if (tableDefinition.quantitePrevueInitiale1) {
      await queryInterface.removeColumn('materiel_chantiers', 'quantitePrevueInitiale1');
    }
    if (tableDefinition.quantitePrevueInitiale2) {
      await queryInterface.removeColumn('materiel_chantiers', 'quantitePrevueInitiale2');
    }
    if (tableDefinition.quantitePrevueInitiale3) {
      await queryInterface.removeColumn('materiel_chantiers', 'quantitePrevueInitiale3');
    }
    if (tableDefinition.quantitePrevueInitiale4) {
      await queryInterface.removeColumn('materiel_chantiers', 'quantitePrevueInitiale4');
    }
  }
};
