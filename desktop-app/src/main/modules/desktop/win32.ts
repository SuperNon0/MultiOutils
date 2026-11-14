/**
 * Fonctions Win32 du module Bureau, appelées par FFI (koffi, comme l'Autoclic).
 *
 * - `pinToDesktop` : la fenêtre d'une zone devient « possédée » par le bureau
 *   (Progman). Elle reste alors juste au-dessus du fond d'écran, sous toutes
 *   les autres fenêtres, et survit à Win+D / « Afficher le bureau ».
 * - `sendToBottom` : la renvoie sous les autres fenêtres après un clic.
 * - `setNativeIconsVisible` : masque / réaffiche la liste d'icônes de
 *   l'Explorateur (SysListView32 dans SHELLDLL_DefView). Toujours réversible :
 *   le module réaffiche les icônes en quittant et au démarrage si besoin.
 *
 * Chargement PARESSEUX et dégradation propre : hors Windows ou sans koffi,
 * tout renvoie false et les zones restent de simples fenêtres.
 */

type Hwnd = bigint;

interface User32 {
  FindWindowW(cls: string | null, title: string | null): Hwnd;
  FindWindowExW(parent: Hwnd, after: Hwnd, cls: string | null, title: string | null): Hwnd;
  ShowWindow(hwnd: Hwnd, cmd: number): boolean;
  IsWindowVisible(hwnd: Hwnd): boolean;
  SetWindowPos(hwnd: Hwnd, after: Hwnd, x: number, y: number, cx: number, cy: number, flags: number): boolean;
  SetWindowLongPtrW(hwnd: Hwnd, index: number, value: Hwnd): Hwnd;
  EnumWindows(cb: unknown, lParam: number): boolean;
  WindowFromPoint(pt: { x: number; y: number }): Hwnd;
  GetAncestor(hwnd: Hwnd, flags: number): Hwnd;
  GetWindow(hwnd: Hwnd, cmd: number): Hwnd;
  GetClassNameW(hwnd: Hwnd, buf: Buffer, max: number): number;
  GetAsyncKeyState(vk: number): number;
  GetDoubleClickTime(): number;
  SetWindowsHookExW(id: number, cb: unknown, mod: Hwnd, thread: number): Hwnd;
  CallNextHookEx(hook: Hwnd, code: number, w: bigint | number, l: unknown): Hwnd;
  UnhookWindowsHookEx(hook: Hwnd): boolean;
}

const SW_HIDE = 0;
const SW_SHOW = 5;
const HWND_TOP = 0n;
const GW_HWNDPREV = 3;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;
const GWLP_HWNDPARENT = -8;

let user32: User32 | null = null;
let koffiRef: {
  decode(value: unknown, type: string): unknown;
  register(fn: (...a: unknown[]) => unknown, type: unknown): unknown;
  unregister(cb: unknown): void;
  pointer(t: unknown): unknown;
  proto(sig: string): unknown;
} | null = null;
let enumProto: unknown = null;
let mouseProto: unknown = null;
let getModuleHandle: ((name: string | null) => Hwnd) | null = null;
let procApi: {
  GetForegroundWindow(): Hwnd;
  GetWindowThreadProcessId(h: Hwnd, pid: number[]): number;
  OpenProcess(access: number, inherit: boolean, pid: number): Hwnd;
  QueryFullProcessImageNameW(h: Hwnd, flags: number, buf: Buffer, size: number[]): boolean;
  CloseHandle(h: Hwnd): boolean;
} | null = null;

let initPromise: Promise<void> | null = null;
let initError: string | null = null;

