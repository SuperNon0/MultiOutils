import { describe, expect, it } from 'vitest';
import { evaluate, tryCalculate } from './calculator';
import { LauncherEngine, type Provider, type ProviderItem } from './engine';
import { bestMatch, fuzzyMatch, normalizeText } from './matcher';
import {
  dedupeBookmarks,
  groupProcesses,
  mapFirefoxRows,
  parseChromiumBookmarks,
  parsePathLines,
  parsePsOutput,
  parseStartApps,
  parseTasklistCsv,
  parseUrlShortcut,
  splitCsvLine,
  windowsSearchScript
} from './parsers';
import { compileExcludes, parseQuery } from './query';
import { pushHistory, rank, UsageRecord } from './ranking';
import { defaultLauncherSettings, mergeLauncherSettings, sanitizeLauncherSettings } from './settings';
import { buildSearchUrl, detectUrl, engineHome } from './web';

describe('matcher (portage du StringMatcher de Flow)', () => {
  it('trouve les acronymes', () => {
    const m = fuzzyMatch('vsc', 'Visual Studio Code');
    expect(m.success).toBe(true);
    expect(m.indices).toEqual([0, 7, 14]);
    expect(m.score).toBe(100);
  });

  it('compte un groupe de chiffres comme un seul acronyme', () => {
    const m = fuzzyMatch('vs2019', 'Visual Studio 2019');
    expect(m.success).toBe(true);
  });

  it('préfère le début de mot et les correspondances resserrées', () => {
    const a = fuzzyMatch('chr', 'Google Chrome');
    const b = fuzzyMatch('chr', 'Richard Archer');
    expect(a.success).toBe(true);
    expect(a.score).toBeGreaterThan(b.success ? b.score : 0);
    expect(a.indices).toEqual([7, 8, 9]);
  });

  it('ignore accents et casse', () => {
    expect(normalizeText('Écran Été')).toBe('ecran ete');
    const m = fuzzyMatch('ecran', 'Capture d’écran');
    expect(m.success).toBe(true);
    expect(m.indices.length).toBe(5);
  });

  it('gère plusieurs mots dans l’ordre', () => {
    expect(fuzzyMatch('note pad', 'Notepad++').success).toBe(true);
    expect(fuzzyMatch('pad note', 'Notepad++').success).toBe(false);
    expect(fuzzyMatch('micro word', 'Microsoft Word').success).toBe(true);
  });

  it('échoue proprement', () => {
    expect(fuzzyMatch('xyz', 'Firefox').success).toBe(false);
    expect(fuzzyMatch('', 'Firefox').success).toBe(false);
    expect(fuzzyMatch('a', '').success).toBe(false);
  });

  it('une chaîne courte et exacte bat une longue', () => {
    const a = fuzzyMatch('code', 'Code');
    const b = fuzzyMatch('code', 'Code Composer Studio Professional Edition');
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('bestMatch pondère les champs', () => {
    const m = bestMatch('chrome', [
      { text: 'Navigateur', weight: 1 },
      { text: 'chrome', weight: 0.5 }
    ]);
    expect(m?.field).toBe(1);
    expect(m && m.score).toBeGreaterThan(0);
  });
});

describe('calculatrice sûre', () => {
  it.each([
    ['1+2*3', 7],
    ['(1+2)*3', 9],
    ['2^3^2', 512],
    ['-2^2', -4],
    ['10/4', 2.5],
    ['10 % 3', 1],
    ['200*10%', 20],
    ['50%', 0.5],
    ['sqrt(16)', 4],
    ['sqrt 16', 4],
    ['abs(-3)', 3],
    ['round(2.6)', 3],
    ['log(1000)', 3],
    ['ln(e)', 1],
    ['2pi', Math.PI * 2],
    ['3(4+1)', 15],
    ['5!', 120],
    ['3 x 4', 12],
    ['6 ÷ 3 × 2', 4],
    ['1e3+1', 1001],
    ['cos(0)', 1]
  ])('%s = %d', (expr, expected) => {
    expect(evaluate(expr).value).toBeCloseTo(expected, 10);
  });

  it('accepte la virgule décimale et la rend', () => {
    const r = evaluate('1,5 + 2,25');
    expect(r.value).toBe(3.75);
    expect(r.text).toBe('3,75');
  });

  it('supprime le bruit flottant', () => {
    expect(evaluate('0.1+0.2').text).toBe('0.3');
  });

  it('refuse le code et les erreurs', () => {
    expect(tryCalculate('process.exit()')).toBeNull();
    expect(tryCalculate('alert(1)')).toBeNull();
    expect(tryCalculate('1/0')).toBeNull();
    expect(tryCalculate('2+')).toBeNull();
    expect(tryCalculate('constructor')).toBeNull();
  });

  it('ne répond pas à un nombre seul ou à un mot', () => {
    expect(tryCalculate('42')).toBeNull();
    expect(tryCalculate('chrome')).toBeNull();
    expect(tryCalculate('2026-11-04')).toBeNull();
    expect(tryCalculate('2+2')?.text).toBe('4');
    expect(tryCalculate('pi')?.value).toBeCloseTo(Math.PI);
  });
});

describe('mots-clés d’action', () => {
  const bindings = [
    { keyword: 'g', target: 'google' },
    { keyword: 'gh', target: 'github' },
    { keyword: '>', target: 'shell' },
    { keyword: 'kill', target: 'proc' }
  ];

  it('reconnaît un mot-clé suivi d’un espace', () => {
    const q = parseQuery('g  chats mignons', bindings);
    expect(q.keyword).toBe('g');
    expect(q.targets).toEqual(['google']);
    expect(q.search).toBe('chats mignons');
    expect(q.terms).toEqual(['chats', 'mignons']);
  });

  it('le plus long gagne', () => {
    expect(parseQuery('gh electron', bindings).targets).toEqual(['github']);
  });

  it('n’active pas un mot-clé collé à un mot', () => {
    const q = parseQuery('gmail', bindings);
    expect(q.keyword).toBe('');
    expect(q.search).toBe('gmail');
    expect(parseQuery('g', bindings).keyword).toBe('');
    expect(parseQuery('g ', bindings).keyword).toBe('g');
  });

  it('accepte un symbole collé', () => {
    const q = parseQuery('>ipconfig /all', bindings);
    expect(q.keyword).toBe('>');
    expect(q.search).toBe('ipconfig /all');
    expect(parseQuery('>', bindings).targets).toEqual(['shell']);
  });

  it('insensible à la casse', () => {
    expect(parseQuery('KILL chrome', bindings).targets).toEqual(['proc']);
  });

  it('exclusions : sous-chaîne et joker', () => {
    const ex = compileExcludes(['\\node_modules\\', '*.tmp', '  ']);
    expect(ex('C:\\dev\\node_modules\\a.js')).toBe(true);
    expect(ex('C:\\x\\file.TMP')).toBe(true);
    expect(ex('C:\\x\\file.txt')).toBe(false);
  });
});

describe('classement et mémoire d’usage', () => {
  it('compte comme Flow (requête × 5 + résultat)', () => {
    const u = new UsageRecord();
    u.add('chr', 'programs:chrome');
    u.add('chr', 'programs:chrome');
    u.add('', 'programs:chrome');
    expect(u.selectedCount('chr', 'programs:chrome')).toBe(2 * 5 + 3);
    expect(u.selectedCount('xyz', 'programs:chrome')).toBe(3);
    const restored = new UsageRecord(u.toJSON());
    expect(restored.selectedCount('chr', 'programs:chrome')).toBe(13);
  });

  it('élague les entrées rares au-delà du maximum', () => {
    const u = new UsageRecord({}, 10);
    for (let i = 0; i < 20; i++) u.add('', `k${i}`);
    expect(u.size).toBeLessThanOrEqual(10);
  });

  it('trie, dédoublonne, limite, garde pinBottom à la fin', () => {
    const usage = new UsageRecord();
    usage.add('a', 'x');
    const ranked = rank(
      [
        { id: '1', recordKey: 'x', score: 50 },
        { id: '2', recordKey: 'y', score: 60 },
        { id: '3', recordKey: 'y', score: 90 },
        { id: '4', recordKey: 'web', score: 0, pinBottom: true },
        { id: '5', recordKey: 'z', score: 10 }
      ],
      usage,
      'a',
      2
    );
    expect(ranked.map((r) => r.id)).toEqual(['3', '1', '4']);
    expect(ranked[1].final).toBe(50 + 6);
  });

  it('historique sans doublon, le plus récent d’abord', () => {
    let h: string[] = [];
    h = pushHistory(h, 'chrome');
    h = pushHistory(h, 'calc');
    h = pushHistory(h, 'Chrome ');
    h = pushHistory(h, '   ');
    expect(h).toEqual(['Chrome', 'calc']);
  });
});

describe('web', () => {
  it('construit l’adresse', () => {
    expect(buildSearchUrl('https://g.com/s?q={q}', 'a b&c')).toBe('https://g.com/s?q=a%20b%26c');
    expect(buildSearchUrl('https://g.com/s?q=', 'x')).toBe('https://g.com/s?q=x');
    expect(engineHome('https://www.youtube.com/results?search_query={q}')).toBe('https://www.youtube.com/');
  });

  it.each([
    ['github.com', 'https://github.com'],
    ['www.exemple.fr/page?x=1', 'https://www.exemple.fr/page?x=1'],
    ['http://intranet/app', 'http://intranet/app'],
    ['localhost:3000', 'http://localhost:3000'],
    ['192.168.1.1', 'http://192.168.1.1'],
    ['notes.txt', null],
    ['3.14', null],
    ['bonjour', null],
    ['deux mots.com', null],
    ['999.1.1.1', null]
  ])('détecte %s', (input, expected) => {
    expect(detectUrl(input)).toBe(expected);
  });
});

describe('analyse des données externes', () => {
  it('favoris Chromium', () => {
    const json = JSON.stringify({
      roots: {
        bookmark_bar: {
          type: 'folder',
          children: [
            { type: 'url', name: 'GitHub', url: 'https://github.com/' },
            { type: 'folder', children: [{ type: 'url', name: '', url: 'https://x.fr' }] },
            { type: 'url', name: 'JS', url: 'javascript:alert(1)' }
          ]
        },
        other: { type: 'folder', children: [] }
      }
    });
    const list = parseChromiumBookmarks(json, 'Chrome');
    expect(list).toEqual([
      { title: 'GitHub', url: 'https://github.com/', source: 'Chrome' },
      { title: 'https://x.fr', url: 'https://x.fr', source: 'Chrome' }
    ]);
    expect(parseChromiumBookmarks('pas du json', 'Chrome')).toEqual([]);
  });

  it('favoris Firefox + dédoublonnage', () => {
    const list = mapFirefoxRows([
      { title: 'MDN', url: 'https://developer.mozilla.org/' },
      { title: null, url: 'place:sort=8' },
      { title: 'Vide', url: null }
    ]);
    expect(list).toEqual([{ title: 'MDN', url: 'https://developer.mozilla.org/', source: 'Firefox' }]);
    expect(
      dedupeBookmarks([
        { title: 'a', url: 'https://a.fr/', source: 'Chrome' },
        { title: 'b', url: 'https://A.fr', source: 'Edge' }
      ])
    ).toHaveLength(1);
  });

  it('tasklist (CSV) et ps', () => {
    expect(splitCsvLine('"a","b,c","d ""e"""')).toEqual(['a', 'b,c', 'd "e"']);
    const procs = parseTasklistCsv(
      '"System","4","Services","0","148 Ko"\r\n"chrome.exe","1200","Console","1","120 532 K"\r\n"chrome.exe","1300","Console","1","80 000 K"\r\n"notepad.exe","42","Console","1","9 000 K"\r\n'
    );
    expect(procs).toHaveLength(4);
    expect(procs[1]).toEqual({ name: 'chrome.exe', pid: 1200, memKb: 120532 });
    const groups = groupProcesses(procs, [42]);
    expect(groups.map((g) => g.name)).toEqual(['chrome.exe']);
    expect(groups[0].pids).toEqual([1200, 1300]);
    expect(parsePsOutput('  12  3400 /usr/bin/node\n abc\n')).toEqual([{ pid: 12, memKb: 3400, name: 'node' }]);
  });

  it('Get-StartApps : seulement les applis empaquetées', () => {
    const apps = parseStartApps(
      '\uFEFF[{"Name":"Calculatrice","AppID":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"},{"Name":"Notepad++","AppID":"C:\\\\Program Files\\\\Notepad++\\\\notepad++.exe"}]'
    );
    expect(apps).toEqual([{ name: 'Calculatrice', appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' }]);
    expect(parseStartApps('{"Name":"Photos","AppID":"Microsoft.Windows.Photos_8wekyb3d8bbwe!App"}')).toHaveLength(1);
    expect(parseStartApps('')).toEqual([]);
  });

  it('raccourci .url et sorties de recherche', () => {
    expect(parseUrlShortcut('[InternetShortcut]\r\nURL=steam://rungameid/570\r\n')).toBe('steam://rungameid/570');
    expect(parsePathLines('C:\\a.txt\r\n\r\nbruit\r\nD:/b\r\n')).toEqual(['C:\\a.txt', 'D:/b']);
  });

  it('requête Windows Search échappée', () => {
    const script = windowsSearchScript("l'été 100%", 20);
    expect(script).toContain("LIKE '%l''été 100[%]%'");
    expect(script).toContain('SELECT TOP 20');
  });
});

describe('réglages', () => {
  it('valeurs par défaut complètes', () => {
    const d = defaultLauncherSettings();
    expect(d.shortcut).toBe('Alt+Space');
    expect(d.providers.shell.keyword).toBe('>');
    expect(d.webEngines.find((e) => e.keyword === 'g')?.name).toBe('Google');
  });

  it('nettoie une valeur corrompue', () => {
    const s = sanitizeLauncherSettings({ maxResults: 999, lastQuery: 'n/a', providers: { files: { enabled: false } }, webEngines: 'x' });
    expect(s.maxResults).toBe(30);
    expect(s.lastQuery).toBe('selected');
    expect(s.providers.files).toEqual({ enabled: false, keyword: 'f' });
    expect(s.webEngines.length).toBeGreaterThan(3);
    expect(sanitizeLauncherSettings(null)).toEqual(defaultLauncherSettings());
  });

  it('fusionne un patch partiel', () => {
    const s = mergeLauncherSettings(defaultLauncherSettings(), { shell: { kind: 'powershell', keepOpen: false } });
    expect(s.shell).toEqual({ kind: 'powershell', keepOpen: false });
    expect(s.providers.programs.enabled).toBe(true);
  });
});

describe('moteur', () => {
  const provider = (id: string, items: ProviderItem[], opts: Partial<Provider> = {}): Provider => ({
    id: id as Provider['id'],
    global: true,
    query: () => items,
    execute: () => ({ kind: 'hide' }),
    ...opts
  });
  const item = (title: string, score: number): ProviderItem => ({ title, score, icon: { kind: 'sprite', name: 'grid' } });

  it('fusionne, classe et respecte les mots-clés', async () => {
    const emitted: Array<{ id: number; titles: string[]; done: boolean }> = [];
    const slow: Provider = provider('files', [], {
      query: () => new Promise((r) => setTimeout(() => r([item('lent', 500)]), 30))
    });
    const engine = new LauncherEngine({
      providers: [
        { provider: provider('programs', [item('B', 10), item('A', 90)]), keyword: '' },
        { provider: slow, keyword: '' },
        { provider: provider('shell', [item('cmd', 1)], { global: false }), keyword: '>' }
      ],
      usage: new UsageRecord(),
      limit: () => 5,
      emit: (id, results, done) => emitted.push({ id, titles: results.map((r) => r.title), done })
    });
    engine.query('x');
    await new Promise((r) => setTimeout(r, 80));
    const last = emitted[emitted.length - 1];
    expect(last.done).toBe(true);
    expect(last.titles).toEqual(['lent', 'A', 'B']);
    expect(emitted[0].titles).toEqual(['A', 'B']); // premiers résultats sans attendre le lent

    emitted.length = 0;
    engine.query('>dir');
    await new Promise((r) => setTimeout(r, 10));
    expect(emitted[emitted.length - 1].titles).toEqual(['cmd']);
  });

  it('annule la requête précédente', async () => {
    const emitted: number[] = [];
    const engine = new LauncherEngine({
      providers: [
        {
          provider: provider('files', [], {
            query: ({ signal }) =>
              new Promise((r) => setTimeout(() => r(signal.aborted ? [] : [item('x', 1)]), 20))
          }),
          keyword: ''
        }
      ],
      usage: new UsageRecord(),
      limit: () => 5,
      emit: (id) => emitted.push(id)
    });
    engine.query('a', 1);
    engine.query('ab', 2);
    await new Promise((r) => setTimeout(r, 60));
    expect(emitted).toEqual([2]);
  });

  it('exécute et mémorise la sélection', async () => {
    const usage = new UsageRecord();
    let results: Array<{ id: string }> = [];
    const engine = new LauncherEngine({
      providers: [{ provider: provider('programs', [{ ...item('Chrome', 80), recordKey: 'chrome' }]), keyword: '' }],
      usage,
      limit: () => 5,
      emit: (_id, r) => (results = r)
    });
    engine.query('chr');
    await new Promise((r) => setTimeout(r, 10));
    const outcome = await engine.execute(results[0].id, 'primary');
    expect(outcome).toEqual({ kind: 'hide' });
    expect(usage.selectedCount('chr', 'programs:chrome')).toBe(6);
    expect((await engine.execute('inconnu', 'primary')).kind).toBe('error');
  });

  it('barre vide : seulement les fournisseurs « onEmpty »', async () => {
    const titles: string[][] = [];
    const engine = new LauncherEngine({
      providers: [
        { provider: provider('programs', [item('P', 1)]), keyword: '' },
        { provider: provider('history', [item('H', 1)], { global: false, onEmpty: true }), keyword: '' }
      ],
      usage: new UsageRecord(),
      limit: () => 5,
      emit: (_id, r) => titles.push(r.map((x) => x.title))
    });
    engine.query('   ');
    await new Promise((r) => setTimeout(r, 10));
    expect(titles[titles.length - 1]).toEqual(['H']);
  });
});
