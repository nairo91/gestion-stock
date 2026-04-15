const { compactText, formatCandidateLabel, normalizeText, tokenize, toInt } = require('./utils');

function serializeCandidate(row) {
  const plain = row && typeof row.get === 'function' ? row.get({ plain: true }) : row;
  const materiel = plain && plain.materiel ? plain.materiel : {};
  const chantier = plain && plain.chantier ? plain.chantier : {};
  const emplacement = materiel && materiel.emplacement ? materiel.emplacement : {};

  const candidate = {
    id: plain ? plain.id : null,
    chantierId: chantier.id || null,
    chantierNom: chantier.nom || '',
    chantierLocalisation: chantier.localisation || '',
    materielId: materiel.id || null,
    nom: materiel.nom || '',
    categorie: materiel.categorie || '',
    fournisseur: materiel.fournisseur || '',
    marque: materiel.marque || '',
    reference: materiel.reference || '',
    refFabricant: materiel.refFabricant || '',
    commentaire: materiel.commentaire || '',
    remarque: plain ? (plain.remarque || '') : '',
    emplacementNom: emplacement.nom || '',
    rack: materiel.rack || '',
    compartiment: materiel.compartiment || '',
    niveau: materiel.niveau || null,
    quantiteRecue: Number(plain && plain.quantite != null ? plain.quantite : 0),
    quantiteActuelle: Number(plain && plain.quantiteActuelle != null ? plain.quantiteActuelle : (plain && plain.quantite != null ? plain.quantite : 0)),
    quantitePrevue: Number(plain && plain.quantitePrevue != null ? plain.quantitePrevue : 0),
    quantitePrevue1: Number(plain && plain.quantitePrevue1 != null ? plain.quantitePrevue1 : 0),
    quantitePrevue2: Number(plain && plain.quantitePrevue2 != null ? plain.quantitePrevue2 : 0),
    quantitePrevue3: Number(plain && plain.quantitePrevue3 != null ? plain.quantitePrevue3 : 0),
    quantitePrevue4: Number(plain && plain.quantitePrevue4 != null ? plain.quantitePrevue4 : 0),
    raw: plain || row
  };

  candidate.label = formatCandidateLabel(candidate);
  candidate.searchName = normalizeText(candidate.nom);
  candidate.searchCategory = normalizeText(candidate.categorie);
  candidate.searchFournisseur = normalizeText(candidate.fournisseur);
  candidate.searchChantier = normalizeText(`${candidate.chantierNom} ${candidate.chantierLocalisation}`);
  candidate.searchAll = normalizeText([
    candidate.nom,
    candidate.categorie,
    candidate.fournisseur,
    candidate.marque,
    candidate.reference,
    candidate.refFabricant,
    candidate.commentaire,
    candidate.remarque,
    candidate.chantierNom,
    candidate.chantierLocalisation,
    candidate.emplacementNom,
    candidate.rack,
    candidate.compartiment,
    candidate.niveau
  ].join(' '));

  return candidate;
}

function scoreCandidate(candidate, { targetTokens, targetQuery, chantierTokens }) {
  let score = 0;

  if (targetQuery) {
    if (candidate.searchName === targetQuery) {
      score += 70;
    } else if (candidate.searchName.includes(targetQuery) || targetQuery.includes(candidate.searchName)) {
      score += 36;
    }

    if (candidate.searchAll.includes(targetQuery)) {
      score += 18;
    }
  }

  targetTokens.forEach(token => {
    if (candidate.searchName.includes(token)) {
      score += 12;
      return;
    }
    if (candidate.searchCategory.includes(token)) {
      score += 8;
      return;
    }
    if (candidate.searchFournisseur.includes(token)) {
      score += 7;
      return;
    }
    if (candidate.searchAll.includes(token)) {
      score += 4;
    }
  });

  chantierTokens.forEach(token => {
    if (candidate.searchChantier.includes(token)) {
      score += 12;
    }
  });

  if (targetTokens.length > 1) {
    const allTokensPresent = targetTokens.every(token => candidate.searchAll.includes(token));
    if (allTokensPresent) {
      score += 10;
    }
  }

  return score;
}

