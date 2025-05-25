// routes/emplacements.js
const express = require('express');
const router  = express.Router();
const { Emplacement, Chantier } = require('../models');
const { ensureAuthenticated, checkAdmin } = require('./materiel');

// Liste (avec filtre chantier optionnel)
router.get('/', ensureAuthenticated, async (req, res) => {
  const { chantierId } = req.query;
  const where = {};
  if (chantierId) where.chantierId = chantierId;
  const emplacements = await Emplacement.findAll({
    where,
    include: [{ model: Chantier, as: 'chantier' }]
  });
  const chantiers = await Chantier.findAll();
  res.render('emplacements/index', { emplacements, chantiers, query: req.query });
});

// Formulaire ajout
router.get('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
  const chantiers = await Chantier.findAll();
  res.render('emplacements/ajouter', { chantiers });
});

// Traitement ajout
router.post('/ajouter', ensureAuthenticated, checkAdmin, async (req, res) => {
  const { nom, description, chantierId } = req.body;
  await Emplacement.create({ nom, description, chantierId });
  res.redirect('/emplacements');
});

// Formulaire modification
router.get('/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  const emplacement = await Emplacement.findByPk(req.params.id);
  const chantiers = await Chantier.findAll();
  res.render('emplacements/modifier', { emplacement, chantiers });
});

// Traitement modification
router.post('/modifier/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  const { nom, description, chantierId } = req.body;
  const emp = await Emplacement.findByPk(req.params.id);
  emp.nom         = nom;
  emp.description = description;
  emp.chantierId  = chantierId;
  await emp.save();
  res.redirect('/emplacements');
});

// Suppression
router.post('/supprimer/:id', ensureAuthenticated, checkAdmin, async (req, res) => {
  await Emplacement.destroy({ where: { id: req.params.id } });
  res.redirect('/emplacements');
});

module.exports = router;