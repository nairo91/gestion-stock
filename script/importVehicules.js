// script/importVehicules.js
const fs        = require('fs');
const readline  = require('readline');
const { sequelize } = require('../models');
const Vehicule  = require('../models/Vehicule');

async function importVehicules (filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  let lineNo = 0;

  for await (const raw of rl) {
    lineNo++;

    // ignore l’en-tête
    if (lineNo === 1) continue;
    if (!raw.trim())     continue;                // ligne vide

    // découpe ;  puis enlève les guillemets éventuels
    const [plaqueRaw, descRaw] = raw.split(';');
    const plaque = plaqueRaw.replace(/"/g, '').trim().toUpperCase();
    const description = (descRaw || '').replace(/"/g, '').trim();

    if (!plaque) {
      console.log(`Ligne ${lineNo} : plaque vide, ignorée`);
      continue;
    }

    // évite les doublons
    const exists = await Vehicule.findOne({ where: { plaque } });
    if (exists) {
      console.log(`Ligne ${lineNo} : ${plaque} déjà présent, ignoré`);
      continue;
    }

    await Vehicule.create({ plaque, description });
    console.log(`✓ ${plaque} – ${description}`);
  }

  console.log('Import terminé 🎉');
  process.exit(0);
}

// --- exécution ---
const file = process.argv[2];
if (!file) {
  console.error('Usage : node script/importVehicules.js /chemin/fichier.csv');
  process.exit(1);
}

sequelize.sync()                 // au cas où le modèle n’existe pas encore
  .then(() => importVehicules(file))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