function buildMatchResult(candidate, score) {
  return {
    id: candidate.id,
    label: candidate.label,
    chantierNom: candidate.chantierNom,
    categorie: candidate.categorie,
    fournisseur: candidate.fournisseur,
    quantiteActuelle: candidate.quantiteActuelle,
    quantiteRecue: candidate.quantiteRecue,
    score
  };
}

function matchVoiceTarget({
  rows,
  interpretation,
  selectedTargetId = null,
  candidateIds = [],
  clarificationText = '',
  filters = {}
}) {
  const chantierFiltered = Boolean(filters && filters.chantierId);
  const serializedCandidates = rows.map(serializeCandidate);
  const candidateIdSet = Array.isArray(candidateIds) && candidateIds.length
    ? new Set(candidateIds.map(value => String(value)))
    : null;

  let availableCandidates = candidateIdSet
    ? serializedCandidates.filter(candidate => candidateIdSet.has(String(candidate.id)))
    : serializedCandidates;

  if (selectedTargetId) {
    const selected = availableCandidates.find(candidate => String(candidate.id) === String(selectedTargetId));
    if (!selected) {
      return {
        status: 'error',
        message: "La ligne choisie n'est plus disponible."
      };
    }

    return {
      status: 'matched',
      selected,
      matches: [buildMatchResult(selected, 999)]
    };
  }

  const clarificationQuery = compactText(clarificationText);
  const effectiveTargetSource = clarificationQuery || interpretation.targetText || interpretation.rawTranscript;
  const targetQuery = normalizeText(effectiveTargetSource);
  const targetTokens = tokenize(effectiveTargetSource);
  const chantierTokens = tokenize(interpretation.chantierText);

  if (!targetQuery && !chantierTokens.length) {
    const clarifyMsg = chantierFiltered
      ? 'Je n\'ai pas identifié le matériel concerné. Pouvez-vous préciser le nom du matériel ?'
      : 'Je n\'ai pas identifié le matériel concerné. Pouvez-vous préciser le nom du matériel ou le chantier ?';
    return {
      status: 'clarify',
      message: clarifyMsg
    };
  }

  const scoredCandidates = availableCandidates
    .map(candidate => ({
      candidate,
      score: scoreCandidate(candidate, { targetTokens, targetQuery, chantierTokens })
    }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scoredCandidates.length) {
    const noMatchMsg = chantierFiltered
      ? 'Aucune ligne correspondante trouvée. Essayez en précisant davantage le nom du matériel.'
      : 'Aucune ligne correspondante trouvée. Essayez en précisant davantage le nom du matériel ou le chantier concerné.';
    return {
      status: 'clarify',
      message: noMatchMsg
    };
  }

  const best = scoredCandidates[0];
  const topMatches = scoredCandidates.slice(0, 5);
  const secondScore = scoredCandidates.length > 1 ? scoredCandidates[1].score : 0;

  // Auto-select when there is a single candidate, or when the best score
  // clearly dominates (at least twice the second-best score), avoiding
  // unnecessary disambiguation when a name matches precisely.
  const isClearMatch =
    scoredCandidates.length === 1 ||
    (best.score > secondScore && best.score >= secondScore * 2);

  if (!isClearMatch) {
    return {
      status: 'clarify',
      message: `J'ai trouvé ${topMatches.length} lignes correspondantes. Laquelle souhaitez-vous ? Cliquez sur la bonne ligne dans la liste ci-dessous.`,
      matches: topMatches.map(item => buildMatchResult(item.candidate, item.score)),
      candidateIds: topMatches.map(item => item.candidate.id)
    };
  }

  return {
    status: 'matched',
    selected: best.candidate,
    matches: topMatches.map(item => buildMatchResult(item.candidate, item.score))
  };
}

module.exports = {
  matchVoiceTarget,
  serializeCandidate
};
