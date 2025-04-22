// public/js/scanner.js

window.addEventListener('DOMContentLoaded', async () => {
    const codeReader = new ZXing.BrowserMultiFormatReader();
    const video = document.getElementById('video');
    const resultDiv = document.getElementById('result');
    const stopBtn = document.getElementById('stopBtn');
  
    try {
      // Liste des caméras
      const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
      if (devices.length === 0) {
        resultDiv.style.display = 'block';
        resultDiv.textContent = 'Aucune caméra détectée.';
        return;
      }
  
      // On prend la première caméra
      const selectedDeviceId = devices[0].deviceId;
  
      // Lance le scan
      await codeReader.decodeFromVideoDevice(selectedDeviceId, video, (result, err) => {
        if (result) {
          console.log('Code détecté : ', result.getText());
          resultDiv.style.display = 'block';
          resultDiv.textContent = 'Code détecté : ' + result.getText();
  
          // On arrête le scan
          codeReader.reset();
  
          // On envoie en POST
          fetch('/materiel/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: result.getText() })
          })
          .then(response => response.json())
          .then(data => {
            if (data.redirect) {
              window.location.href = data.redirect;
            } else if (data.error) {
              resultDiv.textContent = 'Erreur : ' + data.error;
            }
          })
          .catch(err => {
            console.error(err);
            resultDiv.textContent = 'Erreur lors de l’envoi au serveur.';
          });
        }
      });
  
      // Bouton Arrêter
      stopBtn.addEventListener('click', () => {
        codeReader.reset();
        resultDiv.style.display = 'block';
        resultDiv.textContent = 'Scan arrêté.';
      });
    } catch (error) {
      console.error('Erreur accès caméra ou lecture code : ', error);
      resultDiv.style.display = 'block';
      resultDiv.textContent = 'Erreur accès caméra ou lecture code.';
    }
  });
  