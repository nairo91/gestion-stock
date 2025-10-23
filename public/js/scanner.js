(function () {
  const video = document.getElementById('preview');
  if (video) {
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
  }
  const $error = document.getElementById('scan-error');
  const $cameraSelect = document.getElementById('cameraSelect');
  const $btnSwitch = document.getElementById('btn-switch');

  function showError(msg) {
    if ($error) {
      $error.textContent = msg;
      $error.style.display = 'block';
    } else {
      alert(msg);
    }
  }

  function clearError() {
    if ($error) {
      $error.textContent = '';
      $error.style.display = 'none';
    }
  }

  if (!window.ZXing || !window.ZXing.BrowserMultiFormatReader) {
    showError('Librairie ZXing non chargée. Vérifie les <script> du scanner.');
    return;
  }
  const { BrowserMultiFormatReader } = window.ZXing;
  const codeReader = new BrowserMultiFormatReader();

  let devices = [];
  let currentDeviceId = null;

  async function getVideoInputs() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      throw new Error('enumerateDevices non supporté.');
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'videoinput');
  }

  function guessBackCamera(list) {
    const byLabel = list.find(d => /back|rear|environment/i.test(d.label || ''));
    return byLabel || list[list.length - 1] || list[0] || null;
  }

  async function populateCameraSelect() {
    devices = await getVideoInputs();
    if ($cameraSelect) {
      $cameraSelect.innerHTML = '';
      devices.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Caméra ${i + 1}`;
        $cameraSelect.appendChild(opt);
      });
      $cameraSelect.disabled = devices.length <= 1;
    }
    if ($btnSwitch) $btnSwitch.disabled = devices.length <= 1;
  }

  async function startScan(preferredId) {
    try {
      await populateCameraSelect();
      if (!devices.length) throw new Error('Aucune caméra détectée.');

      const chosen = preferredId
        ? devices.find(d => d.deviceId === preferredId)
        : guessBackCamera(devices);

      if (!chosen) throw new Error('Impossible de sélectionner une caméra.');
      currentDeviceId = chosen.deviceId;
      if ($cameraSelect) $cameraSelect.value = currentDeviceId;
      clearError();

      await codeReader.decodeFromVideoDevice(currentDeviceId, video, (result, err) => {
        if (result) handleDecodedText(result.getText());
        else if (err && err.name && err.name !== 'NotFoundException') console.error(err);
      });
    } catch (e) {
      console.error(e);
      showError('Impossible d’accéder à la caméra : ' + e.message);
    }
  }

  function stopScan() {
    try { codeReader.reset(); } catch (_) {}
  }

  function switchCamera() {
    if (!devices.length) return;
    const idx = devices.findIndex(d => d.deviceId === currentDeviceId);
    const next = devices[(idx + 1) % devices.length];
    stopScan();
    startScan(next.deviceId);
  }

  function normalize(s){ return (s || '').replace(/\u00A0/g,' ').trim(); }

  function handleDecodedText(text) {
    const t = normalize(text);

    const mMat = t.match(/^MAT_(\d+)$/i);
    if (mMat) { window.location.href = '/materiel/info/' + mMat[1]; return; }

    const mMc = t.match(/^MC_(\d+)$/i);
    if (mMc) { window.location.href = '/chantier/materielChantier/info/' + mMc[1]; return; }

    const mRack = t.match(/^RACK_(.+)$/i);
    if (mRack) {
      try {
        const rackDecoded = decodeURIComponent(mRack[1]);
        window.location.href = '/materiel?rack=' + encodeURIComponent(rackDecoded);
        return;
      } catch (_) {}
    }

    if (/^https?:\/\//i.test(t)) { window.location.href = t; return; }

    const form = document.getElementById('manualScanForm');
    const input = document.getElementById('manualCode');
    if (form && input) { input.value = t; form.submit(); }
    else { window.location.href = '/scan?code=' + encodeURIComponent(t); }
  }

  const $btnStart = document.getElementById('btn-start-scan');
  const $btnStop  = document.getElementById('btn-stop-scan');

  if ($btnStart) $btnStart.addEventListener('click', () => startScan());
  if ($btnStop)  $btnStop.addEventListener('click', stopScan);
  if ($btnSwitch) $btnSwitch.addEventListener('click', switchCamera);
  if ($cameraSelect) {
    $cameraSelect.addEventListener('change', () => {
      stopScan(); startScan($cameraSelect.value);
    });
  }
})();
