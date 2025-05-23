// src/script/createAdmin.js
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../models');

(async () => {
  try {
    const hash = await bcrypt.hash('BastienBR91Giry', 10);

    // Synchronise la base (création des tables si nécessaire)
    await sequelize.sync();

    // Crée ou mets à jour l’utilisateur
    const [user, created] = await User.findOrCreate({
      where: { email: 'giry.bastien@batirenov.info' },
      defaults: {
        nom     : 'Bastien Giry',
        password: hash,
        role    : 'admin'
      }
    });

    if (!created) {
      user.nom      = 'Bastien Giry';
      user.password = hash;
      user.role     = 'admin';
      await user.save();
      console.log('✓ Utilisateur existant mis à jour en admin');
    } else {
      console.log('✓ Nouvel utilisateur admin créé');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
