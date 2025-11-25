// routes/chantierDashboard.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { Chantier, MaterielChantier, Materiel } = require('../models');
const { ensureAuthenticated } = require('./materiel'); // tu as déjà ce middleware

const LOW_STOCK_THRESHOLD = 3;

// Normalise une catégorie : minuscules, accents supprimés, espaces enlevés
const normalizeCat = str =>
  str
    .normalize('NFD') // décompose les accents
    .replace(/[\u0300-\u036f]/g, '') // supprime les diacritiques
    .toLowerCase() // met en minuscules
    .trim(); // enlève espaces

// Histogramme mensuel pour UNE catégorie : 2 séries (Qté / Qté prévue)
function buildHistogramData(materielChantiers, chantier, selectedCategorie) {
  if (!chantier) {
    return { labels: [], quantite: [], quantitePrevue: [] };
  }
  if (!materielChantiers || !materielChantiers.length) {
    return { labels: [], quantite: [], quantitePrevue: [] };
  }

  const categorieFiltre =
    selectedCategorie && selectedCategorie !== 'ALL'
      ? normalizeCat(selectedCategorie)
      : null;

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

  // On prépare la liste de tous les mois entre start et end
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    monthKeys.push(key);
    monthsData[key] = {
      quantite: 0,
      quantitePrevue: 0
    };
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Agrégation par mois pour la catégorie sélectionnée (ou toutes)
  materielChantiers.forEach(mc => {
    const mat = mc.materiel || {};
    const categorie = mat.categorie || 'Non catégorisé';
    const categorieNormalisee = mat.categorie ? normalizeCat(categorie) : 'non_categorise';

    if (categorieFiltre && categorieNormalisee !== categorieFiltre) {
      return;
    }

    const createdAt = mc.createdAt ? new Date(mc.createdAt) : start;
    const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;

    if (!monthsData[key]) {
      // En dehors de la plage de mois (avant création chantier par ex.)
      return;
    }

    const q = mc.quantite != null ? Number(mc.quantite) : 0;
    const qp = mc.quantitePrevue != null ? Number(mc.quantitePrevue) : 0;

    monthsData[key].quantite += q;
    monthsData[key].quantitePrevue += qp;
  });

  // Labels = mois (ex: "janv. 24")
  const labels = monthKeys.map(key => {
    const [yearStr, monthStr] = key.split('-');
    const d = new Date(Number(yearStr), Number(monthStr) - 1, 1);
    return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  });

  const quantite = monthKeys.map(key => monthsData[key].quantite || 0);
  const quantitePrevue = monthKeys.map(key => monthsData[key].quantitePrevue || 0);

  return { labels, quantite, quantitePrevue };
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

    const selectedCategorie =
      req.query.categorie && req.query.categorie.trim() !== ''
        ? req.query.categorie.trim()
        : 'ALL';
    const selectedCategorieNormalisee =
      selectedCategorie && selectedCategorie !== 'ALL'
        ? normalizeCat(selectedCategorie)
        : null;

    let chantier = null;
    let alertes = [];
    let derniersMouvements = [];
    let histogramData = { labels: [], quantite: [], quantitePrevue: [] };
    let categoriesDisponibles = [];

    if (chantierId) {
      chantier = await Chantier.findByPk(chantierId);

      // 1) Alertes quantités pour le chantier sélectionné
      alertes = await MaterielChantier.findAll({
        where: { chantierId },
        include: [{ model: Materiel, as: 'materiel' }],
        order: [['quantite', 'ASC']]
      });

      // Liste des catégories disponibles sur ce chantier
      const categorieMap = new Map();
      alertes.forEach(mc => {
        const categorieBrute = mc.materiel && mc.materiel.categorie ? mc.materiel.categorie : null;
        if (!categorieBrute) return;
        const categorieTrim = categorieBrute.trim();
        if (!categorieTrim) return;

        const categorieKey = normalizeCat(categorieTrim);
        if (!categorieMap.has(categorieKey)) {
          categorieMap.set(categorieKey, categorieTrim);
        }
      });

      categoriesDisponibles = Array.from(categorieMap.entries())
        .map(([norm, label]) => ({ norm, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

      // On considère qu'une alerte = quantite < quantitePrevue
      // et on filtre ici côté JS dans la vue si besoin.

      // 2) “Derniers mouvements” = dernières lignes modifiées sur ce chantier
      derniersMouvements = await MaterielChantier.findAll({
        where: { chantierId },
        include: [{ model: Materiel, as: 'materiel' }],
        order: [['updatedAt', 'DESC']],
        limit: 10
      });

      // 3) Histogramme par mois pour la catégorie sélectionnée (ou toutes)
      histogramData = buildHistogramData(alertes, chantier, selectedCategorie);
    }

    res.render('chantier/dashboard', {
      user: req.user,
      chantiers,
      chantier,
      chantierId,
      alertes,
      derniersMouvements,
      histogramData,
      categoriesDisponibles,
      selectedCategorie,
      selectedCategorieNormalisee,
      LOW_STOCK_THRESHOLD
    });
  } catch (err) {
    console.error('Erreur /chantier/dashboard :', err);
    res.status(500).send('Erreur lors du chargement du dashboard chantier.');
  }
});

module.exports = router;
