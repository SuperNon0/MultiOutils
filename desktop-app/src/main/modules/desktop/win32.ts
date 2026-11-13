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
}

const SW_HIDE = 0;
const SW_SHOW = 5;
const HWND_BOTTOM = 1n;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;
const GWLP_HWNDPARENT = -8;

let user32: User32 | null = null;
let koffiRef: {
  register(fn: (...a: unknown[]) => unknown, type: unknown): unknown;
  unregister(cb: unknown): void;
  pointer(t: unknown): unknown;
  proto(sig: string): unknown;
} | null = null;
let enumProto: unknown = null;
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
      load(name: string): { func(sig: string): (...a: unknown[]) => unknown };
      register(fn: (...a: unknown[]) => unknown, type: unknown): unknown;
      unregister(cb: unknown): void;
      pointer(t: unknown): unknown;
      proto(sig: string): unknown;
    };
    const lib = koffi.load('user32.dll');
    enumProto = koffi.proto('bool __stdcall MoEnumWindowsProc(intptr hwnd, intptr lParam)');
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
      ) as User32['EnumWindows']
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

/** Rattache la fenêtre au bureau (propriétaire = Progman) puis l'envoie au fond. */
export function pinToDesktop(hwnd: Hwnd): boolean {
  if (!user32) return false;
  const pm = progman();
  if (!pm) return false;
  user32.SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, pm);
  return sendToBottom(hwnd);
}

export function sendToBottom(hwnd: Hwnd): boolean {
  if (!user32) return false;
  return user32.SetWindowPos(
    hwnd,
    HWND_BOTTOM,
    0,
    0,
    0,
    0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER
  );
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
