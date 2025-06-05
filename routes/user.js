//routes/user.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { ensureAuthenticated, checkAdmin } = require('../middleware/auth');

// Modifier le rôle d’un utilisateur
router.post('/changer-role/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const user = await User.scope('withPassword').findByPk(req.params.id);
    if (!user) return res.status(404).send("Utilisateur introuvable.");

    const nouveauRole = req.body.role;
    if (!['user', 'admin'].includes(nouveauRole)) {
      return res.status(400).send("Rôle invalide.");
    }

    user.role = nouveauRole;
    await user.save();
    res.redirect('/depot'); // ou la bonne redirection
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur serveur.");
  }
});

// Afficher tous les utilisateurs (interface admin)
router.get('/user/gestion', ensureAuthenticated, checkAdmin, async (req, res) => {
  try {
    const users = await User.findAll();
    res.render('user/gestion', { users });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors du chargement des utilisateurs.");
  }
});

module.exports = router;
