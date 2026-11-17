/* Apparence de l’autoclic : l’image personnalisée et ses couleurs sont gérées par Stream Deck. */
(function () {
  window.mountAutoclickAppearance = function (host, getSettings, save) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;color:var(--text)';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.onchange = () => {
      getSettings().customIcon = check.checked;
      save();
      render();
    };
    label.append(check, document.createTextNode('Icône personnalisée dans Stream Deck'));
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'Choisis tes deux images via les états 1 (au repos) et 2 (profil en cours) dans Stream Deck. Le nom du profil reste affiché par-dessus ; laisse le champ Titre vide pour le nom automatique. Dans ce mode, l’image ne s’anime plus. Désactive pour retrouver l’icône animée MultiOutils.';
    host.append(label, note);
    function render() { check.checked = getSettings().customIcon === true; }
    render();
    return { render: render };
  };
})();
