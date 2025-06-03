// routes/emplacements.js
const express = require('express');
const router  = express.Router();
const { Emplacement, Chantier } = require('../models');
const { ensureAuthenticated, checkAdmin } = require('./materiel');
const { Op } = require("sequelize");


// Liste (avec filtre chantier optionnel)
router.get('/', ensureAuthenticated, async (req, res) => {
  const { chantierId } = req.query;
  const where = {};
  if (chantierId) where.chantierId = chantierId;
 const emplacements = await Emplacement.findAll({
  where,
  include: [
    { model: Chantier, as: 'chantier' },
    { model: Emplacement, as: 'parent' }
  ]
});

  const chantiers = await Chantier.findAll();
  res.render('emplacements/index', { emplacements, chantiers, query: req.query });
});

// Formulaire ajout
router.get('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
  const chantiers = await Chantier.findAll();
  const emplacements = await Emplacement.findAll(); // ← pour afficher les parents possibles
  res.render('emplacements/ajouter', { chantiers, emplacements });
});

// Traitement ajout
router.post('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
 const { nom, description, chantierId, parentId } = req.body;
await Emplacement.create({
  nom,
  description,
  chantierId,
  parentId: parentId || null
});

  res.redirect('/emplacements');
});

// Formulaire modification
router.get('/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  const emplacement = await Emplacement.findByPk(req.params.id);
  const chantiers = await Chantier.findAll();

  // Tous les emplacements sauf celui qu'on modifie
  const emplacements = await Emplacement.findAll({
    where: {
      id: { [Op.ne]: req.params.id }
    }
  });

  res.render('emplacements/modifier', { emplacement, chantiers, emplacements });
});


// Traitement modification
router.post('/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
 const { nom, description, chantierId, parentId } = req.body;
const emp = await Emplacement.findByPk(req.params.id);
emp.nom         = nom;
emp.description = description;
emp.chantierId  = chantierId;
emp.parentId    = parentId || null;
await emp.save();

  res.redirect('/emplacements');
});

// Suppression
router.post('/supprimer/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  await Emplacement.destroy({ where: { id: req.params.id } });
  res.redirect('/emplacements');
});

module.exports = router;