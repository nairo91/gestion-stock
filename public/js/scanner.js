(function () {
  // Vidéo inline pour iOS
  const video = document.getElementById('preview');
  if (video) {
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
  }

  // Zone d'erreur
  const $error = document.getElementById('scan-error');
  function showError(msg) {
    if ($error) {
      $error.textContent = msg;
      $error.style.display = 'block';
    } else {
      alert(msg);
    }
  }

  // Vérifie ZXing UMD
  if (!window.ZXing || !ZXing.BrowserMultiFormatReader) {
    showError('Librairie ZXing non chargée. Vérifiez <script src="/vendor/zxing/index.umd.min.js">.');
    return;
  }

  const codeReader = new ZXing.BrowserMultiFormatReader();

  async function listVideoInputs() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      throw new Error('enumerateDevices non supporté par ce navigateur.');
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput');
  }

  function pickBackCamera(videoInputs) {
    const back = videoInputs.find(d => /back|rear|environment/i.test(d.label));
    return (back || videoInputs[0] || null);
  }

  async function startScan() {
    try {
      const inputs = await listVideoInputs();
      if (!inputs.length) throw new Error('Aucune caméra détectée.');
      const chosen = pickBackCamera(inputs);
      if (!chosen) throw new Error('Impossible de sélectionner une caméra.');

      await codeReader.decodeFromVideoDevice(chosen.deviceId, video, (result, err) => {
        if (result) {
          handleDecodedText(result.getText());
        }
        // err: NotFound/Checksum/FormatError fréquents => on ignore silencieusement
      });
    } catch (e) {
      console.error(e);
      showError('Impossible d’accéder à la caméra : ' + e.message);
    }
  }

  function stopScan() {
    try { codeReader.reset(); } catch (e) {}
  }

  function normalize(s){ return (s || '').replace(/\u00A0/g,' ').trim(); }

  function handleDecodedText(text) {
    const t = normalize(text);

    // 1) QR internes
    const mMat = t.match(/^MAT_(\d+)$/i);
    if (mMat) { window.location.href = '/materiel/info/' + mMat[1]; return; }

    const mMc = t.match(/^MC_(\d+)$/i);
    if (mMc) { window.location.href = '/chantier/materielChantier/info/' + mMc[1]; return; }

    // 2) URL complète
    if (/^https?:\/\//i.test(t)) { window.location.href = t; return; }

    // 3) Fallback: traiter comme code-barres texte via le formulaire manuel
    const form = document.getElementById('manualScanForm');
    const input = document.getElementById('manualCode');
    if (form && input) {
      input.value = t;
      form.submit();
    } else {
      // secours
      window.location.href = '/scan?code=' + encodeURIComponent(t);
    }
  }

  // Boutons
  const $btnStart = document.getElementById('btn-start-scan');
  const $btnStop  = document.getElementById('btn-stop-scan');
  if ($btnStart) $btnStart.addEventListener('click', startScan);
  if ($btnStop)  $btnStop.addEventListener('click', stopScan);
})();
