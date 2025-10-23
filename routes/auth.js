// routes/auth.js
const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// (Suppression ou commentaire des routes d'inscription)
// router.get('/register', (req, res) => {
//     res.render('register', { errors: req.flash('error') });
// });

// router.post('/register', async (req, res) => {
//     const { nom, email, password, password2 } = req.body;
//     let errors = [];

//     if (!nom || !email || !password || !password2) {
//         errors.push('Veuillez remplir tous les champs');
//     }
//     if (password !== password2) {
//         errors.push('Les mots de passe ne correspondent pas');
//     }
//     if (errors.length > 0) {
//         req.flash('error', errors);
//         return res.redirect('/auth/register');
//     }
//     try {
//         let user = await User.findOne({ where: { email } });
//         if (user) {
//             req.flash('error', 'Email déjà utilisé');
//             return res.redirect('/auth/register');
//         }
//         const hashedPassword = await bcrypt.hash(password, 10);
//         await User.create({ nom, email, password: hashedPassword });
//         res.redirect('/auth/login');
//     } catch (err) {
//         console.error(err);
//         res.redirect('/auth/register');
//     }
// });

// Page de connexion
router.get('/login', (req, res) => {
    res.render('login', { errors: req.flash('error') });
});

// Traitement de la connexion
router.post('/login',
    passport.authenticate('local', {
        failureRedirect: '/auth/login',
        failureFlash: true
    }),
    (req, res) => {
        const redirectUrl = (req.session && req.session.returnTo) || '/materiel';
        if (req.session) {
            delete req.session.returnTo;
        }
        return res.redirect(redirectUrl);
    }
);

// Déconnexion (passer en POST)
router.post('/logout', (req, res, next) => {
  console.log("Début du logout...");
  // Passport 0.4.x : req.logout() est synchrone
  req.logout();
  req.session.destroy(err => {
    if (err) {
      console.error("Erreur lors de la destruction de la session :", err);
      return next(err);
    }
    res.clearCookie('connect.sid', { path: '/' });
    console.log("Logout terminé, redirection vers /auth/login");
    return res.redirect('/auth/login');
  });
});






// Route GET : Affiche le formulaire de configuration du mot de passe
router.get('/set-password/:email', async (req, res) => {
    const { email } = req.params;
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.send("Utilisateur non trouvé.");
      }
      res.render('auth/set-password', { email });
    } catch (error) {
      console.error(error);
      res.send("Erreur lors de la récupération de l'utilisateur.");
    }
  });
  
  // Route POST : Traite le formulaire et met à jour le mot de passe
  router.post('/set-password/:email', async (req, res) => {
    const { email } = req.params;
    const { password } = req.body;
    if (!password) {
      return res.send("Veuillez fournir un mot de passe.");
    }
    try {
      // Hash du nouveau mot de passe
      const hash = await bcrypt.hash(password, 10);
      await User.update({ password: hash }, { where: { email } });
      res.send("Mot de passe configuré avec succès.");
    } catch (error) {
      console.error(error);
      res.send("Erreur lors de la configuration du mot de passe.");
    }
  });

module.exports = router;