async function init(): Promise<void> {
  if (process.platform !== 'win32') {
    initError = 'platform';
    return;
  }
  try {
    const mod = (await import('koffi')) as unknown as { default?: unknown };
    const koffi = (mod.default ?? mod) as {
      decode(value: unknown, type: string): unknown;
      load(name: string): { func(sig: string): (...a: unknown[]) => unknown };
      register(fn: (...a: unknown[]) => unknown, type: unknown): unknown;
      unregister(cb: unknown): void;
      pointer(t: unknown): unknown;
      proto(sig: string): unknown;
    };
    const lib = koffi.load('user32.dll');
    enumProto = koffi.proto('bool __stdcall MoEnumWindowsProc(intptr hwnd, intptr lParam)');
    const k = koffi as unknown as { struct(name: string, def: Record<string, unknown>): unknown };
    k.struct('MO_POINT', { x: 'long', y: 'long' });
    k.struct('MO_MSLLHOOKSTRUCT', { pt: 'MO_POINT', mouseData: 'uint32', flags: 'uint32', time: 'uint32', extra: 'uintptr' });
    mouseProto = koffi.proto('intptr __stdcall MoLowLevelMouseProc(int nCode, uintptr wParam, MO_MSLLHOOKSTRUCT *lParam)');
    const kernel32 = koffi.load('kernel32.dll');
    getModuleHandle = kernel32.func('intptr __stdcall GetModuleHandleW(str16 name)') as (n: string | null) => Hwnd;
    procApi = {
      GetForegroundWindow: lib.func('intptr __stdcall GetForegroundWindow()') as () => Hwnd,
      GetWindowThreadProcessId: lib.func('uint32 __stdcall GetWindowThreadProcessId(intptr hwnd, _Out_ uint32 *pid)') as (
        h: Hwnd,
        pid: number[]
      ) => number,
      OpenProcess: kernel32.func('intptr __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)') as (a: number, i: boolean, p: number) => Hwnd,
      QueryFullProcessImageNameW: kernel32.func(
        'bool __stdcall QueryFullProcessImageNameW(intptr h, uint32 flags, void *buf, _Inout_ uint32 *size)'
      ) as (h: Hwnd, f: number, buf: Buffer, size: number[]) => boolean,
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr h)') as (h: Hwnd) => boolean
    };
    user32 = {
      FindWindowW: lib.func('intptr __stdcall FindWindowW(str16 cls, str16 title)') as User32['FindWindowW'],
      FindWindowExW: lib.func(
        'intptr __stdcall FindWindowExW(intptr parent, intptr after, str16 cls, str16 title)'
      ) as User32['FindWindowExW'],
      ShowWindow: lib.func('bool __stdcall ShowWindow(intptr hwnd, int cmd)') as User32['ShowWindow'],
      IsWindowVisible: lib.func('bool __stdcall IsWindowVisible(intptr hwnd)') as User32['IsWindowVisible'],
      SetWindowPos: lib.func(
        'bool __stdcall SetWindowPos(intptr hwnd, intptr after, int x, int y, int cx, int cy, uint32 flags)'
      ) as User32['SetWindowPos'],
      SetWindowLongPtrW: lib.func(
        'intptr __stdcall SetWindowLongPtrW(intptr hwnd, int index, intptr value)'
      ) as User32['SetWindowLongPtrW'],
      EnumWindows: lib.func(
        'bool __stdcall EnumWindows(MoEnumWindowsProc *cb, intptr lParam)'
      ) as User32['EnumWindows'],
      WindowFromPoint: lib.func('intptr __stdcall WindowFromPoint(MO_POINT pt)') as User32['WindowFromPoint'],
      GetAncestor: lib.func('intptr __stdcall GetAncestor(intptr hwnd, uint32 flags)') as User32['GetAncestor'],
      GetWindow: lib.func('intptr __stdcall GetWindow(intptr hwnd, uint32 cmd)') as User32['GetWindow'],
      GetClassNameW: lib.func('int __stdcall GetClassNameW(intptr hwnd, void *buf, int max)') as User32['GetClassNameW'],
      GetAsyncKeyState: lib.func('int16 __stdcall GetAsyncKeyState(int vk)') as User32['GetAsyncKeyState'],
      GetDoubleClickTime: lib.func('uint32 __stdcall GetDoubleClickTime()') as User32['GetDoubleClickTime'],
      SetWindowsHookExW: lib.func(
        'intptr __stdcall SetWindowsHookExW(int id, MoLowLevelMouseProc *cb, intptr mod, uint32 thread)'
      ) as User32['SetWindowsHookExW'],
      CallNextHookEx: lib.func(
        'intptr __stdcall CallNextHookEx(intptr hook, int code, uintptr w, MO_MSLLHOOKSTRUCT *l)'
      ) as User32['CallNextHookEx'],
      UnhookWindowsHookEx: lib.func('bool __stdcall UnhookWindowsHookEx(intptr hook)') as User32['UnhookWindowsHookEx']
    };
    koffiRef = koffi;
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
    user32 = null;
  }
}

