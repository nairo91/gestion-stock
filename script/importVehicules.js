// script/importVehicules.js
const fs = require('fs');
const readline = require('readline');
const { sequelize } = require('../models');
const Vehicule = require('../models/Vehicule');

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^"|"$/g, '')
    .trim()
    .toUpperCase();
}

function parseCsvLine(raw) {
  return raw.split(';').map(cell =>
    cell
      .replace(/^"|"$/g, '')
      .replace(/""/g, '"')
      .trim()
  );
}

async function importVehicules(filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  let lineNo = 0;
  let plaqueIndex = 0;
  let commentaireIndex = 1;

  for await (const raw of rl) {
    lineNo++;

    if (!raw.trim()) continue;

    const values = parseCsvLine(raw);

    if (lineNo === 1) {
      const headers = values.map(normalizeHeader);
      const detectedPlaqueIndex = headers.findIndex(header => header === 'PLAQUE');
      const detectedCommentaireIndex = headers.findIndex(
        header => header === 'COMMENTAIRE' || header === 'DESCRIPTION'
      );

      if (detectedPlaqueIndex !== -1) {
        plaqueIndex = detectedPlaqueIndex;
      }

      if (detectedCommentaireIndex !== -1) {
        commentaireIndex = detectedCommentaireIndex;
      }

      continue;
    }

    const plaque = String(values[plaqueIndex] || '').trim().toUpperCase();
    const commentaire = String(values[commentaireIndex] || '').trim();

    if (!plaque) {
      console.log(`Ligne ${lineNo} : plaque vide, ignoree`);
      continue;
    }

    const exists = await Vehicule.findOne({ where: { plaque } });
    if (exists) {
      console.log(`Ligne ${lineNo} : ${plaque} deja present, ignore`);
      continue;
    }

    await Vehicule.create({
      plaque,
      commentaire: commentaire || null
    });
    console.log(`OK ${plaque} - ${commentaire}`);
  }

  console.log('Import termine');
  process.exit(0);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage : node script/importVehicules.js /chemin/fichier.csv');
  process.exit(1);
}

sequelize.sync()
  .then(() => importVehicules(file))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
