// script/importUsers.js
const fs        = require('fs');
const readline  = require('readline');
const { sequelize } = require('../models');
const User      = require('../models/User');

/* ─── listes d’administrateurs ─── */
const ADMIN_EMAILS = [
  'mirona.rn@batirenov.info',
  'rouault.remy@batirenov.info',
  'blot.valentin@batirenov.info',
  'launay.jeremy@batirenov.info'
];

async function importUsers(filePath) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const batch = [];
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber++;

    if (!line.trim()) continue;                 // vide
    if (lineNumber === 1)  continue;            // en-tête

    const parts = line.split(';');
    if (parts.length < 7) {
      console.error(`Ligne ${lineNumber} ignorée (colonnes insuffisantes)`);
      continue;
    }

    const nom   = (parts[1] || '').trim();
    const prenom= (parts[2] || '').trim();
    const email = (parts[4] || '').trim();
    const pwd   = (parts[6] || '').replace(/MDP.?[:\s]*/i, '').trim();

    if (!email || !pwd) {
      console.error(`Ligne ${lineNumber} : email ou mdp manquant`);
      continue;
    }

    batch.push({
      nom : `${nom} ${prenom}`.trim(),
      email,
      password: pwd,                    // mot de passe EN CLAIR (hook ➜ hash)
      role: ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user'
    });
  }

  try {
    await sequelize.sync();             // s’assure que la table existe

    for (const data of batch) {
      const exists = await User.findOne({ where: { email: data.email } });
      if (exists) continue;
      await User.create(data);
      console.log(`✓ ${data.email} (role ${data.role})`);
    }
    console.log('Import terminé 🎉');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

/* ─── lance le script ─── */
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node script/importUsers.js <chemin_csv>');
  process.exit(1);
}
importUsers(filePath);
