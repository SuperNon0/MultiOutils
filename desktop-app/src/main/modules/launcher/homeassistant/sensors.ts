/**
 * Capteurs du PC envoyés à Home Assistant : peu nombreux et utiles (retour
 * de Noë sur HASS.Agent : « beaucoup trop d'informations inutiles »).
 */
import { app, powerMonitor } from 'electron';
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import { cpuPercent, type HaSensorValues } from '../core/ha-link';

/** Inactif au-delà de 5 min = PC « non utilisé ». */
const IDLE_THRESHOLD_S = 300;

export class PcSensors {
  private prevCpu = os.cpus();
  private locked = false;
  /** Calculé une fois : sinon la seconde varierait à chaque relevé. */
  private readonly bootIso = new Date(Math.floor((Date.now() - os.uptime() * 1000) / 60_000) * 60_000).toISOString();

  constructor() {
    powerMonitor.on('lock-screen', () => (this.locked = true));
    powerMonitor.on('unlock-screen', () => (this.locked = false));
  }

  private async diskPercent(): Promise<number | null> {
    try {
      const root = process.platform === 'win32' ? `${process.env.SystemDrive ?? 'C:'}\\` : '/';
      const st = await statfs(root);
      if (!st.blocks) return null;
      return Math.round((1 - st.bavail / st.blocks) * 1000) / 10;
    } catch {
      return null;
    }
  }

  async read(): Promise<HaSensorValues> {
    const cur = os.cpus();
    const cpu = cpuPercent(this.prevCpu, cur);
    this.prevCpu = cur;
    const mem = Math.round((1 - os.freemem() / os.totalmem()) * 1000) / 10;
    const idle = powerMonitor.getSystemIdleTime();
    const idleState = powerMonitor.getSystemIdleState(IDLE_THRESHOLD_S);
    const locked = this.locked || idleState === 'locked';
    const userState = locked ? 'verrouillée' : idleState === 'idle' ? 'inactive' : 'active';
    return {
      cpu_usage: cpu,
      memory_usage: mem,
      disk_usage: await this.diskPercent(),
      // arrondi à 10 s : évite d'envoyer une mise à jour à chaque relevé
      idle_time: Math.floor(idle / 10) * 10,
      user_state: userState,
      active: !locked && idle < IDLE_THRESHOLD_S,
      locked,
      on_battery: powerMonitor.isOnBatteryPower(),
      last_boot: this.bootIso,
      app_version: app.getVersion()
    };
  }
}
