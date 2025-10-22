const express = require('express');
const router = express.Router();

const Materiel = require('../models/Materiel');
const MaterielChantier = require('../models/MaterielChantier');
const Chantier = require('../models/Chantier');
const { ensureAuthenticated } = require('../middleware/auth');

function normalizeCode(code) {
  if (typeof code !== 'string') {
    return '';
  }
  return code.replace(/\u00A0/g, ' ').trim();
}

async function resolveCode(req, res, sourceCode) {
  const code = normalizeCode(sourceCode);

  if (!code) {
    return res.render('scan/notfound', { code: '', matches: [] });
  }

  const matMatch = code.match(/^MAT_(\d+)$/i);
  if (matMatch) {
    return res.redirect(`/materiel/info/${matMatch[1]}`);
  }

  const mcMatch = code.match(/^MC_(\d+)$/i);
  if (mcMatch) {
    return res.redirect(`/chantier/materielChantier/info/${mcMatch[1]}`);
  }

  const [materiels, materielChantiers] = await Promise.all([
    Materiel.findAll({ where: { barcode: code } }),
    MaterielChantier.findAll({
      where: { barcode: code },
      include: [
        { model: Chantier, as: 'chantier' },
        { model: Materiel, as: 'materiel' }
      ]
    })
  ]);

  const matches = [];

  materiels.forEach(m => {
    matches.push({
      type: 'materiel',
      id: m.id,
      label: m.nom ? `${m.nom} (Dépôt)` : `Matériel dépôt #${m.id}`,
      url: `/materiel/info/${m.id}`
    });
  });

  materielChantiers.forEach(mc => {
    const materielLabel = mc.materiel && mc.materiel.nom ? mc.materiel.nom : `Matériel #${mc.materielId || mc.id}`;
    const chantierLabel = mc.chantier && mc.chantier.nom ? mc.chantier.nom : `Chantier #${mc.chantierId || mc.id}`;

    matches.push({
      type: 'materielChantier',
      id: mc.id,
      label: `${materielLabel} – ${chantierLabel}`,
      url: `/chantier/materielChantier/info/${mc.id}`
    });
  });

  if (matches.length === 0) {
    return res.render('scan/notfound', { code, matches });
  }

  if (matches.length === 1) {
    return res.redirect(matches[0].url);
  }

  return res.render('scan/multiples', { code, matches });
}

router.get('/', ensureAuthenticated, async (req, res) => {
  const code = normalizeCode(req.query.code);

  if (code) {
    try {
      return await resolveCode(req, res, code);
    } catch (error) {
      console.error('Erreur lors de la résolution du code (page scan) :', error);
      return res.status(500).render('scan/notfound', { code, matches: [] });
    }
  }

  return res.render('scan/index', { code: '', csrfToken: req.csrfToken?.() });
});

router.post('/resolve', ensureAuthenticated, async (req, res) => {
  try {
    return await resolveCode(req, res, req.body && (req.body.code || req.body.barcode));
  } catch (error) {
    console.error('Erreur lors de la résolution du code scanné :', error);
    return res.status(500).render('scan/notfound', { code: '', matches: [] });
  }
});

router.get('/resolve', ensureAuthenticated, async (req, res) => {
  try {
    return await resolveCode(req, res, req.query && (req.query.code || req.query.barcode));
  } catch (error) {
    console.error('Erreur lors de la résolution du code (GET) :', error);
    return res.status(500).render('scan/notfound', { code: '', matches: [] });
  }
});

module.exports = router;
