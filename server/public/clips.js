// Boutons « Copier » et « Agrandir » de la page Clips.
// navigator.clipboard exige HTTPS (ou localhost) : sur le réseau local en
// HTTP simple, on retombe sur la sélection + execCommand, qui fonctionne
// partout.
(function () {
  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(area);
    }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  // ── Modale « voir tout » : texte complet dans une zone défilable et
  // sélectionnable (comme un petit éditeur), construite une seule fois et
  // réutilisée à chaque ouverture.
  var veil, textarea, copyAllBtn;

  function buildModal() {
    if (veil) return;
    veil = document.createElement('div');
    veil.className = 'clip-modal-veil';
    veil.innerHTML =
      '<div class="clip-modal">' +
      '<div class="clip-modal-head">' +
      '<span class="muted">Texte complet</span>' +
      '<div class="row-gap">' +
      '<button type="button" class="btn" data-modal-copy>Copier tout</button>' +
      '<button type="button" class="btn btn-icon" data-modal-close aria-label="Fermer">✕</button>' +
      '</div>' +
      '</div>' +
      '<textarea class="clip-modal-text" readonly></textarea>' +
      '</div>';
    document.body.appendChild(veil);
    textarea = veil.querySelector('.clip-modal-text');
    copyAllBtn = veil.querySelector('[data-modal-copy]');

    veil.addEventListener('click', function (event) {
      if (event.target === veil) closeModal();
    });
    veil.querySelector('[data-modal-close]').addEventListener('click', closeModal);
    copyAllBtn.addEventListener('click', function () {
      copyText(textarea.value);
      var original = copyAllBtn.textContent;
      copyAllBtn.textContent = 'Copié ✓';
      setTimeout(function () {
        copyAllBtn.textContent = original;
      }, 1500);
    });
  }

  function openModal(text) {
    buildModal();
    textarea.value = text;
    veil.classList.add('open');
  }

  function closeModal() {
    if (veil) veil.classList.remove('open');
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeModal();
  });

  document.addEventListener('click', function (event) {
    var copyBtn = event.target.closest('[data-copy]');
    if (copyBtn) {
      var card = copyBtn.closest('.clip-card');
      var pre = card && card.querySelector('[data-clip]');
      if (!pre) return;
      copyText(pre.textContent || '');
      var original = copyBtn.textContent;
      copyBtn.textContent = 'Copié ✓';
      setTimeout(function () {
        copyBtn.textContent = original;
      }, 1500);
      return;
    }

    var expandBtn = event.target.closest('[data-expand]');
    if (expandBtn) {
      var expandCard = expandBtn.closest('.clip-card');
      var expandPre = expandCard && expandCard.querySelector('[data-clip]');
      if (expandPre) openModal(expandPre.textContent || '');
    }
  });
})();
