"use strict";

/**
 * Ajoute la colonne quantiteActuelle pour distinguer la quantité réellement
 * disponible sur le chantier de la quantité reçue enregistrée à l'arrivée.
 * Les valeurs existantes sont initialisées avec la quantité reçue afin de ne
 * pas changer les chiffres affichés jusqu'ici.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('materiel_chantiers', 'quantiteActuelle', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE "materiel_chantiers"
      SET "quantiteActuelle" = "quantite"
      WHERE "quantiteActuelle" IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('materiel_chantiers', 'quantiteActuelle');
  }
};
