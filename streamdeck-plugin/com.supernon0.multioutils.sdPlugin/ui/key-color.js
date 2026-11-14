/*
 * Choix de la couleur d'une touche (panneau de réglages Stream Deck).
 * settings.color : '' = comme l'app (accent + thème de MultiOutils), sinon #rrggbb.
 * La palette vient de l'app (GET /theme) ; quelques couleurs fixes en plus et
 * un sélecteur libre.
 */
(function () {
  const APP = 'http://127.0.0.1:41320';
  const EXTRA = ['#ffffff', '#ef7d6b', '#6fa8ff', '#9aa0a6'];
  const NAMES = { lavande: 'Lavande', or: 'Or', ambre: 'Ambre', corail: 'Corail', menthe: 'Menthe' };

  const css = `
    .kc-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .kc-sw { width: 26px; height: 26px; border-radius: 99px; border: 2px solid transparent; padding: 0; cursor: pointer;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); outline: none; }
    .kc-sw.on { border-color: var(--text); box-shadow: 0 0 0 2px var(--bg) inset; }
    .kc-auto { height: 26px; padding: 0 10px; border-radius: 99px; border: 1px solid var(--border); background: var(--card);
      color: var(--text); font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .kc-auto i { width: 12px; height: 12px; border-radius: 99px; display: inline-block; }
    .kc-auto.on { border-color: var(--accent); color: var(--accent); }
    .kc-free { position: relative; width: 26px; height: 26px; border-radius: 99px; overflow: hidden; border: 1px dashed var(--muted); }
    .kc-free.on { border: 2px solid var(--text); }
    .kc-free input { position: absolute; inset: -6px; width: 40px; height: 40px; border: 0; padding: 0; cursor: pointer; opacity: 0; }
    .kc-free span { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); font-size: 15px; pointer-events: none; }
  `;

  window.mountKeyColor = function (host, getSettings, save) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    host.innerHTML = '<label>Couleur de l’icône</label><div class="kc-row"></div><p class="hint kc-hint"></p>';
    const row = host.querySelector('.kc-row');
    const hint = host.querySelector('.kc-hint');
    let palette = [];
    let appAccent = '#e8c547';

    function set(color) {
      const s = getSettings();
      s.color = color;
      save();
      render();
    }

    function render() {
      const cur = (getSettings().color || '').toLowerCase();
      row.innerHTML = '';
      const auto = document.createElement('button');
      auto.type = 'button';
      auto.className = 'kc-auto' + (cur ? '' : ' on');
      auto.innerHTML = '<i></i>Comme l’app';
      auto.querySelector('i').style.background = appAccent;
      auto.onclick = () => set('');
      row.appendChild(auto);
      const fixed = palette.map((p) => ({ color: p.color, title: NAMES[p.id] || p.id })).concat(EXTRA.map((c) => ({ color: c, title: c })));
      for (const p of fixed) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'kc-sw' + (cur === p.color.toLowerCase() ? ' on' : '');
        b.style.background = p.color;
        b.title = p.title;
        b.onclick = () => set(p.color.toLowerCase());
        row.appendChild(b);
      }
      const isFree = cur && !fixed.some((p) => p.color.toLowerCase() === cur);
      const free = document.createElement('label');
      free.className = 'kc-free' + (isFree ? ' on' : '');
      free.title = 'Autre couleur';
      if (isFree) free.style.background = cur;
      free.innerHTML = '<input type="color" /><span>' + (isFree ? '' : '+') + '</span>';
      const input = free.querySelector('input');
      input.value = cur || appAccent;
      input.onchange = () => set(input.value.toLowerCase());
      row.appendChild(free);
      hint.textContent = cur
        ? 'Cette touche garde sa couleur, quel que soit l’accent de l’app.'
        : 'La touche suit l’accent et le thème clair ou sombre de MultiOutils.';
    }

    async function load() {
      try {
        const res = await fetch(APP + '/theme', { cache: 'no-store' });
        if (res.ok) {
          const t = await res.json();
          palette = Array.isArray(t.palette) ? t.palette : [];
          if (t.accent) appAccent = t.accent;
        }
      } catch (e) {
        /* app fermée : palette fixe seulement */
      }
      render();
    }

    render();
    load();
    return { render: render };
  };
})();
