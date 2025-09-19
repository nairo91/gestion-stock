const { sequelize, Sequelize } = require('../config/database');

async function run() {
  try {
    await sequelize.authenticate();
    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.changeColumn('materiels', 'quantite', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.changeColumn('historiques', 'oldQuantite', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });

    await queryInterface.changeColumn('historiques', 'newQuantite', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });

    console.log('✅ Colonnes "quantite", "oldQuantite" et "newQuantite" migrées en NUMERIC(10,2).');
  } catch (error) {
    console.error('❌ Échec lors de la modification de la colonne "quantite" :', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
