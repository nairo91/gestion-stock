'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('materiels', 'categorie', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.changeColumn('materiels', 'fournisseur', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('materiels', 'categorie', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.changeColumn('materiels', 'fournisseur', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