export async function ensureWin32(): Promise<boolean> {
  if (!initPromise) initPromise = init();
  await initPromise;
  return user32 !== null;
}

export function win32Error(): string | null {
  return initError;
}

/** HWND d'une BrowserWindow (Buffer de getNativeWindowHandle). */
export function hwndOf(handle: Buffer): Hwnd {
  return handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
}

function big(v: unknown): Hwnd {
  return typeof v === 'bigint' ? v : BigInt(Number(v) || 0);
}

/** Poignée de Progman : change quand l'Explorateur redémarre (0 si absent). */
export function desktopHandle(): bigint {
  return progman();
}

/** Fenêtre Progman (le bureau). */
function progman(): Hwnd {
  if (!user32) return 0n;
  return big(user32.FindWindowW('Progman', null));
}

/**
 * Trouve SHELLDLL_DefView : sous Progman, ou sous un WorkerW quand le fond
 * d'écran est un diaporama (cas classique avant Windows 11 24H2).
 */
function defView(): Hwnd {
  if (!user32) return 0n;
  const pm = progman();
  let found = pm ? big(user32.FindWindowExW(pm, 0n, 'SHELLDLL_DefView', null)) : 0n;
  if (found || !koffiRef) return found;
  const u = user32;
  const cb = koffiRef.register((hwnd: unknown) => {
    const v = big(u.FindWindowExW(big(hwnd), 0n, 'SHELLDLL_DefView', null));
    if (v) {
      found = v;
      return false;
    }
    return true;
  }, koffiRef.pointer(enumProto));
  try {
    u.EnumWindows(cb, 0);
  } finally {
    koffiRef.unregister(cb);
  }
  return found;
}

function iconList(): Hwnd {
  if (!user32) return 0n;
  const dv = defView();
  return dv ? big(user32.FindWindowExW(dv, 0n, 'SysListView32', null)) : 0n;
}

/**
 * Fenêtre de premier niveau qui porte le bureau (icônes + fond) : Progman, ou
 * le WorkerW qui contient SHELLDLL_DefView selon la version de Windows.
 */
function desktopRoot(): Hwnd {
  if (!user32) return 0n;
  const dv = defView();
  const root = dv ? big(user32.GetAncestor(dv, GA_ROOT)) : 0n;
  return root || progman();
}

/**
 * Pose la fenêtre sur le bureau : juste au-dessus de la fenêtre du bureau,
 * sous toutes les autres. Pas de lien de propriété avec Progman (une fenêtre
 * possédée par l'Explorateur partage sa file d'entrée, ce qui casse le
 * glisser-déposer) : seulement l'ordre d'empilement.
 */
export function pinToDesktop(hwnd: Hwnd): boolean {
  if (!user32) return false;
  user32.SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, 0n);
  return sendToBottom(hwnd);
}

/** Détache la fenêtre du bureau (aperçu au-dessus des autres fenêtres). */
export function unpinFromDesktop(hwnd: Hwnd): boolean {
  if (!user32) return false;
  user32.SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, 0n);
  return true;
}

