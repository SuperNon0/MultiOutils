/* Fenêtre unique, habillée avec le kit Encre du dépôt. Aucun sous-dialogue pour les entités. */
(function () {
  const $ = (id) => document.getElementById(id);
  const icon = (name) => '<svg class="i" width="18" height="18" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  window.mountHaEditorLayout = function ({ save, getSettings }) {
    document.body.classList.add('large-editor');
    if (window.encreSprite && !document.getElementById('encre-sprite')) {
      const holder = document.createElement('div'); holder.innerHTML = window.encreSprite;
      const sprite = holder.firstElementChild; sprite.id = 'encre-sprite'; document.body.prepend(sprite);
    }
    $('full-editor').hidden = true;
    $('grand').hidden = true;
    const header = document.createElement('header'); header.className = 'editor-header';
    header.innerHTML = '<div><div class="lbl-mono">MultiOutils · Stream Deck</div><h1 class="ttl">Home Assistant</h1></div><span class="save-status" role="status">Enregistrement automatique</span><button type="button" class="btn pri">Enregistrer et fermer</button>';
    header.querySelector('button').onclick = () => { save(); setTimeout(() => window.close(), 500); };
    document.body.prepend(header);
    const shell = document.createElement('div'); shell.className = 'editor-shell';
    shell.innerHTML = '<nav class="editor-nav" aria-label="Paramètres de la touche" role="tablist"></nav><main class="editor-content"></main><aside class="editor-preview"></aside>';
    document.body.appendChild(shell);
    const nav = shell.querySelector('nav'), content = shell.querySelector('main'), preview = shell.querySelector('aside');
    const sections = [
      ['entity', 'Entité', 'home', ['entity-card']],
      ['action', 'Action', 'play', ['action-card', 'panel-card']],
      ['look', 'Apparence', 'palette', ['look-card']],
      ['connection', 'Connexion', 'plug', ['direct']]
    ];
    const buttons = new Map(), panels = new Map();
    let active = 'entity', openHelp = null;
    const select = (id, focus = false) => {
      active = id; closeHelp();
      for (const [key, panel] of panels) panel.hidden = key !== id;
      for (const [key, button] of buttons) { button.setAttribute('aria-selected', String(key === id)); button.tabIndex = key === id ? 0 : -1; }
      if (focus) buttons.get(id)?.focus();
    };
    for (const [id, title, symbol, ids] of sections) {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'tab'); button.id = 'tab-' + id;
      button.innerHTML = icon(symbol) + '<span>' + title + '</span>'; button.setAttribute('aria-controls', 'panel-' + id);
      button.onclick = () => select(id); buttons.set(id, button); nav.appendChild(button);
      const panel = document.createElement('section'); panel.id = 'panel-' + id; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id);
      for (const cardId of ids) { const card = $(cardId); card.hidden = false; panel.appendChild(card); }
      panels.set(id, panel); content.appendChild(panel);
    }
    nav.onkeydown = (event) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
      event.preventDefault(); const ids = [...buttons.keys()], index = ids.indexOf(active);
      select(ids[(index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + ids.length) % ids.length], true);
    };
    const previewCard = document.createElement('section'); previewCard.className = 'carte preview-card';
    previewCard.innerHTML = '<h3>Aperçu</h3><div class="preview-name"></div>';
    const art = document.querySelector('.apercu'); previewCard.appendChild(art); preview.appendChild(previewCard);
    preview.appendChild($('conn')); preview.appendChild($('tools-card'));
    $('conn-b').onclick = () => select('connection');
    $('ch-changer').onclick = () => { select('entity'); $('q').focus(); };
    const meta = document.createElement('div'); meta.className = 'entity-results-meta';
    meta.innerHTML = '<span id="res-count"></span><button type="button" id="res-more" class="lien" hidden>Afficher plus</button>';
    $('res').before(meta);
    const rooms = document.createElement('nav'); rooms.className = 'entity-rooms'; rooms.setAttribute('aria-label', 'Pièces'); rooms.id = 'entity-rooms';
    const area = document.createElement('div'); area.className = 'entity-browser';
    $('res').before(area); area.append(rooms, $('res')); 

    function closeHelp(restoreFocus = false) {
      if (!openHelp) return;
      const { button, bubble } = openHelp;
      button.setAttribute('aria-expanded', 'false'); button.removeAttribute('aria-describedby'); bubble.remove(); openHelp = null;
      if (restoreFocus) button.focus();
    }
    let helpId = 0;
    function addHelp(anchor, title, text, key) {
      if (!anchor || anchor.querySelector('[data-help-key="' + key + '"]')) return;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'q'; button.textContent = '?';
      button.dataset.helpKey = key; button.setAttribute('aria-label', 'Aide : ' + title); button.setAttribute('aria-expanded', 'false');
      button.onclick = (event) => {
        event.preventDefault(); event.stopPropagation();
        if (openHelp?.button === button) return closeHelp();
        closeHelp(); const bubble = document.createElement('div'); bubble.className = 'bulle'; bubble.setAttribute('role', 'tooltip'); bubble.id = 'ha-help-' + (++helpId);
        const heading = document.createElement('b'); heading.textContent = title;
        const description = document.createElement('div'); description.textContent = text; bubble.append(heading, description); document.body.appendChild(bubble);
        const r = button.getBoundingClientRect(); bubble.style.left = Math.max(12, Math.min(r.left + r.width / 2 - bubble.offsetWidth / 2, innerWidth - bubble.offsetWidth - 12)) + 'px';
        bubble.style.top = (r.bottom + bubble.offsetHeight + 8 > innerHeight - 12 ? Math.max(12, r.top - bubble.offsetHeight - 8) : r.bottom + 8) + 'px';
        button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-describedby', bubble.id); openHelp = { button, bubble };
      };
      anchor.appendChild(button);
    }
    const help = {
      'ent-titre': ['Entité', 'Choisis l’appareil à piloter ici. La recherche porte sur son nom, sa pièce, son étage et son identifiant. Aucun autre sélecteur ne s’ouvre.'],
      'mode': ['Action à l’appui', 'Choisis ce que la touche fait : basculer, allumer, éteindre, appliquer un préréglage ou appeler un service. Les champs proposés dépendent de l’entité.'],
      'confirm': ['Confirmation', 'Le premier appui affiche « Confirmer ? ». Un second appui dans les trois secondes exécute l’action. Sans second appui, rien n’est envoyé.'],
      'iconSource': ['Icône', 'Automatique : le symbole de l’entité dans Home Assistant, dessiné par MultiOutils. Mes images Stream Deck : choisis tes images des états 1 (éteint) et 2 (allumé) dans Stream Deck. Une icône de l’atelier garde son propre dessin et sa version éteinte.'],
      'style': ['Style automatique', 'Définit le fond et la couleur des icônes automatiques. Une création de l’atelier garde sa propre mise en page ; les images Stream Deck gardent leur apparence.'],
      'titleMode': ['Nom affiché', 'Affiche le nom de l’entité, un nom personnalisé ou aucun nom. Le titre natif Stream Deck doit rester vide pour laisser le plugin le mettre à jour.'],
      'valueMode': ['Valeur', 'Affiche l’état ou la valeur de l’entité : température, luminosité, position, volume… Le mode automatique choisit selon son type.'],
      'gauge': ['Jauge', 'Ajoute une barre à l’icône automatique pour la luminosité, la position ou le volume.'],
      'lightColor': ['Couleur de la lampe', 'Le symbole automatique suit la couleur réelle de la lumière. Les images personnalisées Stream Deck gardent leurs propres couleurs.'],
      'libraryState': ['Version affichée', 'Une icône de l’atelier peut avoir deux versions : allumée et éteinte (onglet « Éteint » de l’atelier). Par défaut, la touche suit l’état de l’entité ; tu peux aussi garder toujours la même version.'],
      'art': ['Pochette', 'Utilise la pochette de l’album pendant la lecture sur une icône automatique.'],
      'regles': ['Règles d’affichage', 'La première règle qui correspond peut changer la couleur ou faire clignoter une icône automatique.'],
      'direct': ['Connexion', 'La connexion principale est celle de MultiOutils. Les champs ci-dessous définissent seulement la connexion directe de secours du plugin ; ils sont partagés entre toutes ses touches.']
    };
    function installHelp() {
      for (const [id, [title, text]] of Object.entries(help)) {
        const target = $(id); if (!target) continue;
        const label = target.closest('label');
        let anchor = label || (target.tagName === 'H3' ? target : target.closest('.carte')?.querySelector('h3'));
        if (label && !label.classList.contains('coche')) {
          let head = label.querySelector(':scope > .field-name');
          if (!head) {
            head = document.createElement('span'); head.className = 'field-name';
            for (const node of [...label.childNodes]) if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) head.appendChild(node);
            label.prepend(head);
          }
          anchor = head;
        }
        addHelp(anchor, title, text, id);
      }
      for (const p of content.querySelectorAll('p.aide:not([hidden])')) {
        if (p.closest('.liste') || p.id === 'native-text-help') continue;
        const label = p.previousElementSibling;
        if (label?.tagName === 'LABEL') addHelp(label, 'Détail du paramètre', p.textContent, 'description');
        p.hidden = true;
      }
    }
    document.addEventListener('pointerdown', (event) => { if (openHelp && !openHelp.button.contains(event.target) && !openHelp.bubble.contains(event.target)) closeHelp(); }, true);
    window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && openHelp) { event.preventDefault(); event.stopImmediatePropagation(); closeHelp(true); } }, true);
    window.addEventListener('scroll', (event) => { if (openHelp && !openHelp.bubble.contains(event.target)) closeHelp(); }, true);
    window.addEventListener('resize', () => closeHelp());
    const observer = new MutationObserver(() => installHelp()); observer.observe(content, { childList: true, subtree: true });
    select(active); installHelp();
    const layout = {
      setTitle(title) { header.querySelector('h1').textContent = title; },
      saving() { header.querySelector('.save-status').textContent = 'Enregistrement…'; },
      saved() { header.querySelector('.save-status').textContent = 'Enregistré'; },
      refresh() {
        const s = getSettings();
        previewCard.querySelector('.preview-name').textContent = $('ch-nom').textContent || 'Choisir une entité';
        art.querySelector('img').hidden = s.customIcon === true;
        art.querySelector('p').textContent = s.customIcon ? 'Images Stream Deck' : s.libraryIcon ? 'Icône de l’atelier · état en direct' : 'État en direct';
        installHelp();
      },
      dispose() { observer.disconnect(); closeHelp(); }
    };
    window.haEditorLayout = layout;
    return layout;
  };
})();
