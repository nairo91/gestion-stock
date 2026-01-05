'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('materiels', 'nom', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    await queryInterface.changeColumn('designations', 'nom', {
      type: Sequelize.TEXT,
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('materiels', 'nom', {
      type: Sequelize.STRING,
      allowNull: false
    });

    await queryInterface.changeColumn('designations', 'nom', {
      type: Sequelize.STRING,
      allowNull: false
    });
  }
};
