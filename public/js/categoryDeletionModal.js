(() => {
  function setupCategoryDeletionModal(options = {}) {
    const {
      triggerId,
      selectId,
      modalId,
      confirmBtnId,
      nameSelector = '[data-category-name]',
      onSuccess,
    } = options;

    const triggerBtn = triggerId ? document.getElementById(triggerId) : null;
    const select = selectId ? document.getElementById(selectId) : null;
    const modalEl = modalId ? document.getElementById(modalId) : null;
    const confirmBtn = confirmBtnId ? document.getElementById(confirmBtnId) : null;
    const nameEl = modalEl ? modalEl.querySelector(nameSelector) : null;

    if (!triggerBtn || !select || !modalEl || !confirmBtn || !nameEl) {
      return;
    }

    if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
      console.warn('Bootstrap Modal est requis pour la confirmation de suppression de catégorie.');
      return;
    }

    const modalInstance = new bootstrap.Modal(modalEl);
    let pendingValue = null;
    const originalConfirmText = confirmBtn.textContent;

    const resetConfirmButton = () => {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalConfirmText;
    };

    triggerBtn.addEventListener('click', () => {
      const value = select.value;
      if (!value) {
        alert('Veuillez sélectionner une catégorie à supprimer.');
        return;
      }
      pendingValue = value;
      nameEl.textContent = value;
      modalInstance.show();
    });

    modalEl.addEventListener('hidden.bs.modal', () => {
      pendingValue = null;
      resetConfirmButton();
    });

    confirmBtn.addEventListener('click', async () => {
      if (!pendingValue) {
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Suppression...';

      const body = new URLSearchParams();
      body.append('nom', pendingValue);

      try {
        const response = await fetch('/chantier/supprimer-categorie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message || "Erreur lors de la suppression de la catégorie");
        }

        if (typeof onSuccess === 'function') {
          onSuccess({ value: pendingValue, select });
        }

        modalInstance.hide();
      } catch (error) {
        alert(error.message || "Erreur lors de la suppression de la catégorie");
        resetConfirmButton();
      }
    });
  }

  window.setupCategoryDeletionModal = setupCategoryDeletionModal;
})();
