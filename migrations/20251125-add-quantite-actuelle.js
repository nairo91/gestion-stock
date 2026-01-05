"use strict";

/**
 * Ajoute la colonne quantiteActuelle pour distinguer la quantité réellement
 * disponible sur le chantier de la quantité reçue enregistrée à l'arrivée.
 * Les valeurs existantes sont initialisées avec la quantité reçue afin de ne
 * pas changer les chiffres affichés jusqu'ici.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Vérifier si la colonne existe déjà pour rendre la migration idempotente
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');
    if (!tableDefinition.quantiteActuelle) {
      await queryInterface.addColumn('materiel_chantiers', 'quantiteActuelle', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
    // Pré-remplir la colonne avec la valeur de quantite si elle était jusqu'ici nulle
    await queryInterface.sequelize.query(`
      UPDATE "materiel_chantiers"
      SET "quantiteActuelle" = "quantite"
      WHERE "quantiteActuelle" IS NULL;
    `);
  },

  async down(queryInterface) {
    // Ne supprimer la colonne que si elle existe
    const tableDefinition = await queryInterface.describeTable('materiel_chantiers');
    if (tableDefinition.quantiteActuelle) {
      await queryInterface.removeColumn('materiel_chantiers', 'quantiteActuelle');
    }
  }
};
