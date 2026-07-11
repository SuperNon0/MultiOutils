// Bouton « Copier » de la page Clips. navigator.clipboard exige HTTPS (ou
// localhost) : sur le réseau local en HTTP simple, on retombe sur la
// sélection + execCommand, qui fonctionne partout.
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

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-copy]');
    if (!button) return;
    var card = button.closest('.clip-card');
    var pre = card && card.querySelector('[data-clip]');
    if (!pre) return;
    var text = pre.textContent || '';
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
    var original = button.textContent;
    button.textContent = 'Copié ✓';
    setTimeout(function () {
      button.textContent = original;
    }, 1500);
  });
})();
