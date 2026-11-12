import { describe, expect, it } from 'vitest';
import {
  classifySoundRef,
  matchSoundFile,
  cpuPercent,
  haButtonScripts,
  haDeviceName,
  haNotifyService,
  haSlugify,
  haWebSocketUrl,
  parseHaMessage,
  pushToast,
  reconnectDelay,
  registrationPayload,
  resolveHaImage,
  resolveHaLink,
  sanitizeColor,
  sanitizeIcon,
  sensorUpdates
} from './ha-link';
import { defaultLauncherSettings, mergeLauncherSettings, sanitizeHaSettings, sanitizeLauncherSettings } from './settings';
import type { HaNotification } from '../../../../common/launcher';

const D = { duration: 8, sound: true };

describe('Home Assistant : nom et adresses', () => {
  it('slugifie comme HA', () => {
    expect(haSlugify('CONNOR-VII')).toBe('connor_vii');
    expect(haSlugify('PC de Noë')).toBe('pc_de_noe');
    expect(haNotifyService('PC')).toBe('notify.mobile_app_pc');
  });
  it('appelle l\'appareil « PC » par défaut', () => {
    expect(haDeviceName('')).toBe('PC');
    expect(haDeviceName('  Bureau ')).toBe('Bureau');
  });
  it('construit l\'adresse WebSocket', () => {
    expect(haWebSocketUrl('http://ha.local:8123')).toBe('ws://ha.local:8123/api/websocket');
    expect(haWebSocketUrl('https://x.ui.nabu.casa')).toBe('wss://x.ui.nabu.casa/api/websocket');
  });
  it('demande le canal local push à l\'enregistrement', () => {
    const p = registrationPayload({
      deviceId: 'id',
      deviceName: 'PC',
      appVersion: '0.8.0',
      manufacturer: 'MultiOutils',
      model: 'PC Windows',
      osName: 'Windows',
      osVersion: '10'
    });
    expect(p.app_data).toEqual({ push_websocket_channel: true });
    expect(p.supports_encryption).toBe(false);
  });
});

describe('Home Assistant : boutons', () => {
  it('crée quatre scripts qui appellent le service du PC', () => {
    const b = haButtonScripts('PC', true);
    expect(b.map((x) => x.objectId)).toEqual(['pc_veille', 'pc_verrouiller', 'pc_eteindre', 'pc_redemarrer']);
    expect(b[0].config.sequence).toEqual([{ action: 'notify.mobile_app_pc', data: { message: 'command_sleep' } }]);
  });
  it('sans Éteindre / Redémarrer si non autorisés', () => {
    expect(haButtonScripts('PC', false).map((x) => x.objectId)).toEqual(['pc_veille', 'pc_verrouiller']);
  });
});

describe('Home Assistant : messages reçus', () => {
  it('lit une notification simple', () => {
    const r = parseHaMessage({ title: 'Lessive', message: 'Le linge est prêt' }, D, 'a', 1000);
    expect(r).toMatchObject({ kind: 'notify', notification: { title: 'Lessive', message: 'Le linge est prêt', duration: 8, important: false, sound: true } });
  });
  it('message sans titre → titre Home Assistant', () => {
    const r = parseHaMessage({ message: 'Bonjour' }, D, 'a');
    expect(r?.kind === 'notify' && r.notification.title).toBe('Home Assistant');
    expect(r?.kind === 'notify' && r.notification.message).toBe('Bonjour');
  });
  it('champs de l\'appli mobile : image, actions, tag, couleur, icône', () => {
    const r = parseHaMessage(
      {
        title: 'Sonnette',
        message: 'Quelqu\'un sonne',
        data: {
          image: '/api/camera_proxy/camera.entree',
          tag: 'porte',
          color: 'red',
          icon: 'mdi:bell-ring',
          actions: [
            { action: 'OUVRIR', title: 'Ouvrir', destructive: true },
            { action: 'URI', title: 'Voir', uri: '/lovelace/cameras' },
            { action: 'X', title: 'X' },
            { action: 'Y', title: 'trop' }
          ]
        }
      },
      D,
      'a'
    );
    expect(r?.kind).toBe('notify');
    if (r?.kind !== 'notify') return;
    expect(r.imageSrc).toBe('/api/camera_proxy/camera.entree');
    expect(r.notification.tag).toBe('porte');
    expect(r.notification.color).toBe('corail');
    expect(r.notification.icon).toBe('bellon');
    expect(r.notification.actions).toHaveLength(3);
    expect(r.notification.actions[0]).toEqual({ action: 'OUVRIR', title: 'Ouvrir', danger: true });
    expect(r.notification.actions[1].uri).toBe('/lovelace/cameras');
  });
  it('importante = reste à l\'écran', () => {
    for (const data of [{ sticky: true }, { importance: 'high' }, { push: { 'interruption-level': 'critical' } }]) {
      const r = parseHaMessage({ message: 'x', data }, D, 'a');
      expect(r?.kind === 'notify' && r.notification).toMatchObject({ important: true, duration: 0 });
    }
    const r = parseHaMessage({ message: 'x', data: { sticky: true, duration: 20 } }, D, 'a');
    expect(r?.kind === 'notify' && r.notification.duration).toBe(20);
  });
  it('son coupé', () => {
    const r = parseHaMessage({ message: 'x', data: { sound: 'none' } }, D, 'a');
    expect(r?.kind === 'notify' && r.notification.sound).toBe(false);
  });
  it('effacement et commandes', () => {
    expect(parseHaMessage({ message: 'clear_notification', data: { tag: 'porte' } }, D, 'a')).toEqual({ kind: 'clear', tag: 'porte' });
    expect(parseHaMessage({ message: 'command_sleep' }, D, 'a')).toEqual({ kind: 'command', command: 'sleep' });
    expect(parseHaMessage({ message: 'command_restart' }, D, 'a')).toEqual({ kind: 'command', command: 'restart' });
    expect(parseHaMessage({ message: 'command_open_url', data: { url: 'https://x.fr' } }, D, 'a')).toEqual({
      kind: 'command',
      command: 'open_url',
      url: 'https://x.fr'
    });
    expect(parseHaMessage({ message: 'command_open_url', data: { url: 'file:///c:/x' } }, D, 'a')).toBeNull();
    expect(parseHaMessage({ message: 'command_format_c' }, D, 'a')).toBeNull();
  });
  it('ignore les liens dangereux', () => {
    const r = parseHaMessage({ message: 'x', data: { url: 'javascript:alert(1)' } }, D, 'a');
    expect(r?.kind === 'notify' && r.notification.url).toBeUndefined();
  });
  it('couleurs et icônes', () => {
    expect(sanitizeColor('#ABC')).toBe('#aabbcc');
    expect(sanitizeColor('menthe')).toBe('menthe');
    expect(sanitizeColor('url(x)')).toBeUndefined();
    expect(sanitizeIcon('🧺')).toBe('🧺');
    expect(sanitizeIcon('mdi:inconnu')).toBe('bell');
    expect(sanitizeIcon('<b>')).toBeUndefined();
  });
});

