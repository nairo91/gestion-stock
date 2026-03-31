function normalizeText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const STOP_WORDS = new Set([
  'a',
  'ai',
  'au',
  'aux',
  'avec',
  'de',
  'des',
  'du',
  'en',
  'et',
  'fiche',
  'info',
  'infos',
  'la',
  'le',
  'les',
  'ligne',
  'materiel',
  'moi',
  'modifier',
  'modifie',
  'montre',
  'ouvre',
  'ouvrir',
  'pour',
  'que',
  'quoi',
  'recevoir',
  'reception',
  'receptionner',
  'sur',
  'supprime',
  'supprimer',
  'un',
  'une',
  'voir'
]);

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter(token => token && !STOP_WORDS.has(token));
}

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatCandidateLabel(candidate) {
  const parts = [
    candidate.nom,
    candidate.chantierNom,
    candidate.categorie,
    candidate.fournisseur
  ].filter(Boolean);
  return parts.join(' • ');
}

module.exports = {
  compactText,
  formatCandidateLabel,
  normalizeText,
  tokenize,
  toInt
};
