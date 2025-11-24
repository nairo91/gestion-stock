// routes/chantierDashboard.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { Chantier, MaterielChantier, Materiel } = require('../models');
const { ensureAuthenticated } = require('./materiel'); // tu as déjà ce middleware

const LOW_STOCK_THRESHOLD = 3;

// Histogramme mensuel par catégorie (Qté / Qté prévue)
function buildHistogramData(materielChantiers, chantier) {
  if (!chantier) {
    return { labels: [], datasets: [] };
  }
  if (!materielChantiers || !materielChantiers.length) {
    return { labels: [], datasets: [] };
  }

  // Début : 1er jour du mois de création du chantier
  const start = new Date(chantier.createdAt);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  // Fin : mois courant
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  end.setHours(0, 0, 0, 0);

  const monthKeys = [];
  const monthsData = {};
  const categoriesSet = new Set();

  // On prépare la liste de tous les mois entre start et end
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    monthKeys.push(key);
    monthsData[key] = {};
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Agrégation par mois + catégorie
  materielChantiers.forEach(mc => {
    const mat = mc.materiel || {};
    const categorie = mat.categorie || 'Non catégorisé';

    categoriesSet.add(categorie);

    const createdAt = mc.createdAt ? new Date(mc.createdAt) : start;
    const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;

    if (!monthsData[key]) {
      // En dehors de la plage de mois (avant création chantier par ex.)
      return;
    }

    if (!monthsData[key][categorie]) {
      monthsData[key][categorie] = {
        quantite: 0,
        quantitePrevue: 0
      };
    }

    const q = mc.quantite != null ? Number(mc.quantite) : 0;
    const qp = mc.quantitePrevue != null ? Number(mc.quantitePrevue) : 0;

    monthsData[key][categorie].quantite += q;
    monthsData[key][categorie].quantitePrevue += qp;
  });

  // Labels = mois (ex: "janv. 24")
  const labels = monthKeys.map(key => {
    const [yearStr, monthStr] = key.split('-');
    const d = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  });

  const categories = Array.from(categoriesSet).sort();
  const datasets = [];

  // Pour chaque catégorie, on crée 2 datasets : Qté et Qté prévue
  categories.forEach(categorie => {
    const dataQuantite = monthKeys.map(key => {
      const catData = monthsData[key][categorie];
      return catData ? catData.quantite : 0;
    });

    const dataQuantitePrevue = monthKeys.map(key => {
      const catData = monthsData[key][categorie];
      return catData ? catData.quantitePrevue : 0;
    });

    datasets.push({
      label: `${categorie} (Qté)`,
      data: dataQuantite,
      stack: 'quantite'
    });

    datasets.push({
      label: `${categorie} (Qté prévue)`,
      data: dataQuantitePrevue,
      stack: 'quantitePrevue'
    });
  });

  return { labels, datasets };
}

router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const chantiers = await Chantier.findAll({
      order: [['nom', 'ASC']]
    });

    let chantierId = req.query.chantierId;
    if (chantierId) {
      const parsed = parseInt(String(chantierId), 10);
      chantierId = !Number.isNaN(parsed) ? parsed : null;
    }

    if (!chantierId && chantiers[0]) {
      chantierId = chantiers[0].id;
    }

    let chantier = null;
    let alertes = [];
    let derniersMouvements = [];
    let histogramData = { labels: [], datasets: [] };

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

      // 3) Histogramme par mois et par catégorie (Qté / Qté prévue)
      // On réutilise la liste complète materiel_chantiers (alertes) pour agréger
      histogramData = buildHistogramData(alertes, chantier);
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
