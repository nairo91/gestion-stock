/* public/js/scanner.js */
(() => {
  const video      = document.getElementById('video');
  const resultBox  = document.getElementById('result');
  const stopBtn    = document.getElementById('stopBtn');
  const codeReader = new ZXing.BrowserMultiFormatReader();

  /** Affiche un message (succès / erreur) */
  function show(msg, error = false) {
    resultBox.className = 'alert ' + (error ? 'alert-danger' : 'alert-success');
    resultBox.textContent = msg;
    resultBox.style.display = 'block';
  }

  /** Stoppe proprement la lecture vidéo */
  function stop() { codeReader.reset(); }

  /** Envoie le code scanné à l’API /materiel/scan */
  async function sendToServer(code) {
    try {
      const r = await fetch('/materiel/scan', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ barcode: code })
      });
      const data = await r.json();
      if (data.redirect)      location.href = data.redirect;
      else if (data.error)    show(data.error, true);
    } catch (e) { show('Erreur réseau', true); }
  }

  /** Lance le scanner */
  async function start() {
    try {
      const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
      const backCam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
      await codeReader.decodeFromVideoDevice(
        backCam?.deviceId,
        video,
        (result, err) => {
          if (result) {
            const code = result.text;
            show(`Code détecté : ${code}`);
            stop();
            sendToServer(code);
          }
        }
      );
    } catch (e) {
      show(`Impossible d’accéder à la caméra : ${e.message}`, true);
    }
  }

  stopBtn.addEventListener('click', stop);
  start();
})();
