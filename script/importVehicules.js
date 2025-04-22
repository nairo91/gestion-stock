// script/importVehicules.js
const fs = require('fs');
const readline = require('readline');
const { sequelize } = require('../models');
const Vehicule = require('../models/Vehicule');

async function importVehicules(filePath) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber++;

    // Ignorer les lignes vides
    if (!line.trim()) {
      console.log(`Ligne ${lineNumber} ignorée (vide).`);
      continue;
    }

    // Ignorer la première ligne (en-tête)
    if (lineNumber === 1) {
      console.log(`Ligne ${lineNumber} ignorée (en-tête).`);
      continue;
    }

    // Chaque ligne CSV est censée avoir au moins 3 colonnes :
    // 0: MARQUE
    // 1: MODELE
    // 2: IMMAT (plaque)
    // (et d'autres colonnes après)
    const parts = line.split(',');

    // On vérifie qu'on a au moins 3 colonnes
    if (parts.length < 3) {
      console.error(`Ligne ${lineNumber} invalide : ${line}`);
      continue;
    }

    // Extraire la plaque (colonne 2 => parts[2])
    const plaque = parts[2].replace(/"/g, '').trim(); // enlever d'éventuels guillemets
    // Combiner MARQUE + MODELE pour la description
    const marque = parts[0].replace(/"/g, '').trim();
    const modele = parts[1].replace(/"/g, '').trim();
    const description = `${marque} ${modele}`.trim();

    // Si la plaque est vide, on ignore
    if (!plaque) {
      console.error(`Ligne ${lineNumber}: plaque vide, on ignore.`);
      continue;
    }

    // Vérifier si le véhicule existe déjà (pour éviter les doublons)
    const existingVehicule = await Vehicule.findOne({ where: { plaque } });
    if (existingVehicule) {
      console.log(`Doublon détecté pour la plaque "${plaque}" à la ligne ${lineNumber}, ignorée.`);
      continue;
    }

    try {
      await Vehicule.create({ plaque, description });
      console.log(`Véhicule créé : [${plaque}] - ${description}`);
    } catch (err) {
      console.error(`Erreur lors de la création du véhicule (ligne ${lineNumber}) :`, err);
    }
  }

  console.log('Import terminé.');
  process.exit(0);
}

// Vérification de l'argument (chemin du CSV)
const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node script/importVehicules.js <chemin_du_csv>");
  process.exit(1);
}

// On synchronise la base, puis on lance l'import
sequelize.sync()
  .then(() => importVehicules(filePath))
  .catch(err => {
    console.error("Erreur de synchronisation :", err);
    process.exit(1);
  });
