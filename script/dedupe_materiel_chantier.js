/* eslint-disable no-console */
const { sequelize } = require('../config/database');
const MaterielChantier = require('../models/MaterielChantier');

async function dedupe() {
  const [duplicates] = await sequelize.query(
    `
    SELECT "chantierId", "materielId", COUNT(*) AS count
    FROM "materiel_chantiers"
    GROUP BY "chantierId", "materielId"
    HAVING COUNT(*) > 1
    `
  );

  if (!duplicates.length) {
    console.log('Aucun doublon trouvé pour materiel_chantiers.');
    return;
  }

  console.log(`Doublons trouvés: ${duplicates.length} groupe(s).`);

  let totalRemoved = 0;

  for (const row of duplicates) {
    const [entries] = await sequelize.query(
      `
      SELECT id
      FROM "materiel_chantiers"
      WHERE "chantierId" = :chantierId
        AND "materielId" = :materielId
      ORDER BY "updatedAt" DESC, id DESC
      `,
      {
        replacements: {
          chantierId: row.chantierId,
          materielId: row.materielId
        }
      }
    );

    const idsToDelete = entries.slice(1).map(entry => entry.id);

    if (!idsToDelete.length) {
      continue;
    }

    const removed = await MaterielChantier.destroy({
      where: { id: idsToDelete }
    });

    totalRemoved += removed;

    console.log(
      `Nettoyage chantierId=${row.chantierId} materielId=${row.materielId}: supprimé ${removed} doublon(s).`
    );
  }

  console.log(`Total de doublons supprimés: ${totalRemoved}.`);
}

dedupe()
  .catch(error => {
    console.error('Erreur pendant la déduplication:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
