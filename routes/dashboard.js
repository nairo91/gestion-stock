// routes/dashboard.js
const express = require('express');
const router = express.Router();
const { Op, fn, col, literal } = require('sequelize');

const {
  Materiel,
  Vehicule,
  Chantier,
  Historique,
  MaterielChantier
} = require('../models');

// On réutilise le même middleware d'auth que le reste
const { ensureAuthenticated } = require('./materiel');

const LOW_STOCK_THRESHOLD = 5; // tu peux adapter

// Utilitaire : construit des données simples pour le graphique Entrées / Sorties
function buildChartData(rows) {
  const byDay = {};

  rows.forEach((h) => {
    const r = h.get({ plain: true });
    const date = r.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD

    if (!byDay[date]) {
      byDay[date] = { in: 0, out: 0 };
    }

    const oldQ = r.oldQuantite != null ? Number(r.oldQuantite) : null;
    const newQ = r.newQuantite != null ? Number(r.newQuantite) : null;

    // On essaie d’interpréter le mouvement
    if (oldQ === null && newQ !== null) {
      // Création de stock
      byDay[date].in += newQ;
    } else if (oldQ !== null && newQ !== null) {
      const diff = newQ - oldQ;
      if (diff > 0) {
        byDay[date].in += diff;
      } else if (diff < 0) {
        byDay[date].out += Math.abs(diff);
      }
    }
  });

  const labels = Object.keys(byDay).sort();
  const entrees = labels.map((d) => byDay[d].in);
  const sorties = labels.map((d) => byDay[d].out);

  return { labels, entrees, sorties };
}

// GET /dashboard
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const depotWhere = { vehiculeId: null, chantierId: null };

    const [
      // Matériels en stock critique dépôt
      lowStock,
      // Stats dépôt
      depotCount,
      depotValueRows,
      // Stats véhicules
      vehiculeCount,
      vehiculeMaterielCount,
      // Stats chantiers
      chantierCount,
      chantierMaterielCount,
      // Historique pour la liste
      derniersMouvements,
      // Historique pour le graphique (fenêtre de quelques semaines)
      historiqueForChart
    ] = await Promise.all([
      Materiel.findAll({
        where: {
          ...depotWhere,
          quantite: {
            [Op.gt]: 0,
            [Op.lt]: LOW_STOCK_THRESHOLD
          }
        },
        order: [['quantite', 'ASC']],
        limit: 10
      }),
      Materiel.count({ where: depotWhere }),
      Materiel.findAll({
        where: depotWhere,
        attributes: [
          [
            // valeur théorique du stock dépôt = SUM(quantite * COALESCE(prix, 0))
            literal('SUM("Materiel"."quantite" * COALESCE("Materiel"."prix", 0))'),
            'totalValue'
          ]
        ]
      }),
      Vehicule.count(),
      Materiel.count({ where: { vehiculeId: { [Op.ne]: null } } }),
      Chantier.count(),
      MaterielChantier.count(),
      Historique.findAll({
        include: [{ model: Materiel, as: 'materiel' }],
        order: [['createdAt', 'DESC']],
        limit: 15
      }),
      Historique.findAll({
        order: [['createdAt', 'DESC']],
        limit: 200
      })
    ]);

    const depotValue =
      depotValueRows && depotValueRows[0]
        ? Number(depotValueRows[0].get('totalValue') || 0)
        : 0;

    const chartData = buildChartData(historiqueForChart);

    res.render('dashboard/index', {
      user: req.user,
      lowStock,
      depotStats: {
        count: depotCount,
        value: depotValue
      },
      vehiculeStats: {
        count: vehiculeCount,
        materiels: vehiculeMaterielCount
      },
      chantierStats: {
        count: chantierCount,
        materiels: chantierMaterielCount
      },
      derniersMouvements,
      chartData,
      lowStockThreshold: LOW_STOCK_THRESHOLD
    });
  } catch (error) {
    console.error('Erreur /dashboard :', error);
    res.status(500).send('Erreur lors du chargement du dashboard.');
  }
});

module.exports = router;
