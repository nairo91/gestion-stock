// script/importUsers.js
const fs = require('fs');
const readline = require('readline');
const bcrypt = require('bcrypt');
const { sequelize } = require('../models');
const User = require('../models/User');

// Ajoutez ici la liste des e-mails devant devenir admin
const ADMIN_EMAILS = [
  'mirona.rn@batirenov.info',
  'rouault.remy@batirenov.info',
  'blot.valentin@batirenov.info',
  'launay.jeremy@batirenov.info'
];

async function importUsers(filePath) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const results = [];
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber++;

    // Ignore les lignes vides
    if (!line.trim()) {
      console.log(`Ligne ${lineNumber} ignorée (vide).`);
      continue;
    }

    // Ignorer la première ligne (en-tête)
    if (lineNumber === 1) {
      console.log(`Ligne ${lineNumber} ignorée (en-tête).`);
      continue;
    }

    // Découper la ligne par le séparateur ';'
    const parts = line.split(';');

    // On attend 7 colonnes (ID, Nom, Prénom, (vide), Email, (vide), Mot de passe)
    if (parts.length < 7) {
      console.error(`Ligne ${lineNumber} ignorée (colonnes insuffisantes): ${line}`);
      continue;
    }

    // Extraction des données selon l'ordre attendu
    const nom = parts[1] ? parts[1].trim() : 'SansNom';
    const prenom = parts[2] ? parts[2].trim() : '';
    const email = parts[4] ? parts[4].trim() : '';
    const rawPassword = parts[6] ? parts[6].trim() : '';

    if (!email || !rawPassword) {
      console.error(`Ligne ${lineNumber} : email ou mot de passe manquant. Ligne: ${line}`);
      continue;
    }

    // Optionnel : retirer un éventuel préfixe "MDP:" dans le mot de passe
    const password = rawPassword.replace(/MDP.?[:\s]*/i, '').trim();

    results.push({ nom: `${nom} ${prenom}`, email, password });
  }

  try {
    // Synchronisation de la base (sans forcer pour conserver les données existantes)
    await sequelize.sync();

    for (const userData of results) {
      // Vérifier si l'utilisateur existe déjà (pour éviter les doublons)
      const existingUser = await User.findOne({ where: { email: userData.email } });
      if (existingUser) {
        console.log(`Doublon détecté pour ${userData.email}, on ignore cette ligne.`);
        continue;
      }
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Vérifier si l'email fait partie de la liste ADMIN_EMAILS
      const role = ADMIN_EMAILS.includes(userData.email.toLowerCase())
        ? 'admin'
        : 'user';

      await User.create({
        nom: userData.nom,
        email: userData.email,
        password: hashedPassword,
        role
      });
      console.log(`Compte créé pour : ${userData.email} (role: ${role})`);
    }
    console.log('Import terminé.');
    process.exit(0);
  } catch (err) {
    console.error("Erreur lors de l'import :", err);
    process.exit(1);
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node script/importUsers.js <chemin_du_fichier>");
  process.exit(1);
}

importUsers(filePath);
