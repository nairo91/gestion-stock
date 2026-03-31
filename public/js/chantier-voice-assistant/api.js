async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload || {})
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok || !data || data.ok === false) {
    const message = data && data.message ? data.message : 'Erreur serveur.';
    throw new Error(message);
  }

  return data;
}

export function previewVoiceCommand(payload) {
  return postJson('/chantier/voice/preview', payload);
}

export function executeVoiceCommand(payload) {
  return postJson('/chantier/voice/execute', payload);
}
