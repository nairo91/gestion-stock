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

const SPOKEN_NUMBER_UNITS = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16
};

const SPOKEN_NUMBER_TENS = {
  vingt: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  septante: 70,
  huitante: 80,
  nonante: 90
};

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

function parseFrenchSpokenNumber(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return toInt(normalized);
  }

  // Remove 'et' connector (vingt et un → vingt un) to simplify pattern matching
  const tokens = normalized.split(' ').filter(t => t && t !== 'et');
  if (!tokens.length) {
    return null;
  }

  function isUnit(t) {
    return Object.prototype.hasOwnProperty.call(SPOKEN_NUMBER_UNITS, t);
  }
  function isTens(t) {
    return Object.prototype.hasOwnProperty.call(SPOKEN_NUMBER_TENS, t);
  }

  // Single token: 0-16, tens (20-90), cent, mille
  if (tokens.length === 1) {
    const t = tokens[0];
    if (isUnit(t)) return SPOKEN_NUMBER_UNITS[t];
    if (isTens(t)) return SPOKEN_NUMBER_TENS[t];
    if (t === 'cent') return 100;
    if (t === 'mille') return 1000;
    return null;
  }

  // Two tokens
  if (tokens.length === 2) {
    // quatre-vingts (80)
    if (tokens[0] === 'quatre' && (tokens[1] === 'vingt' || tokens[1] === 'vingts')) return 80;
    // dix-sept / dix-huit / dix-neuf (17-19)
    if (tokens[0] === 'dix' && isUnit(tokens[1])) return 10 + SPOKEN_NUMBER_UNITS[tokens[1]];
    // tens + unit: vingt-deux (22), soixante-dix (70) …
    if (isTens(tokens[0]) && isUnit(tokens[1])) return SPOKEN_NUMBER_TENS[tokens[0]] + SPOKEN_NUMBER_UNITS[tokens[1]];
    // cent + unit (101-116) or cent + tens (120-190)
    if (tokens[0] === 'cent') {
      if (isUnit(tokens[1])) return 100 + SPOKEN_NUMBER_UNITS[tokens[1]];
      if (isTens(tokens[1])) return 100 + SPOKEN_NUMBER_TENS[tokens[1]];
    }
    // X cent(s) (200, 300 … 900)
    if ((tokens[1] === 'cent' || tokens[1] === 'cents') && isUnit(tokens[0])) {
      return SPOKEN_NUMBER_UNITS[tokens[0]] * 100;
    }
    return null;
  }

  // Three tokens
  if (tokens.length === 3) {
    // quatre-vingt-X (81-89) and quatre-vingt-dix (90)
    if (tokens[0] === 'quatre' && (tokens[1] === 'vingt' || tokens[1] === 'vingts')) {
      if (tokens[2] === 'dix') return 90;
      if (isUnit(tokens[2])) return 80 + SPOKEN_NUMBER_UNITS[tokens[2]];
      return null;
    }
    // soixante-dix-sept / huit / neuf (77-79)
    if (tokens[0] === 'soixante' && tokens[1] === 'dix' && isUnit(tokens[2])) {
      return 70 + SPOKEN_NUMBER_UNITS[tokens[2]];
    }
    // cent + tens + unit (cent vingt trois = 123)
    if (tokens[0] === 'cent' && isTens(tokens[1]) && isUnit(tokens[2])) {
      return 100 + SPOKEN_NUMBER_TENS[tokens[1]] + SPOKEN_NUMBER_UNITS[tokens[2]];
    }
    // X cent(s) + unit or tens (deux cent cinq = 205, deux cent vingt = 220)
    if ((tokens[1] === 'cent' || tokens[1] === 'cents') && isUnit(tokens[0])) {
      const base = SPOKEN_NUMBER_UNITS[tokens[0]] * 100;
      if (isUnit(tokens[2])) return base + SPOKEN_NUMBER_UNITS[tokens[2]];
      if (isTens(tokens[2])) return base + SPOKEN_NUMBER_TENS[tokens[2]];
      return null;
    }
    return null;
  }

  // Four tokens
  if (tokens.length === 4) {
    // quatre-vingt-dix-X (91-99)
    if (
      tokens[0] === 'quatre' &&
      (tokens[1] === 'vingt' || tokens[1] === 'vingts') &&
      tokens[2] === 'dix' &&
      isUnit(tokens[3])
    ) {
      return 90 + SPOKEN_NUMBER_UNITS[tokens[3]];
    }
    // X cent(s) + tens + unit (deux cent vingt trois = 223)
    if (
      (tokens[1] === 'cent' || tokens[1] === 'cents') &&
      isUnit(tokens[0]) &&
      isTens(tokens[2]) &&
      isUnit(tokens[3])
    ) {
      return SPOKEN_NUMBER_UNITS[tokens[0]] * 100 + SPOKEN_NUMBER_TENS[tokens[2]] + SPOKEN_NUMBER_UNITS[tokens[3]];
    }
    return null;
  }

  return null;
}

function extractSpokenQuantity(value) {
  const rawAnswer = compactText(value);
  const normalizedAnswer = normalizeText(rawAnswer);
  let parsedQuantity = null;

  const digitMatch = normalizedAnswer.match(/\b(\d+)\b/);
  if (digitMatch) {
    parsedQuantity = toInt(digitMatch[1]);
  } else {
    const tokens = normalizedAnswer.split(' ').filter(Boolean);
    for (let startIndex = 0; startIndex < tokens.length && parsedQuantity == null; startIndex += 1) {
      const maxWindow = Math.min(4, tokens.length - startIndex);
      for (let windowSize = maxWindow; windowSize >= 1; windowSize -= 1) {
        const fragment = tokens.slice(startIndex, startIndex + windowSize).join(' ');
        const candidate = parseFrenchSpokenNumber(fragment);
        if (candidate != null) {
          parsedQuantity = candidate;
          break;
        }
      }
    }
  }

  console.info('[voice] raw answer:', rawAnswer);
  console.info('[voice] normalized answer:', normalizedAnswer);
  console.info('[voice] parsed quantity:', parsedQuantity);

  return parsedQuantity;
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
  extractSpokenQuantity,
  formatCandidateLabel,
  normalizeText,
  parseFrenchSpokenNumber,
  tokenize,
  toInt
};