describe('Home Assistant : pile, images, liens', () => {
  const n = (id: string, extra: Partial<HaNotification> = {}): HaNotification => ({
    id,
    title: id,
    message: '',
    duration: 8,
    important: false,
    sound: false,
    actions: [],
    receivedAt: 0,
    ...extra
  });
  it('même tag = remplace', () => {
    const list = pushToast([n('a', { tag: 't' }), n('b')], n('c', { tag: 't' }));
    expect(list.map((x) => x.id)).toEqual(['c', 'b']);
  });
  it('garde les importantes quand la pile déborde', () => {
    const list = pushToast([n('a'), n('b'), n('imp', { important: true })], n('d'), 3);
    expect(list.map((x) => x.id)).toEqual(['d', 'a', 'imp']);
  });
  it('jeton seulement pour Home Assistant', () => {
    const b = 'http://ha.local:8123';
    expect(resolveHaImage('/api/camera_proxy/camera.x', b)).toEqual({ url: `${b}/api/camera_proxy/camera.x`, auth: true });
    expect(resolveHaImage('http://ha.local:8123/local/a.jpg', b)?.auth).toBe(true);
    expect(resolveHaImage('https://autre.fr/a.jpg', b)?.auth).toBe(false);
    expect(resolveHaImage('file:///c:/a.jpg', b)).toBeNull();
  });
  it('lien HA → mini fenêtre, autre → navigateur', () => {
    expect(resolveHaLink('/lovelace/0', 'http://ha.local:8123')).toEqual({ kind: 'dashboard', path: '/lovelace/0' });
    expect(resolveHaLink('http://ha.local:8123/energy?x=1', 'http://ha.local:8123')).toEqual({ kind: 'dashboard', path: '/energy?x=1' });
    expect(resolveHaLink('https://meteo.fr', 'http://ha.local:8123')).toEqual({ kind: 'external', url: 'https://meteo.fr' });
  });
});

describe('Home Assistant : capteurs et reconnexion', () => {
  it('n\'envoie que ce qui change', () => {
    const prev = { cpu_usage: 10, active: true, locked: false };
    const next = { cpu_usage: 10, active: false, locked: false };
    expect(sensorUpdates(next, prev).map((u) => u.unique_id)).toEqual(['active']);
    expect(sensorUpdates(next, prev, true)).toHaveLength(3);
  });
  it('calcule l\'usage processeur', () => {
    const a = [{ times: { user: 100, sys: 0, idle: 100 } }];
    const b = [{ times: { user: 150, sys: 0, idle: 150 } }];
    expect(cpuPercent(a, b)).toBe(50);
  });
  it('attend de plus en plus, jusqu\'à 60 s', () => {
    expect(reconnectDelay(0)).toBe(2000);
    expect(reconnectDelay(3)).toBe(16000);
    expect(reconnectDelay(20)).toBe(60000);
  });
});