/** Renvoie la fenêtre juste au-dessus du bureau (sous toutes les autres). */
export function sendToBottom(hwnd: Hwnd): boolean {
  if (!user32) return false;
  const root = desktopRoot();
  if (!root) return false;
  const above = big(user32.GetWindow(root, GW_HWNDPREV));
  if (above === hwnd) return true; // déjà en place
  // SetWindowPos range la fenêtre SOUS « after » : sous la fenêtre qui
  // surmonte le bureau, donc entre elle et le bureau.
  return user32.SetWindowPos(
    hwnd,
    above || HWND_TOP,
    0,
    0,
    0,
    0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER
  );
}

/**
 * Le bureau est-il passé devant cette fenêtre (Win+D) ? On remonte l'ordre
 * d'empilement depuis la fenêtre : si l'on croise le bureau, il la recouvre.
 */
export function desktopAbove(hwnd: Hwnd): boolean {
  if (!user32) return false;
  const root = desktopRoot();
  if (!root) return false;
  let h = big(user32.GetWindow(hwnd, GW_HWNDPREV));
  for (let i = 0; h && i < 2000; i++) {
    if (h === root) return true;
    h = big(user32.GetWindow(h, GW_HWNDPREV));
  }
  return false;
}

/**
 * Qui est au premier plan ? « desktop » quand on vient d'afficher le bureau
 * (Win+D, clic sur le bureau), « self » pour une fenêtre de MultiOutils.
 */
export function foregroundKind(): 'desktop' | 'self' | 'other' {
  if (!user32 || !procApi) return 'other';
  const h = big(procApi.GetForegroundWindow());
  if (!h) return 'other';
  const cls = classOf(big(user32.GetAncestor(h, GA_ROOT)));
  if (cls === 'Progman' || cls === 'WorkerW') return 'desktop';
  const pid = [0];
  procApi.GetWindowThreadProcessId(h, pid);
  return pid[0] === process.pid ? 'self' : 'other';
}

/** Masque (false) ou réaffiche (true) les icônes natives du bureau. */
export function setNativeIconsVisible(visible: boolean): boolean {
  if (!user32) return false;
  const lv = iconList();
  if (!lv) return false;
  if (Boolean(user32.IsWindowVisible(lv)) === visible) return true;
  user32.ShowWindow(lv, visible ? SW_SHOW : SW_HIDE);
  return true;
}

/* -------------------------------------------- clics sur le bureau vide */
const WH_MOUSE_LL = 14;
const WM_LBUTTONDOWN = 0x0201;
const GA_ROOT = 2;
let hook: Hwnd = 0n;
let hookCb: unknown = null;

function classOf(hwnd: Hwnd): string {
  if (!user32 || !hwnd) return '';
  const buf = Buffer.alloc(512);
  const n = user32.GetClassNameW(hwnd, buf, 256);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}

/**
 * Le point est-il sur le bureau vide ? Vrai pour le fond (Progman / WorkerW)
 * et pour la liste d'icônes quand elle est masquée par le module.
 */
export function isDesktopAt(x: number, y: number): boolean {
  if (!user32) return false;
  const w = big(user32.WindowFromPoint({ x, y }));
  if (!w) return false;
  const cls = classOf(w);
  const root = classOf(big(user32.GetAncestor(w, GA_ROOT)));
  if (cls === 'SysListView32') return false; // icônes Windows visibles : impossible de savoir si on clique une icône
  return root === 'Progman' || root === 'WorkerW';
}

/**
 * Surveille les clics gauches sur le bureau vide (crochet souris bas niveau).
 * `onClick` reçoit chaque clic, `onDouble` les doubles-clics. Le travail est
 * reporté (setImmediate) pour rendre la main à Windows immédiatement.
 */
