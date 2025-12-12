'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('materiel_chantiers', 'quantitePrevueInitiale', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE materiel_chantiers
      SET "quantitePrevueInitiale" = "quantitePrevue"
      WHERE "quantitePrevue" IS NOT NULL
        AND "quantitePrevueInitiale" IS NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('materiel_chantiers', 'quantitePrevueInitiale');
  }
};
