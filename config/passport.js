// config/passport.js
const LocalStrategy = require('passport-local').Strategy;
const bcrypt        = require('bcryptjs');
const { User }      = require('../models');

module.exports = function (passport) {
  /*─────────────────────────────────────────────*
   * STRATÉGIE « e-mail / mot de passe »          *
   *─────────────────────────────────────────────*/
  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        try {
          // on inclut la colonne password grâce au scope défini dans le modèle
          const user = await User.scope('withPassword').findOne({ where: { email } });

          if (!user) {
            return done(null, false, { message: 'Email inconnu' });
          }

          const ok = await bcrypt.compare(password, user.password);
          if (!ok) {
            return done(null, false, { message: 'Mot de passe incorrect' });
          }

          // on retire le hash avant de renvoyer l’objet en session
          const safeUser = user.get({ plain: true });
          delete safeUser.password;
          return done(null, safeUser);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  /*─────────────────────────────────────────────*
   * SÉRIALISATION / DÉSÉRIALISATION             *
   *─────────────────────────────────────────────*/
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
