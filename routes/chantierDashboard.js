// routes/chantierDashboard.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { Chantier, MaterielChantier, Materiel } = require('../models');
const { ensureAuthenticated } = require('./materiel'); // tu as déjà ce middleware

const LOW_STOCK_THRESHOLD = 3;

// Fonction utilitaire : construit les données pour l'histogramme
function buildHistogramData(mouvements, chantier) {
  if (!chantier || !mouvements || !mouvements.length) {
    return { labels: [], values: [] };
  }

  const start = chantier.createdAt || mouvements[mouvements.length - 1].createdAt;
  const startDate = new Date(start);
  const endDate = new Date();

  const byDay = {};

  mouvements.forEach(m => {
    const d = m.updatedAt || m.createdAt;
    const dayKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!byDay[dayKey]) byDay[dayKey] = 0;
    // On utilise ici la quantité actuelle comme “poids” du mouvement
    byDay[dayKey] += Number(m.quantite || 0);
  });

  const labels = [];
  const values = [];

  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    const labelFr = cursor.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short'
    });

    labels.push(labelFr);
    values.push(byDay[key] || 0);

    cursor.setDate(cursor.getDate() + 1);
  }

  return { labels, values };
}

router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    const chantiers = await Chantier.findAll({
      order: [['nom', 'ASC']]
    });

    const chantierId = req.query.chantierId || (chantiers[0] && chantiers[0].id);

    let chantier = null;
    let alertes = [];
    let derniersMouvements = [];
    let histogramData = { labels: [], values: [] };

    if (chantierId) {
      chantier = await Chantier.findByPk(chantierId);

      // 1) Alertes quantités pour le chantier sélectionné
      alertes = await MaterielChantier.findAll({
        where: { chantierId },
        include: [{ model: Materiel, as: 'materiel' }],
        order: [['quantite', 'ASC']]
      });

      // On considère qu'une alerte = quantite < quantitePrevue
      // et on filtre ici côté JS dans la vue si besoin.

      // 2) “Derniers mouvements” = dernières lignes modifiées sur ce chantier
      derniersMouvements = await MaterielChantier.findAll({
        where: { chantierId },
        include: [{ model: Materiel, as: 'materiel' }],
        order: [['updatedAt', 'DESC']],
        limit: 10
      });

      // 3) Histogramme basé sur l'évolution des MaterielChantier
      const mouvementsPourHistogramme = await MaterielChantier.findAll({
        where: { chantierId },
        order: [['updatedAt', 'ASC']]
      });

      histogramData = buildHistogramData(mouvementsPourHistogramme, chantier);
    }

    res.render('chantier/dashboard', {
      user: req.user,
      chantiers,
      chantier,
      chantierId,
      alertes,
      derniersMouvements,
      histogramData,
      LOW_STOCK_THRESHOLD
    });
  } catch (err) {
    console.error('Erreur /chantier/dashboard :', err);
    res.status(500).send('Erreur lors du chargement du dashboard chantier.');
  }
});

module.exports = router;
