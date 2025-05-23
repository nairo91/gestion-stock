// script/createAdmin.js
const { sequelize } = require('../models');
const User        = require('../models/User');

/* ─── informations du compte Bastien ─── */
const ADMIN_DATA = {
  nom     : 'Bastien Giry',
  email   : 'giry.bastien@batirenov.info',
  password: 'BastienBR91Giry',  // en clair : sera hashé par le hook
  role    : 'admin'
};

(async function createAdmin() {
  try {
    // 1) Synchronise la base (crée la table si besoin)
    await sequelize.sync();

    // 2) Crée ou met à jour l’utilisateur
    const [user, created] = await User.findOrCreate({
      where:   { email: ADMIN_DATA.email },
      defaults: ADMIN_DATA
    });

    if (!created) {
      // Si déjà présent, on met à jour nom, mot de passe, rôle
      user.nom      = ADMIN_DATA.nom;
      user.password = ADMIN_DATA.password;
      user.role     = ADMIN_DATA.role;
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