/** Programme (nom du .exe) de la fenêtre au premier plan, ou null. */
export function foregroundExe(): string | null {
  if (!procApi) return null;
  try {
    const h = big(procApi.GetForegroundWindow());
    if (!h) return null;
    const pid = [0];
    procApi.GetWindowThreadProcessId(h, pid);
    if (!pid[0]) return null;
    const proc = big(procApi.OpenProcess(0x1000 /* QUERY_LIMITED_INFORMATION */, false, pid[0]));
    if (!proc) return null;
    try {
      const buf = Buffer.alloc(1040);
      const size = [520];
      if (!procApi.QueryFullProcessImageNameW(proc, 0, buf, size)) return null;
      const full = buf.toString('utf16le', 0, size[0] * 2);
      return full.split(/[\\/]/).pop() ?? null;
    } finally {
      procApi.CloseHandle(proc);
    }
  } catch {
    return null;
  }
}

const WM_MOUSEWHEEL = 0x020a;

export function watchDesktopClicks(onClick: () => void, onDouble: () => void, onWheel?: (delta: number) => void): () => void {
  if (!user32 || !koffiRef || !getModuleHandle || hook) return () => undefined;
  const u = user32;
  const dbl = Number(u.GetDoubleClickTime()) || 500;
  let last = { t: 0, x: 0, y: 0 };
  hookCb = koffiRef.register(
    ((code: number, wParam: unknown, pointer: unknown) => {
      try {
        // Koffi passes a native pointer to callback struct arguments.
        const info = pointer && koffiRef
          ? koffiRef.decode(pointer, 'MO_MSLLHOOKSTRUCT') as { pt: { x: number; y: number }; mouseData: number }
          : null;
        if (code >= 0 && onWheel && Number(wParam) === WM_MOUSEWHEEL && info && isDesktopAt(info.pt.x, info.pt.y)) {
          const raw = (Number((info as { mouseData?: number }).mouseData) >>> 16) & 0xffff;
          const delta = raw > 0x7fff ? raw - 0x10000 : raw;
          setImmediate(() => onWheel(delta));
        }
        if (code >= 0 && Number(wParam) === WM_LBUTTONDOWN && info) {
          const { x, y } = info.pt;
          const now = Date.now();
          if (isDesktopAt(x, y)) {
            const isDouble = now - last.t <= dbl && Math.abs(x - last.x) <= 4 && Math.abs(y - last.y) <= 4;
            last = isDouble ? { t: 0, x: 0, y: 0 } : { t: now, x, y };
            setImmediate(isDouble ? onDouble : onClick);
          } else {
            last = { t: 0, x: 0, y: 0 };
          }
        }
      } catch {
        // ne jamais bloquer la souris
      }
      return u.CallNextHookEx(0n, code, BigInt(Number(wParam) || 0), info);
    }) as (...a: unknown[]) => unknown,
    koffiRef.pointer(mouseProto)
  );
  hook = big(u.SetWindowsHookExW(WH_MOUSE_LL, hookCb, big(getModuleHandle(null)), 0));
  if (!hook) {
    koffiRef.unregister(hookCb);
    hookCb = null;
    return () => undefined;
  }
  return () => {
    if (hook) u.UnhookWindowsHookEx(hook);
    hook = 0n;
    if (hookCb && koffiRef) koffiRef.unregister(hookCb);
    hookCb = null;
  };
}

/** Touche enfoncée ? (pour l'aperçu en mode « maintenir »). */
export function isKeyDown(vk: number): boolean {
  if (!user32) return false;
  return (Number(user32.GetAsyncKeyState(vk)) & 0x8000) !== 0;
}

/** Code de touche virtuelle de la dernière touche d'un raccourci Electron. */
export function vkOfAccelerator(accel: string): number | null {
  const key = accel.split('+').pop()?.trim() ?? '';
  if (/^[A-Z]$/i.test(key)) return key.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  const f = /^F([1-9]|1[0-9]|2[0-4])$/i.exec(key);
  if (f) return 0x6f + Number(f[1]);
  const named: Record<string, number> = { Space: 0x20, Tab: 0x09, Enter: 0x0d, Return: 0x0d, Escape: 0x1b, Backspace: 0x08 };
  return named[key] ?? null;
}
