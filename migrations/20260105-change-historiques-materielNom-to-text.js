'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('historiques', 'materielNom', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('historiques', 'materielNom', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
