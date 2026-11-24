/*
 * Panneau de réglages de la touche « Home Assistant ».
 * Tout passe par le plugin (sendToPlugin) : catalogue des entités, services,
 * test, aperçu. Le plugin parle à Home Assistant via MultiOutils (ou en
 * connexion directe de secours).
 */
(function () {
  'use strict';
  const largeEditor = new URLSearchParams(location.search).has('largeEditor') && !!window.api?.haKeyEditor;
  let ws = null;
  let ctx = null;
  let actionUUID = null;
  let settings = {};
  let catalog = null;
  let services = null;
  let entityState = null;
  const $ = (id) => document.getElementById(id);

  /* Une action par modèle de touche : types d'entités proposés et titre. */
  const KINDS = {
    light: { t: 'Lumière', d: ['light'] },
    switch: { t: 'Interrupteur ou prise', d: ['switch', 'input_boolean', 'fan', 'humidifier', 'siren', 'valve', 'lock', 'vacuum'] },
    cover: { t: 'Volet', d: ['cover'] },
    climate: { t: 'Thermostat', d: ['climate', 'water_heater'] },
    sensor: { t: 'Capteur', d: ['sensor', 'binary_sensor', 'weather', 'person', 'device_tracker', 'input_number', 'number'] },
    media: { t: 'Lecteur', d: ['media_player'] },
    scene: { t: 'Scène ou script', d: ['scene', 'script', 'automation', 'button', 'input_button'] },
    camera: { t: 'Caméra', d: ['camera'] }
  };
  let kindId = '';
  const kind = () => KINDS[kindId] || null;
  const allowed = (domain) => !kind() || kind().d.includes(domain);

  /* ───────── échanges avec le Stream Deck ───────── */

  function send(event, payload) {
    if (largeEditor) { window.api.haKeyEditor.send({ event, payload }); return; }
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ event, context: ctx, action: actionUUID, payload }));
  }
  function toPlugin(payload) {
    send('sendToPlugin', payload);
  }
  let saveTimer = null;
  const sentSettings = new Set();
  function receiveSettings(next) {
    if (sentSettings.has(JSON.stringify(next))) {
      if (JSON.stringify(next) === JSON.stringify(settings)) window.haEditorLayout?.saved();
      return;
    }
    settings = next; renderAll();
  }
  function save(immediate) {
    window.haEditorLayout?.saving();
    clearTimeout(saveTimer);
    const run = () => {
      saveTimer = null;
      sentSettings.add(JSON.stringify(settings));
      if (sentSettings.size > 20) sentSettings.delete(sentSettings.values().next().value);
      send('setSettings', settings);
      setTimeout(() => toPlugin({ cmd: 'preview' }), 250);
    };
    if (immediate) run();
    else saveTimer = setTimeout(run, 300);
  }
  function set(key, value, immediate) {
    if (value === undefined || value === '' || value === null) delete settings[key];
    else settings[key] = value;
    save(immediate);
  }

  window.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, info, actionInfo) {
    ctx = uuid;
    try {
      const a = JSON.parse(actionInfo);
      actionUUID = a.action;
      kindId = (/^com\.supernon0\.multioutils\.ha\.([a-z]+)$/.exec(actionUUID || '') || [])[1] || '';
      settings = (a.payload && a.payload.settings) || {};
    } catch (e) {
      settings = {};
    }
    renderAll();
    ws = new WebSocket('ws://127.0.0.1:' + port);
    ws.onopen = () => {
      ws.send(JSON.stringify({ event: registerEvent, uuid }));
      if (cleanPending) { cleanPending = false; save(true); }
      toPlugin({ cmd: 'status' });
      toPlugin({ cmd: 'catalog' });
      toPlugin({ cmd: 'services' });
      toPlugin({ cmd: 'iconLibrary' });
      toPlugin({ cmd: 'preview' });
      if (settings.entity) toPlugin({ cmd: 'state', id: settings.entity });
    };
    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (e) {
        return;
      }
      if (msg.event === 'didReceiveSettings' && msg.payload) {
        receiveSettings(msg.payload.settings || {});
      } else if (msg.event === 'sendToPropertyInspector') onPlugin(msg.payload || {});
    };
  };

  function onPlugin(m) {
    if (m.error) {
      if (m.cmd === 'pick') $('grand').disabled = false;
      etat(m.error, 'err');
      if (m.cmd === 'catalog') $('res').innerHTML = '<p class="aide">' + esc(m.error) + '</p>';
      return;
    }
    if (m.cmd === 'iconLibrary') {
      libraryDesigns = m.designs || [];
      fillIconSource();
      pairFor = ''; // la liste arrive une fois la connexion ouverte : on (re)demande l'aperçu
      renderLibraryLook();
    } else if (m.cmd === 'iconPair') {
      if (m.id !== settings.libraryIcon) return;
      $('libOn').src = m.on || BLANK;
      $('libOff').src = m.off || BLANK;
    } else if (m.cmd === 'status') renderStatus(m);
    else if (m.cmd === 'catalog') {
      catalog = m.catalog;
      fillFilters();
      renderResults();
      renderChosen();
    } else if (m.cmd === 'services') {
      services = m.services || [];
      renderMode();
    } else if (m.cmd === 'state') {
      if (m.id === settings.entity) {
        const before = JSON.stringify(entityState && entityState.attributes && entityState.attributes.supported_color_modes);
        entityState = m.state;
        renderChosen();
        renderMode();
        // pas de redessin à chaque sondage (le champ en cours de saisie garderait mal le focus)
        if (before !== JSON.stringify(m.state && m.state.attributes && m.state.attributes.supported_color_modes) || $('panel-type').textContent === 'Lecture de la lampe…') renderPanel();
      }
    } else if (m.cmd === 'preview') {
      if (m.image) $('apercu').src = m.image;
    } else if (m.cmd === 'test') etat('Envoyé à Home Assistant.', 'ok');
    else if (m.cmd === 'direct') {
      $('d-etat').textContent = 'Enregistré.';
      $('d-token').value = '';
      setTimeout(() => toPlugin({ cmd: 'status' }), 1500);
    } else if (m.cmd === 'pick') {
      $('grand').disabled = false;
      if (m.ok && m.settings) {
        settings = m.settings;
        entityState = null;
        renderChosen.open = false;
        renderAll();
        toPlugin({ cmd: 'state', id: settings.entity });
        setTimeout(() => toPlugin({ cmd: 'preview' }), 300);
        etat('Entité choisie.', 'ok');
      } else etat('');
    }
  }

  function etat(text, cls) {
    const e = $('etat');
    e.textContent = text;
    e.className = 'etat ' + (cls || '');
    clearTimeout(etat.t);
    etat.t = setTimeout(() => (e.textContent = ''), 5000);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const domainOf = (id) => (id || '').split('.')[0] || '';

  /* ───────── connexion ───────── */

  function renderStatus(m) {
    const s = m.status || {};
    const c = $('conn');
    let text, cls;
    if (s.mode === 'app') {
      cls = s.state === 'connected' ? 'ok' : s.state === 'auth_failed' ? 'err' : 'warn';
      text = s.state === 'connected' ? 'Connecté via MultiOutils' : s.state === 'auth_failed' ? 'Jeton refusé (Réglages de MultiOutils › Home Assistant)' : 'MultiOutils se connecte à Home Assistant…';
    } else if (s.mode === 'direct') {
      cls = s.state === 'connected' ? 'ok' : s.state === 'auth_failed' ? 'err' : 'warn';
      text = s.state === 'connected' ? 'Connexion directe (MultiOutils fermé)' : s.state === 'auth_failed' ? 'Connexion directe : jeton refusé' : 'Connexion directe…';
    } else {
      cls = 'err';
      text = s.app ? 'Home Assistant n’est pas réglé dans MultiOutils' : 'MultiOutils n’est pas lancé';
    }
    c.className = 'conn ' + cls;
    $('conn-t').textContent = text;
    const d = m.direct || {};
    $('d-url').value = d.url || '';
    $('d-remote').value = d.remoteUrl || '';
    $('d-token').placeholder = d.hasToken ? '•••••••• (enregistré)' : 'eyJhbGciOi…';
  }
  $('conn-b').onclick = () => ($('direct').hidden = !$('direct').hidden);
  $('d-save').onclick = () => {
    const direct = { url: $('d-url').value.trim(), remoteUrl: $('d-remote').value.trim() };
    if ($('d-token').value.trim()) direct.token = $('d-token').value.trim();
    toPlugin({ cmd: 'direct', direct });
  };
  $('d-clear').onclick = () => toPlugin({ cmd: 'direct', direct: { token: '' } });

  /* ───────── entité ───────── */

  const DOMAINS = {
    light: 'Lumière', switch: 'Interrupteur', fan: 'Ventilateur', cover: 'Volet', climate: 'Thermostat', media_player: 'Lecteur',
    scene: 'Scène', script: 'Script', automation: 'Automatisation', sensor: 'Capteur', binary_sensor: 'Détecteur', lock: 'Serrure',
    camera: 'Caméra', input_boolean: 'Bouton marche/arrêt', input_select: 'Liste', select: 'Liste', input_number: 'Nombre', number: 'Nombre',
    button: 'Bouton', input_button: 'Bouton', vacuum: 'Aspirateur', person: 'Personne', weather: 'Météo', alarm_control_panel: 'Alarme',
    humidifier: 'Humidificateur', siren: 'Sirène', valve: 'Vanne', water_heater: 'Chauffe-eau', update: 'Mise à jour', device_tracker: 'Localisation'
  };

  function fillFilters() {
    if (!catalog) return;
    const floors = catalog.floors || [];
    const areas = catalog.areas || [];
    $('f-etage').innerHTML = '<option value="">Tous les étages</option>' + floors.map((f) => '<option>' + esc(f.name) + '</option>').join('');
    $('f-etage').hidden = floors.length === 0;
    $('f-piece').innerHTML = '<option value="">Toutes les pièces</option>' + areas.map((a) => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
    const doms = [...new Set(catalog.entities.map((e) => e.domain).filter(allowed))].sort((a, b) => (DOMAINS[a] || a).localeCompare(DOMAINS[b] || b, 'fr'));
    $('f-type').innerHTML = '<option value="">Tous les types</option>' + doms.map((d) => '<option value="' + d + '">' + esc(DOMAINS[d] || d) + '</option>').join('');
    $('f-type').hidden = doms.length < 2;
    // seulement les pièces qui ont des entités de ce modèle
    const used = new Set(catalog.entities.filter((e) => allowed(e.domain)).map((e) => e.area));
    $('f-piece').innerHTML = '<option value="">Toutes les pièces</option>' + areas.filter((a) => used.has(a.id)).map((a) => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
  }

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let resultLimit = 150;
  let selectedRoom = '*';
  function renderRooms() {
    const nav = $('entity-rooms'); if (!nav || !catalog) return;
    const base = catalog.entities.filter((e) => allowed(e.domain));
    const rooms = new Map();
    for (const e of base) { const id = e.area || ''; const room = rooms.get(id) || { id, name: e.areaName || 'Sans pièce', floor: e.floorName || '', count: 0 }; room.count++; rooms.set(id, room); }
    const list = [...rooms.values()].sort((a, b) => a.floor.localeCompare(b.floor, 'fr') || a.name.localeCompare(b.name, 'fr'));
    nav.replaceChildren();
    const add = (id, name, count) => { const b = document.createElement('button'); b.type = 'button'; b.className = selectedRoom === id && !$('q').value.trim() ? 'on' : ''; const label = document.createElement('span'); label.textContent = name; const n = document.createElement('span'); n.className = 'n'; n.textContent = count; b.append(label, n); b.onclick = () => { selectedRoom = id; $('q').value = ''; resultLimit = 150; renderResults(); }; nav.appendChild(b); };
    add('*', 'Toutes les pièces', base.length);
    let floor = null;
    for (const room of list) { if (room.floor && room.floor !== floor) { const h = document.createElement('span'); h.className = 'entity-floor'; h.textContent = room.floor; nav.appendChild(h); } floor = room.floor; add(room.id, room.name, room.count); }
  }
  function renderResults() {
    const box = $('res');
    if (!catalog) return;
    const words = norm($('q').value).split(/\s+/).filter(Boolean);
    const fe = $('f-etage').value, fp = $('f-piece').value, ft = $('f-type').value;
    renderRooms();
    const list = catalog.entities
      .filter((e) => allowed(e.domain))
      .filter((e) => largeEditor ? ((!words.length && selectedRoom !== '*') ? (e.area || '') === selectedRoom : true) && (!ft || e.domain === ft) : (!fe || e.floorName === fe) && (!fp || e.area === fp) && (!ft || e.domain === ft))
      .filter((e) => {
        const hay = norm(e.name + ' ' + e.id + ' ' + (e.areaName || '') + ' ' + (e.floorName || '') + ' ' + (DOMAINS[e.domain] || ''));
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => (a.floorName || '').localeCompare(b.floorName || '', 'fr') || (a.areaName || '\uffff').localeCompare(b.areaName || '\uffff', 'fr') || a.name.localeCompare(b.name, 'fr'));
    const total = list.length;
    if ($('res-count')) $('res-count').textContent = total + (total > 1 ? ' entités' : ' entité');
    if ($('res-more')) { $('res-more').hidden = total <= resultLimit; $('res-more').onclick = () => { resultLimit += 150; renderResults(); }; }
    if (!list.length) {
      box.innerHTML = '<p class="aide">Aucune entité trouvée.</p>';
      return;
    }
    let last = null;
    const domainIcons = { light: 'sun', switch: 'plug', fan: 'spin', cover: 'layers', climate: 'sun', media_player: 'play', sensor: 'chart', binary_sensor: 'signal', lock: 'lock', person: 'user', weather: 'cloud', camera: 'eye' };
    box.innerHTML = list.slice(0, resultLimit)
      .map((e) => {
        const room = [e.floorName, e.areaName || 'Sans pièce'].filter(Boolean).join(' · ');
        const head = !largeEditor && room !== last ? '<div class="groupe">' + esc(room) + '</div>' : '';
        last = room;
        return (
          head +
          '<div class="ent' + (e.id === settings.entity ? ' on' : '') + (['on', 'open', 'playing', 'home', 'heat', 'cool'].includes(e.state) ? ' allume' : '') + '" role="button" tabindex="0" title="' + esc(e.id) + '" data-id="' + esc(e.id) + '">' + (largeEditor ? '<span class="entity-icon"><svg class="i" aria-hidden="true"><use href="#i-' + (domainIcons[e.domain] || 'zap') + '"></use></svg></span>' : '') + '<div class="t"><b>' + esc(e.name) + '</b><span>' +
          esc([largeEditor && (words.length || selectedRoom === '*') ? e.areaName : '', DOMAINS[e.domain] || e.domain].filter(Boolean).join(' · ')) + '</span></div><span class="v">' + esc(fmt(e.state, e.unit)) + '</span></div>'
        );
      })
      .join('');
    box.querySelectorAll('.ent').forEach((el) => {
      const pick = () => chooseEntity(el.dataset.id);
      el.onclick = pick;
      el.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); }
      };
    });
  }
  const STATES = { on: 'Allumé', off: 'Éteint', open: 'Ouvert', closed: 'Fermé', unavailable: 'Indisponible', playing: 'Lecture', paused: 'Pause', locked: 'Verrouillé', unlocked: 'Ouvert' };
  function fmt(state, unit) {
    if (state == null) return '';
    const n = Number(state);
    if (state !== '' && isFinite(n)) return n.toLocaleString('fr', { maximumFractionDigits: 1 }) + (unit ? ' ' + unit : '');
    return STATES[state] || state;
  }
  ['q', 'f-etage', 'f-piece', 'f-type'].forEach((id) => ($(id).oninput = () => { resultLimit = 150; renderResults(); }));

  function chooseEntity(id) {
    const prev = domainOf(settings.entity);
    settings.entity = id;
    entityState = null;
    if (domainOf(id) !== prev) {
      // nouveau type d'entité : on repart sur l'action automatique
      delete settings.mode;
      delete settings.preset;
    }
    save(true);
    toPlugin({ cmd: 'state', id });
    setTimeout(() => toPlugin({ cmd: 'state', id }), 1500);
    renderChosen();
    renderResults();
    renderMode();
    renderLook();
  }
  function renderChosen() {
    const id = settings.entity;
    const has = !!id;
    $('choisie').hidden = !has;
    $('chercher').hidden = !largeEditor && has && !renderChosen.open;
    if (!has) { window.haEditorLayout?.refresh(); return; }
    const e = catalog && catalog.entities.find((x) => x.id === id);
    $('ch-nom').textContent = e ? e.name : id;
    $('choisie').title = id;
    $('ch-info').textContent = [e && (DOMAINS[e.domain] || e.domain), e && e.areaName, entityState ? fmt(entityState.state, entityState.attributes && entityState.attributes.unit_of_measurement) : '']
      .filter(Boolean)
      .join(' · ');
    window.haEditorLayout?.refresh();
  }
  $('grand').onclick = () => {
    $('grand').disabled = true;
    etat('Choisis l’entité dans la fenêtre MultiOutils…');
    toPlugin({ cmd: 'pick', title: kind() ? kind().t : '' });
  };
  $('ch-changer').onclick = () => {
    renderChosen.open = !renderChosen.open;
    renderChosen();
    if (renderChosen.open) $('q').focus();
  };

  /* ───────── action ───────── */

  function modesFor(d) {
    const m = [['auto', 'Automatique (selon le type)']];
    const toggles = ['light', 'switch', 'fan', 'input_boolean', 'cover', 'lock', 'climate', 'media_player', 'automation', 'humidifier', 'siren', 'vacuum', 'valve', 'water_heater', 'remote', 'group'];
    if (toggles.includes(d)) m.push(['toggle', 'Basculer'], ['on', d === 'cover' || d === 'valve' || d === 'lock' ? 'Ouvrir' : 'Allumer'], ['off', d === 'cover' || d === 'valve' ? 'Fermer' : d === 'lock' ? 'Verrouiller' : 'Éteindre']);
    if (['light', 'cover', 'climate', 'fan', 'media_player', 'input_select', 'select', 'input_number', 'number'].includes(d)) m.push(['preset', presetLabel(d)]);
    if (['light', 'cover', 'climate', 'fan', 'input_select', 'select', 'input_number', 'number', 'media_player'].includes(d)) m.push(['cycle', 'Parcourir une liste à chaque appui']);
    if (['light', 'cover', 'climate', 'fan', 'media_player', 'input_number', 'number'].includes(d)) m.push(['adjust', 'Augmenter ou baisser d’un pas']);
    if (d === 'media_player') m.push(['media', 'Commande du lecteur']);
    if (d === 'camera') m.push(['camera', 'Image de la caméra']);
    m.push(['display', 'Afficher seulement']);
    // Les actions avancées restent réservées à la touche « HA : Avancé »
    // (ou à une touche qui les utilise déjà, pour ne rien casser).
    const advanced = [['service', 'Appeler un service'], ['event', 'Envoyer un événement'], ['template', 'Afficher un modèle (texte calculé)']];
    for (const a of advanced) if (!kindId || settings.mode === a[0]) m.push(a);
    return m;
  }
  function presetLabel(d) {
    return { light: 'Luminosité ou couleur précise', cover: 'Aller à une position', climate: 'Consigne ou mode précis', fan: 'Vitesse précise', media_player: 'Volume précis', input_select: 'Choisir une option', select: 'Choisir une option', input_number: 'Valeur précise', number: 'Valeur précise' }[d] || 'Préréglage';
  }

  function renderMode() {
    const d = domainOf(settings.entity);
    const modes = modesFor(d);
    const cur = settings.mode || 'auto';
    $('mode').innerHTML = modes.map(([v, l]) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
    const z = $('mode-zone');
    z.innerHTML = '';
    const p = settings.preset || {};
    const setPreset = (k, v) => {
      settings.preset = Object.assign({}, settings.preset || {});
      if (v === '' || v == null || (typeof v === 'number' && !isFinite(v))) delete settings.preset[k];
      else settings.preset[k] = v;
      save();
    };
    const attrs = (entityState && entityState.attributes) || {};
    if (cur === 'auto') {
      z.innerHTML = '<p class="aide">' + esc(autoText(d)) + '</p>';
    } else if (cur === 'preset') {
      if (d === 'light') {
        z.appendChild(slider('Luminosité', p.brightness, 0, 100, 1, '%', (v) => setPreset('brightness', v)));
        z.appendChild(colorField('Couleur', p.color, (v) => setPreset('color', v)));
        z.appendChild(slider('Blanc (si pas de couleur)', p.kelvin, 2000, 6500, 100, 'K', (v) => setPreset('kelvin', v)));
      } else if (d === 'cover') z.appendChild(slider('Position', p.position, 0, 100, 1, '%', (v) => setPreset('position', v)));
      else if (d === 'climate') {
        z.appendChild(slider('Consigne', p.temperature, attrs.min_temp || 7, attrs.max_temp || 30, attrs.target_temp_step || 0.5, '°', (v) => setPreset('temperature', v)));
        z.appendChild(selectField('Ou changer de mode', p.hvac, [['', '—']].concat((attrs.hvac_modes || ['off', 'heat', 'cool', 'auto']).map((x) => [x, x])), (v) => setPreset('hvac', v)));
      } else if (d === 'fan') z.appendChild(slider('Vitesse', p.percentage, 0, 100, attrs.percentage_step || 1, '%', (v) => setPreset('percentage', v)));
      else if (d === 'media_player') z.appendChild(slider('Volume', p.volume, 0, 100, 1, '%', (v) => setPreset('volume', v)));
      else if (d === 'input_select' || d === 'select') z.appendChild(selectField('Option', p.option, [['', '—']].concat((attrs.options || []).map((o) => [o, o])), (v) => setPreset('option', v)));
      else if (d === 'input_number' || d === 'number') z.appendChild(slider('Valeur', p.value, attrs.min != null ? attrs.min : 0, attrs.max != null ? attrs.max : 100, attrs.step || 1, attrs.unit_of_measurement || '', (v) => setPreset('value', v)));
    } else if (cur === 'cycle') {
      const ex = { light: '100, 50, 10, 0', cover: '100, 50, 0', climate: '19, 20.5, 22', fan: '33, 66, 100', input_select: (attrs.options || []).join(', '), select: (attrs.options || []).join(', '), media_player: (attrs.source_list || []).join(', '), input_number: '0, 50, 100', number: '0, 50, 100' }[d] || '';
      z.appendChild(textField('Valeurs, séparées par des virgules', settings.cycle, ex, (v) => set('cycle', v)));
      z.appendChild(note(d === 'light' ? 'Luminosités en %. 0 éteint la lampe.' : d === 'cover' ? 'Positions en %.' : d === 'media_player' ? 'Sources du lecteur.' : 'Chaque appui passe à la valeur suivante.'));
    } else if (cur === 'adjust') {
      z.appendChild(numberField('Pas (négatif pour baisser)', settings.step, d === 'climate' ? 0.5 : 10, (v) => set('step', v)));
    } else if (cur === 'media') {
      z.appendChild(
        selectField('Commande', settings.media || 'play_pause', [['play_pause', 'Lecture / pause'], ['next', 'Suivant'], ['previous', 'Précédent'], ['volume_up', 'Volume +'], ['volume_down', 'Volume −'], ['mute', 'Couper le son'], ['stop', 'Arrêter']], (v) => set('media', v))
      );
    } else if (cur === 'camera') {
      z.appendChild(numberField('Rafraîchir toutes les (secondes)', settings.refresh, 10, (v) => set('refresh', v)));
      z.appendChild(check('Ouvrir la caméra en grand à l’appui', settings.cameraOpen !== false, (v) => set('cameraOpen', v ? undefined : false)));
    } else if (cur === 'display') {
      z.appendChild(note('La touche montre l’état sans rien faire à l’appui.'));
    } else if (cur === 'service') renderService(z);
    else if (cur === 'event') {
      z.appendChild(textField('Type d’événement', settings.eventType, 'streamdeck_appui', (v) => set('eventType', v)));
      z.appendChild(areaField('Données (YAML ou JSON, facultatif)', settings.eventData, 'touche: salon', (v) => set('eventData', v)));
      z.appendChild(note('À utiliser comme déclencheur « Événement » dans une automatisation.'));
    } else if (cur === 'template') {
      z.appendChild(areaField('Modèle', settings.template, "{{ states.light | selectattr('state','eq','on') | list | count }} allumées", (v) => set('template', v)));
      z.appendChild(numberField('Rafraîchir toutes les (secondes)', settings.refresh, 10, (v) => set('refresh', v)));
    }
  }
  function autoText(d) {
    if (!d) return 'Choisis d’abord une entité.';
    if (['scene', 'script'].includes(d)) return 'Un appui lance la ' + (d === 'scene' ? 'scène.' : 'script.');
    if (['button', 'input_button'].includes(d)) return 'Un appui presse le bouton.';
    if (d === 'automation') return 'Un appui déclenche l’automatisation.';
    if (['input_select', 'select'].includes(d)) return 'Un appui passe à l’option suivante.';
    if (d === 'media_player') return 'Un appui met en lecture ou en pause.';
    if (d === 'camera') return 'La touche montre l’image, un appui l’ouvre en grand.';
    if (['sensor', 'binary_sensor', 'weather', 'person', 'device_tracker', 'sun'].includes(d)) return 'La touche affiche l’état.';
    return 'Un appui bascule l’entité (allumé ↔ éteint, ouvert ↔ fermé).';
  }
  $('mode').onchange = () => {
    set('mode', $('mode').value === 'auto' ? undefined : $('mode').value, true);
    renderMode();
  };
  $('confirm').onchange = () => set('confirm', $('confirm').checked || undefined);

  /* ───────── service libre : formulaire généré ───────── */

  function parseData(text) {
    const t = (text || '').trim();
    if (!t) return {};
    if (t[0] === '{') return JSON.parse(t);
    const out = {};
    t.split(/\r?\n/).forEach((line) => {
      if (!line.trim() || line.trim()[0] === '#') return;
      const m = /^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(line);
      if (!m) throw new Error('Ligne non comprise : ' + line.trim());
      let v = m[2].trim();
      if (/^(true|false)$/i.test(v)) v = /^true$/i.test(v);
      else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
      else if (v[0] === '[' || v[0] === '{') {
        try {
          v = JSON.parse(v);
        } catch (e) {
          /* texte */
        }
      } else if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
      out[m[1]] = v;
    });
    return out;
  }
  function toYaml(obj) {
    return Object.keys(obj)
      .map((k) => k + ': ' + (typeof obj[k] === 'string' ? obj[k] : JSON.stringify(obj[k])))
      .join('\n');
  }

  function renderService(z) {
    const list = services || [];
    const d = domainOf(settings.entity);
    const sorted = list.slice().sort((a, b) => {
      const ra = a.domain === d || (a.targetDomains || []).includes(d) ? 0 : a.domain === 'homeassistant' ? 1 : 2;
      const rb = b.domain === d || (b.targetDomains || []).includes(d) ? 0 : b.domain === 'homeassistant' ? 1 : 2;
      return ra - rb || (a.domain + a.service).localeCompare(b.domain + b.service);
    });
    const sel = document.createElement('select');
    sel.innerHTML =
      '<option value="">' + (services ? 'Choisir un service…' : 'Chargement des services…') + '</option>' +
      sorted.map((s) => '<option value="' + s.domain + '.' + s.service + '"' + (settings.service === s.domain + '.' + s.service ? ' selected' : '') + '>' + esc(s.domain + '.' + s.service + ' — ' + s.name) + '</option>').join('');
    if (settings.service && !sorted.some((s) => s.domain + '.' + s.service === settings.service)) sel.innerHTML += '<option selected>' + esc(settings.service) + '</option>';
    const lab = document.createElement('label');
    lab.textContent = 'Service';
    lab.appendChild(sel);
    z.appendChild(lab);
    const info = list.find((s) => s.domain + '.' + s.service === settings.service);
    if (info && info.description) z.appendChild(note(info.description));
    sel.onchange = () => {
      settings.service = sel.value || undefined;
      if (!settings.service) delete settings.service;
      settings.data = '';
      delete settings.data;
      save(true);
      renderMode();
    };
    if (info) {
      let data = {};
      let bad = false;
      try {
        data = parseData(settings.data);
      } catch (e) {
        bad = true;
      }
      const write = (k, v) => {
        const cur = (() => {
          try {
            return parseData(settings.data);
          } catch (e) {
            return {};
          }
        })();
        if (v === undefined || v === '' || v === null) delete cur[k];
        else cur[k] = v;
        settings.data = toYaml(cur);
        if (!settings.data) delete settings.data;
        save();
        $('svc-data').value = settings.data || '';
      };
      const simple = info.fields.filter((f) => !f.advanced);
      const adv = info.fields.filter((f) => f.advanced);
      const addField = (f, host) => {
        const v = data[f.key];
        let el;
        if (f.kind === 'number' || f.kind === 'kelvin') el = slider(f.name, v, f.min != null ? f.min : 0, f.max != null ? f.max : f.kind === 'kelvin' ? 6500 : 100, f.step || 1, f.unit || '', (x) => write(f.key, x), true);
        else if (f.kind === 'boolean') el = check(f.name, !!v, (x) => write(f.key, x ? true : undefined));
        else if (f.kind === 'select') el = selectField(f.name, v, [['', '—']].concat(f.options.map((o) => [o.value, o.label])), (x) => write(f.key, x || undefined));
        else if (f.kind === 'color') el = colorField(f.name, Array.isArray(v) ? '#' + v.map((n) => Number(n).toString(16).padStart(2, '0')).join('') : '', (x) => write(f.key, x ? [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)) : undefined));
        else el = textField(f.name, v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v), f.example != null ? String(f.example) : '', (x) => {
          let val = x;
          if (f.kind === 'object' && x) {
            try {
              val = JSON.parse(x);
            } catch (e) {
              val = x;
            }
          }
          write(f.key, val || undefined);
        });
        if (f.description) el.title = f.description;
        host.appendChild(el);
      };
      if (!bad) simple.forEach((f) => addField(f, z));
      if (!bad && adv.length) {
        const det = document.createElement('details');
        det.innerHTML = '<summary class="aide">Options avancées</summary>';
        adv.forEach((f) => addField(f, det));
        z.appendChild(det);
      }
      if (info.target) z.appendChild(check('Viser l’entité de cette touche', settings.targetSelf !== false, (x) => set('targetSelf', x ? undefined : false)));
    }
    const area = areaField('Données en YAML ou JSON (mode avancé)', settings.data, 'brightness_pct: 40', (v) => {
      set('data', v);
      try {
        parseData(v);
        area.querySelector('textarea').style.borderColor = '';
      } catch (e) {
        area.querySelector('textarea').style.borderColor = 'var(--danger)';
      }
    });
    area.querySelector('textarea').id = 'svc-data';
    z.appendChild(area);
  }

  /* ───────── petits champs ───────── */

  function note(text) {
    const p = document.createElement('p');
    p.className = 'aide';
    p.textContent = text;
    return p;
  }
  function check(label, value, onChange) {
    const l = document.createElement('label');
    l.className = 'coche';
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = !!value;
    i.onchange = () => onChange(i.checked);
    l.appendChild(i);
    l.appendChild(document.createTextNode(' ' + label));
    return l;
  }
  function textField(label, value, placeholder, onChange) {
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.value = value == null ? '' : value;
    i.placeholder = placeholder || '';
    i.oninput = () => onChange(i.value);
    l.appendChild(i);
    return l;
  }
  function areaField(label, value, placeholder, onChange) {
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('textarea');
    i.className = 'mono';
    i.value = value == null ? '' : value;
    i.placeholder = placeholder || '';
    i.oninput = () => onChange(i.value);
    l.appendChild(i);
    return l;
  }
  function numberField(label, value, placeholder, onChange) {
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.type = 'number';
    i.step = 'any';
    i.value = value == null ? '' : value;
    i.placeholder = placeholder == null ? '' : String(placeholder);
    i.oninput = () => onChange(i.value === '' ? undefined : Number(i.value));
    l.appendChild(i);
    return l;
  }
  function selectField(label, value, options, onChange) {
    const l = document.createElement('label');
    l.textContent = label;
    const s = document.createElement('select');
    s.innerHTML = options.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(value || '') === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
    s.onchange = () => onChange(s.value);
    l.appendChild(s);
    return l;
  }
  function colorField(label, value, onChange) {
    const l = document.createElement('label');
    l.textContent = label;
    const w = document.createElement('span');
    w.className = 'coul';
    const i = document.createElement('input');
    i.type = 'color';
    i.value = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lien';
    b.textContent = value ? 'Aucune' : '(aucune)';
    i.oninput = () => {
      onChange(i.value);
      b.textContent = 'Aucune';
    };
    b.onclick = () => {
      onChange(undefined);
      b.textContent = '(aucune)';
    };
    w.appendChild(i);
    w.appendChild(b);
    l.appendChild(w);
    return l;
  }
  function slider(label, value, min, max, step, unit, onChange) {
    const w = document.createElement('div');
    w.className = 'champ';
    const l = document.createElement('label');
    l.textContent = label + (unit ? ' (' + unit + ')' : '');
    const line = document.createElement('div');
    line.className = 'ligne';
    const r = document.createElement('input');
    r.type = 'range';
    r.min = min;
    r.max = max;
    r.step = step;
    const n = document.createElement('input');
    n.type = 'number';
    n.min = min;
    n.max = max;
    n.step = step;
    const has = value != null && value !== '' && isFinite(Number(value));
    r.value = has ? value : min;
    n.value = has ? value : '';
    n.placeholder = '—';
    r.oninput = () => {
      n.value = r.value;
      onChange(Number(r.value));
    };
    n.oninput = () => {
      if (n.value === '') return onChange(undefined);
      r.value = n.value;
      onChange(Number(n.value));
    };
    line.appendChild(r);
    line.appendChild(n);
    w.appendChild(l);
    w.appendChild(line);
    return w;
  }

  /* ───────── panneau lumière (appui long) ───────── */

  // Mêmes teintes de départ que le plugin (src/ha/light-panel.ts).
  const BASE_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#ff2d92'];
  const MORE_COLORS = ['#ff6f61', '#ffb340', '#c6f432', '#7ee8a2', '#64d2ff', '#a0c4ff', '#bf5af2', '#ff9ec7'];
  const BASE_WHITES = [2200, 2700, 3000, 3500, 4000, 4500, 5000, 6500];
  const DEFAULT_LEVELS = [10, 25, 50, 75, 100];
  let panelEdit = -1;
  function lightCaps() {
    const a = (entityState && entityState.attributes) || {};
    const modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : [];
    const lo = isFinite(a.min_color_temp_kelvin) ? Math.round(a.min_color_temp_kelvin) : 2200;
    const hi = isFinite(a.max_color_temp_kelvin) ? Math.round(a.max_color_temp_kelvin) : 6500;
    return { known: !!entityState, color: modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m)), white: modes.includes('color_temp'), minK: Math.min(lo, hi), maxK: Math.max(lo, hi) };
  }
  function defaultSlots(c) {
    const clamp = (k) => Math.max(c.minK, Math.min(c.maxK, k));
    if (c.color && c.white) return BASE_COLORS.map((x) => ({ c: x })).concat(BASE_WHITES.map((k) => ({ k: clamp(k) })));
    if (c.color) return BASE_COLORS.concat(MORE_COLORS).map((x) => ({ c: x }));
    if (c.white) return Array.from({ length: 16 }, (_, i) => ({ k: Math.round((c.minK + ((c.maxK - c.minK) * i) / 15) / 50) * 50 }));
    return [];
  }
  function panelSlots() {
    const base = defaultSlots(lightCaps());
    const list = Array.isArray(settings.panelSlots) && settings.panelSlots.length ? settings.panelSlots : null;
    return Array.from({ length: 16 }, (_, i) => (list ? list[i] || null : base[i] || null));
  }
  function kelvinHex(k) {
    const t = Math.max(1000, Math.min(40000, k)) / 100;
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  const slotHex = (s) => (s.c ? s.c : kelvinHex(s.k || 4000));
  const darkHex = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.6; };
  function setSlot(i, slot) {
    const list = panelSlots();
    list[i] = slot;
    settings.panelSlots = list;
    save();
    renderPanel();
  }
  function renderPanel() {
    const card = $('panel-card');
    const light = domainOf(settings.entity) === 'light';
    card.hidden = !light;
    if (!light) return;
    $('panel').checked = settings.panel === true;
    const c = lightCaps();
    $('panel-type').textContent = !c.known ? 'Lecture de la lampe…'
      : c.color && c.white ? 'Ampoule couleurs et blancs : page 1 en couleurs, page 2 en blancs. Chaque teinte se change d’un clic.'
      : c.color ? 'Ampoule couleurs : deux pages de couleurs. Chaque teinte se change d’un clic.'
      : c.white ? 'Ampoule à nuances de blanc (' + c.minK + ' à ' + c.maxK + ' K) : deux pages de blancs. Chaque nuance se change d’un clic.'
      : 'Cette lampe ne règle que la luminosité : les teintes restent vides.';
    const slots = panelSlots();
    const levels = DEFAULT_LEVELS.map((d, i) => (Array.isArray(settings.panelLevels) && isFinite(settings.panelLevels[i]) ? settings.panelLevels[i] : d));
    const grid = $('panel-grid');
    grid.innerHTML = '';
    for (let page = 0; page < 2; page++) {
      const box = document.createElement('div');
      box.className = 'page-sd';
      box.innerHTML = '<b>Page ' + (page + 1) + '</b>';
      const keys = document.createElement('div');
      keys.className = 'touches';
      const cells = [];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
        const el = document.createElement('div');
        el.className = 'touche';
        if (col === 0 && row === 0) { el.classList.add('fixe'); el.textContent = 'Retour'; }
        else if (col === 0 && row === 1) { el.classList.add('fixe'); el.textContent = 'Page ' + (page + 1) + '/2'; }
        else if (row < 2) {
          const i = page * 8 + row * 4 + (col - 1);
          const s = slots[i];
          if (s) {
            const hex = slotHex(s);
            el.classList.add('teinte');
            if (darkHex(hex)) el.classList.add('sombre');
            el.style.background = hex;
            el.textContent = s.k ? s.k + ' K' : '';
          } else { el.classList.add('vide'); el.textContent = '+'; }
          if (i === panelEdit) el.classList.add('choisie');
          el.title = 'Changer cette teinte';
          el.onclick = () => { panelEdit = panelEdit === i ? -1 : i; renderPanel(); };
        } else {
          el.classList.add('niveau');
          const inp = document.createElement('input');
          inp.type = 'number'; inp.min = 1; inp.max = 100; inp.value = levels[col];
          inp.title = 'Luminosité de la touche ' + (col + 1) + ' (%)';
          inp.oninput = () => {
            const v = Math.round(Number(inp.value));
            if (!isFinite(v) || v < 1 || v > 100) return;
            const next = levels.slice(); next[col] = v;
            settings.panelLevels = next; save();
          };
          inp.onchange = () => renderPanel();
          el.appendChild(inp);
          el.appendChild(document.createTextNode('%'));
        }
        cells.push(el);
      }
      cells.forEach((x) => keys.appendChild(x));
      box.appendChild(keys);
      if (panelEdit >= page * 8 && panelEdit < page * 8 + 8) box.appendChild(slotEditor(panelEdit, slots[panelEdit], c));
      grid.appendChild(box);
    }
  }
  function slotEditor(i, s, c) {
    const w = document.createElement('div');
    w.className = 'edite';
    const kind = !s ? 'vide' : s.c ? 'couleur' : 'blanc';
    const line = document.createElement('div');
    line.className = 'rang';
    const sel = document.createElement('select');
    sel.innerHTML = '<option value="couleur">Couleur</option><option value="blanc">Blanc</option><option value="vide">Vide</option>';
    sel.value = kind;
    sel.onchange = () => setSlot(i, sel.value === 'couleur' ? { c: s && s.c ? s.c : '#ff9500' } : sel.value === 'blanc' ? { k: s && s.k ? s.k : 3000 } : null);
    line.appendChild(document.createTextNode('Teinte ' + ((i % 8) + 1) + ' : '));
    line.appendChild(sel);
    if (kind === 'couleur') {
      const col = document.createElement('input');
      col.type = 'color'; col.value = s.c;
      col.oninput = () => { const list = panelSlots(); list[i] = { c: col.value }; settings.panelSlots = list; save(); };
      col.onchange = () => renderPanel();
      line.appendChild(col);
    }
    w.appendChild(line);
    if (kind === 'blanc') {
      w.appendChild(slider('Blanc', s.k, Math.min(c.minK, 2000), Math.max(c.maxK, 6500), 50, 'K', (v) => {
        if (!isFinite(v)) return;
        const list = panelSlots(); list[i] = { k: v }; settings.panelSlots = list; save();
        clearTimeout(slotEditor.t); slotEditor.t = setTimeout(renderPanel, 400);
      }));
    }
    if (kind === 'couleur' && c.known && !c.color && c.white) w.appendChild(note('Cette ampoule n’a que des blancs : la couleur sera remplacée par le blanc le plus proche.'));
    return w;
  }
  $('panel').onchange = () => { set('panel', $('panel').checked ? true : undefined, true); renderPanel(); };
  $('panel-raz').onclick = () => { panelEdit = -1; delete settings.panelSlots; delete settings.panelLevels; save(true); renderPanel(); };
  $('panel-open').onclick = () => { save(true); toPlugin({ cmd: 'openPanel' }); etat('Panneau ouvert sur le Stream Deck.', 'ok'); };

  /* ───────── apparence ───────── */

  /** Icônes de l'atelier MultiOutils, proposées dans la liste « Icône ». */
  let libraryDesigns = [];
  function fillIconSource() {
    const select = $('iconSource');
    select.replaceChildren();
    const add = (value, label, parent) => { const o = document.createElement('option'); o.value = value; o.textContent = label; (parent || select).appendChild(o); };
    add('', 'Automatique (icône de Home Assistant)');
    add('__sd', 'Mes images Stream Deck (éteint / allumé)');
    if (libraryDesigns.length) {
      const group = document.createElement('optgroup'); group.label = 'Atelier MultiOutils';
      for (const d of libraryDesigns) add(d.id, d.twoStates ? d.name + ' · allumé / éteint' : d.name, group);
      select.appendChild(group);
    }
    // icône de l'atelier supprimée depuis : on la garde visible pour ne pas la perdre en silence
    if (settings.libraryIcon && !libraryDesigns.some((d) => d.id === settings.libraryIcon)) add(settings.libraryIcon, 'Icône de l’atelier introuvable');
    select.value = settings.customIcon ? '__sd' : settings.libraryIcon || '';
  }
  $('iconSource').onfocus = () => toPlugin({ cmd: 'iconLibrary' });
  $('iconSource').onchange = () => {
    const v = $('iconSource').value;
    if (v === '__sd') { settings.customIcon = true; delete settings.libraryIcon; }
    else if (v) { settings.libraryIcon = v; delete settings.customIcon; }
    else { delete settings.customIcon; delete settings.libraryIcon; }
    if (!settings.libraryIcon) { delete settings.libraryState; delete settings.libraryLampColor; }
    save(true);
    renderLook();
  };

  /** Icône de l'atelier : aperçu des deux versions et version affichée. */
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  let pairFor = '';
  function renderLibraryLook() {
    const id = settings.libraryIcon || '';
    $('library-look').hidden = !id;
    if (!id) { pairFor = ''; return; }
    if (pairFor !== id) {
      pairFor = id;
      $('libOn').src = $('libOff').src = BLANK;
      toPlugin({ cmd: 'iconPair', id });
    }
    const d = libraryDesigns.find((x) => x.id === id);
    const two = !!d && !!d.twoStates;
    $('libHelp').textContent = !d ? ''
      : two ? 'La touche passe de la version allumée à la version éteinte selon l’état de l’entité.'
      : 'Cette icône n’a qu’une version. Pour lui en donner une éteinte, ouvre-la dans l’atelier, onglet « Éteint ».';
    $('libraryState').value = settings.libraryState || 'auto';
    $('libraryLampColor').checked = !!settings.libraryLampColor;
    $('libLampRow').hidden = domainOf(settings.entity) !== 'light';
  }
  $('libraryState').onchange = () => set('libraryState', $('libraryState').value === 'auto' ? undefined : $('libraryState').value);
  $('libraryLampColor').onchange = () => set('libraryLampColor', $('libraryLampColor').checked ? true : undefined);

  function bindField(id, key) {
    const el = $(id);
    el.oninput = el.onchange = () => {
      const v = key === 'titleText' ? el.value : el.value.trim();
      set(key, v === '' ? undefined : v);
      if (key === 'titleMode') $('titleText').hidden = v !== 'custom';
    };
  }
  bindField('style', 'style');
  bindField('titleMode', 'titleMode');
  bindField('titleText', 'titleText');
  bindField('valueMode', 'valueMode');
  $('color').oninput = () => set('color', $('color').value);
  $('colorOff').oninput = () => set('colorOff', $('colorOff').value);
  document.querySelectorAll('[data-raz]').forEach((b) => (b.onclick = () => {
    set(b.dataset.raz, undefined, true);
    renderLook();
  }));
  // cases dont la valeur par défaut dépend du type d'entité : on garde « vrai/faux » explicites
  $('gauge').onchange = () => set('gauge', $('gauge').checked);
  $('lightColor').onchange = () => set('lightColor', $('lightColor').checked ? undefined : false);
  $('art').onchange = () => set('art', $('art').checked ? undefined : false);

  function renderLook() {
    fillIconSource();
    renderLibraryLook();
    // Images Stream Deck et icônes de l'atelier gardent leur propre dessin : pas de style ni de couleurs.
    $('auto-look').hidden = !!settings.customIcon || !!settings.libraryIcon;
    $('style').value = settings.style || 'accent';
    $('color').value = /^#[0-9a-f]{6}$/i.test(settings.color || '') ? settings.color : '#e8c547';
    $('colorOff').value = /^#[0-9a-f]{6}$/i.test(settings.colorOff || '') ? settings.colorOff : '#555b66';
    $('titleMode').value = settings.titleMode || 'auto';
    $('titleText').value = settings.titleText || '';
    $('titleText').hidden = (settings.titleMode || 'auto') !== 'custom';
    $('valueMode').value = settings.valueMode || 'auto';
    const d = domainOf(settings.entity);
    $('gauge').checked = settings.gauge != null ? !!settings.gauge : ['light', 'cover', 'media_player', 'fan'].includes(d);
    $('gauge').parentElement.hidden = !!settings.customIcon || !!settings.libraryIcon;
    $('lightColor').checked = settings.lightColor !== false;
    $('lightColor').parentElement.hidden = d !== 'light' || !!settings.customIcon || !!settings.libraryIcon;
    $('art').checked = settings.art !== false;
    $('art').parentElement.hidden = d !== 'media_player' || !!settings.customIcon || !!settings.libraryIcon;
    $('confirm').checked = !!settings.confirm;
  }

  /* ───────── règles ───────── */

  function renderRules() {
    const box = $('regles');
    box.innerHTML = '';
    (settings.rules || []).forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'regle';
      row.innerHTML =
        '<select><option value="above">Au-dessus de</option><option value="below">En dessous de</option><option value="is">Est</option><option value="not">N’est pas</option></select>' +
        '<input placeholder="25 ou on" /><input type="color" title="Couleur" /><label class="coche" title="Clignoter"><input type="checkbox" /> ✺</label><button type="button" class="x" title="Supprimer">×</button>';
      const [sel, val, col] = row.querySelectorAll('select, input:not([type=checkbox])');
      const blink = row.querySelector('input[type=checkbox]');
      sel.value = r.when || 'above';
      val.value = r.value || '';
      col.value = /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#ef7d6b';
      blink.checked = !!r.blink;
      const upd = () => {
        settings.rules[i] = { when: sel.value, value: val.value, color: col.value, blink: blink.checked || undefined, icon: r.icon };
        save();
      };
      sel.onchange = val.oninput = col.oninput = blink.onchange = upd;
      row.querySelector('.x').onclick = () => {
        settings.rules.splice(i, 1);
        if (!settings.rules.length) delete settings.rules;
        save(true);
        renderRules();
      };
      box.appendChild(row);
    });
  }
  $('regle-plus').onclick = () => {
    settings.rules = (settings.rules || []).concat([{ when: 'above', value: '', color: '#ef7d6b' }]);
    save(true);
    renderRules();
  };

  /* ───────── boutons ───────── */

  $('full-editor').onclick = () => toPlugin({ cmd: 'editor' });

  $('tester').onclick = () => {
    save(true);
    etat('Envoi…');
    toPlugin({ cmd: 'test' });
  };

  /** Réglages retirés de l'interface (simplification) : on les efface pour que la touche
   *  ressemble à ce que montre le panneau. */
  const RETIRES = ['icon', 'iconOff', 'textColor', 'decimals', 'modelId'];
  function cleanRemoved() {
    if (!RETIRES.some((k) => settings[k] !== undefined)) return;
    for (const k of RETIRES) delete settings[k];
    // Panneau pas encore relié au Stream Deck : enregistré à l'ouverture de la connexion.
    if (ws && ws.readyState === 1) save(true);
    else cleanPending = true;
  }
  let cleanPending = false;

  function renderAll() {
    cleanRemoved();
    $('ent-titre').textContent = kind() ? kind().t : 'Entité';
    $('q').placeholder = kind() ? 'Chercher : ' + kind().t.toLowerCase() + ', pièce…' : 'Chercher : salon, lampe, température…';
    renderChosen();
    renderResults();
    renderMode();
    renderPanel();
    renderLook();
    renderRules();
    window.haEditorLayout?.refresh();
  }
  renderAll();
  if (largeEditor) {
    const layout = window.mountHaEditorLayout({ save: () => save(true), getSettings: () => settings });
    if (window.api.settings?.get) window.api.settings.get().then((s) => {
      const a = s.appearance || {};
      document.documentElement.dataset.accent = a.accent || 'lavande';
      document.documentElement.dataset.theme = a.theme === 'clair' || (a.theme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }).catch(() => {});
    window.api.haKeyEditor.onMessage((message) => {
      if (message.event === 'didReceiveSettings') receiveSettings(message.settings || {});
      else if (message.event === 'sendToPropertyInspector') onPlugin(message.payload || {});
    });
    window.api.haKeyEditor.init().then((data) => {
      actionUUID = data.action;
      kindId = (/^com\.supernon0\.multioutils\.ha\.([a-z]+)$/.exec(actionUUID || '') || [])[1] || '';
      settings = data.settings || {}; renderAll();
      layout.setTitle('Home Assistant · ' + (kind()?.t || 'votre touche'));
      for (const cmd of ['status', 'catalog', 'services', 'preview', 'iconLibrary']) toPlugin({ cmd });
      if (settings.entity) toPlugin({ cmd: 'state', id: settings.entity });
    }).catch((error) => etat(String(error), 'err'));
    const timer = setInterval(() => { toPlugin({ cmd: 'preview' }); if (settings.entity) toPlugin({ cmd: 'state', id: settings.entity }); }, 2000);
    window.addEventListener('beforeunload', () => { clearInterval(timer); save(true); layout.dispose(); });
  }
})();
