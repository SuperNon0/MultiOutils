import { execFile } from 'node:child_process';

/** Batch Windows Shell requests into one hidden helper instead of a process per item. */
type Request = { path: string; index: number | null; size: number };
let pending: { request: Request; resolve(value: string | null): void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

// Actual paths are supplied as base64 JSON, never interpolated into PowerShell code.
const helper = String.raw`
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
public class MoShellIcon {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Info {
    public IntPtr icon; public int index; public uint attributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string display;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string type;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  static extern IntPtr SHGetFileInfo(string p, uint attributes, out Info info, uint size, uint flags);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  static extern uint ExtractIconEx(string p, int index, out IntPtr large, out IntPtr small, uint count);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
  public static string Read(string p, int index, bool explicitIcon, int size) {
    IntPtr large = IntPtr.Zero, small = IntPtr.Zero, icon = IntPtr.Zero;
    try {
      if (explicitIcon) {
        ExtractIconEx(p, index, out large, out small, 1);
        icon = size <= 16 ? small : large;
      } else {
        Info info;
        // No SHGFI_USEFILEATTRIBUTES: directories and .lnk need their real Shell icon.
        SHGetFileInfo(p, 0, out info, (uint)Marshal.SizeOf(typeof(Info)), 0x100u | (size <= 16 ? 1u : 0u));
        icon = info.icon;
      }
      if (icon == IntPtr.Zero) return null;
      using (Icon source = Icon.FromHandle(icon))
      using (Bitmap bitmap = source.ToBitmap())
      using (MemoryStream stream = new MemoryStream()) {
        bitmap.Save(stream, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
      }
    } catch { return null; }
    finally {
      if (large != IntPtr.Zero) DestroyIcon(large);
      if (small != IntPtr.Zero && small != large) DestroyIcon(small);
      if (!explicitIcon && icon != IntPtr.Zero) DestroyIcon(icon);
    }
  }
}
'@
$requests = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())))
$result = @($requests | ForEach-Object { [MoShellIcon]::Read($_.path, [int]$_.index, ($null -ne $_.index), $_.size) })
ConvertTo-Json -InputObject $result -Compress
`;

export function shellIcon(request: Request): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    pending.push({ request, resolve });
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const batch = pending.splice(0);
      const payload = Buffer.from(JSON.stringify(batch.map((item) => item.request))).toString('base64');
      const script = Buffer.from(helper, 'utf16le').toString('base64');
      const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', script],
        { windowsHide: true, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
          let result: unknown = null;
          try { if (!error) result = JSON.parse(stdout.trim()); } catch { /* fallback to Electron */ }
          batch.forEach((item, i) => item.resolve(Array.isArray(result) && typeof result[i] === 'string' ? result[i] : null));
        });
      child.stdin?.end(payload);
      child.stdin?.on('error', () => undefined);
    }, 25);
  });
}
