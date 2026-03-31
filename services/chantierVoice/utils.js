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
  soixante: 60
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

  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) {
    return null;
  }

  if (tokens.length === 1) {
    if (Object.prototype.hasOwnProperty.call(SPOKEN_NUMBER_UNITS, tokens[0])) {
      return SPOKEN_NUMBER_UNITS[tokens[0]];
    }
    if (Object.prototype.hasOwnProperty.call(SPOKEN_NUMBER_TENS, tokens[0])) {
      return SPOKEN_NUMBER_TENS[tokens[0]];
    }
    return null;
  }

  if (tokens[0] === 'dix' && tokens.length === 2 && Object.prototype.hasOwnProperty.call(SPOKEN_NUMBER_UNITS, tokens[1])) {
    return 10 + SPOKEN_NUMBER_UNITS[tokens[1]];
  }

  if (!Object.prototype.hasOwnProperty.call(SPOKEN_NUMBER_TENS, tokens[0])) {
    return null;
  }

  const base = SPOKEN_NUMBER_TENS[tokens[0]];
  if (tokens.length === 2 && Object.prototype.hasOwnProperty.call(SPOKEN_NUMBER_UNITS, tokens[1])) {
    return base + SPOKEN_NUMBER_UNITS[tokens[1]];
  }

  if (
    tokens.length === 3 &&
    tokens[1] === 'et' &&
    Object.prototype.hasOwnProperty.call(SPOKEN_NUMBER_UNITS, tokens[2])
  ) {
    return base + SPOKEN_NUMBER_UNITS[tokens[2]];
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