describe('Home Assistant : réglages', () => {
  it('lit l\'ancien format { url }', () => {
    const s = sanitizeLauncherSettings({ homeAssistant: { url: 'http://ha:8123' } });
    expect(s.homeAssistant.url).toBe('http://ha:8123');
    expect(s.homeAssistant.link.enabled).toBe(false);
    expect(s.homeAssistant.dashboard.shortcut).toBe('Alt+Shift+H');
  });
  it('fusionne un patch imbriqué sans perdre le reste', () => {
    const cur = sanitizeLauncherSettings({ homeAssistant: { url: 'http://ha:8123' } });
    const next = mergeLauncherSettings(cur, { homeAssistant: { link: { enabled: true } } });
    expect(next.homeAssistant.url).toBe('http://ha:8123');
    expect(next.homeAssistant.link.enabled).toBe(true);
    expect(next.homeAssistant.link.sensors).toBe(true);
  });
  it('borne les valeurs et nettoie le chemin', () => {
    const h = sanitizeHaSettings({
      link: { sensorInterval: 1 },
      notifications: { duration: 9999, position: 'milieu' },
      dashboard: { path: 'javascript:alert(1)', width: 10 }
    });
    expect(h.link.sensorInterval).toBe(15);
    expect(h.notifications.duration).toBe(120);
    expect(h.notifications.position).toBe('bottom-right');
    expect(h.dashboard.path).toBe('');
    expect(h.dashboard.width).toBe(320);
    expect(sanitizeHaSettings({ dashboard: { path: 'lovelace/0' } }).dashboard.path).toBe('/lovelace/0');
  });
  it('valeurs par défaut', () => {
    expect(defaultLauncherSettings().homeAssistant.link.powerCommands).toBe(true);
  });
});

describe('Home Assistant : emplacement, taille et sons', () => {
  const D = { duration: 8, sound: true };
  it('lit position, taille et volume (anglais ou français)', () => {
    const r = parseHaMessage({ message: 'x', data: { position: 'centre', size: 'grande', volume: 140 } }, D, 'a');
    expect(r?.kind === 'notify' && r.notification).toMatchObject({ position: 'center', size: 'large', volume: 100 });
    const r2 = parseHaMessage({ message: 'x', data: { position: 'top_center', size: 'small' } }, D, 'a');
    expect(r2?.kind === 'notify' && r2.notification).toMatchObject({ position: 'top-center', size: 'small' });
    const r3 = parseHaMessage({ message: 'x', data: { position: 'milieu', size: 'normal' } }, D, 'a');
    expect(r3?.kind === 'notify' && r3.notification.position).toBeUndefined();
    expect(r3?.kind === 'notify' && r3.notification.size).toBeUndefined();
  });
  it('sound : nom, adresse, false, true', () => {
    const named = parseHaMessage({ message: 'x', data: { sound: 'sonnette' } }, { duration: 8, sound: false }, 'a');
    expect(named).toMatchObject({ kind: 'notify', soundRef: 'sonnette', notification: { sound: true } });
    const off = parseHaMessage({ message: 'x', data: { sound: 'none' } }, D, 'a');
    expect(off).toMatchObject({ notification: { sound: false } });
    expect(off && 'soundRef' in off).toBe(false);
    const def = parseHaMessage({ message: 'x', data: { sound: true } }, D, 'a');
    expect(def && 'soundRef' in def).toBe(false);
    const ios = parseHaMessage({ message: 'x', data: { push: { sound: 'default' } } }, D, 'a');
    expect(ios && 'soundRef' in ios).toBe(false);
  });
  it('classe les sons demandés', () => {
    const base = 'http://ha.local:8123';
    expect(classifySoundRef('Cloche', base)).toEqual({ kind: 'builtin', name: 'cloche' });
    expect(classifySoundRef('/local/sons/porte.mp3', base)).toEqual({ kind: 'url', url: `${base}/local/sons/porte.mp3`, auth: true });
    expect(classifySoundRef('https://exemple.fr/a.mp3', base)).toEqual({ kind: 'url', url: 'https://exemple.fr/a.mp3', auth: false });
    expect(classifySoundRef('porte', base)).toEqual({ kind: 'file', name: 'porte' });
    expect(classifySoundRef('../secret.mp3', base)).toBeNull();
    expect(classifySoundRef('C:\\Windows\\a.wav', base)).toBeNull();
    expect(classifySoundRef('/local/a.mp3', null)).toBeNull();
  });
  it('retrouve un fichier du dossier des sons', () => {
    const files = ['Porte.mp3', 'alarme.wav', 'notes.txt'];
    expect(matchSoundFile('porte', files)).toBe('Porte.mp3');
    expect(matchSoundFile('ALARME.WAV', files)).toBe('alarme.wav');
    expect(matchSoundFile('notes', files)).toBeNull();
  });
  it('réglages : son par défaut et volume bornés', () => {
    const h = sanitizeHaSettings({ notifications: { soundName: '../x', volume: 250, position: 'center' } });
    expect(h.notifications).toMatchObject({ soundName: 'carillon', volume: 100, position: 'center' });
  });
});
