/**
 * Cœur sécurité du SITE : config Cloudflare + mot de passe de secours local,
 * stockés dans le store du site (table `settings`), modifiables au runtime via
 * l'écran de réglages. La VÉRIFICATION du badge Cloudflare n'est PAS réécrite
 * ici : elle est déléguée à `cloudflareAccess.ts` (port de la recette du socle).
 */
import argon2 from 'argon2';
import type { NextFunction, Request, Response } from 'express';
import { cfAccessEmail, normalizeTeam, type CfConfig } from './cloudflareAccess';
import { getSetting, setSetting } from './db';
import { socleLayout } from './html';

declare module 'express-session' {
  interface SessionData {
    /** Session humaine ouverte (via Cloudflare OU mot de passe local). */
    auth?: boolean;
    /** E-mail Cloudflare vérifié, si l'entrée s'est faite par badge. */
    email?: string;
  }
}

// ── Config Cloudflare (dans le store, pas un .env figé) ───────────────────

export function getCfConfig(): CfConfig {
  return {
    team: getSetting('cf_team') ?? '',
    aud: getSetting('cf_aud') ?? '',
    verify: (getSetting('cf_verify') ?? '1') !== '0'
  };
}

export function setCfConfig(cfg: CfConfig): void {
  setSetting('cf_team', normalizeTeam(cfg.team));
  setSetting('cf_aud', (cfg.aud || '').trim());
  setSetting('cf_verify', cfg.verify ? '1' : '0');
}

// ── Mot de passe de secours local (HASHÉ argon2id, jamais en clair) ───────

export function isLocalPasswordSet(): boolean {
  return Boolean(getSetting('local_pw_hash'));
}

export async function setLocalPassword(password: string): Promise<void> {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  setSetting('local_pw_hash', hash);
}

export async function verifyLocalPassword(password: string): Promise<boolean> {
  const hash = getSetting('local_pw_hash');
  if (!hash) return false;
  return argon2.verify(hash, password).catch(() => false);
}

// ── Secours local activable (anti-verrouillage) ──────────────────────────

/**
 * Secours local activé ? Décoché → entrée UNIQUEMENT via Cloudflare (accès
 * direct sans badge = 403). Réglable depuis l'écran (store) ; à défaut, repli
 * sur la variable d'env `ALLOW_LOCAL_LOGIN` (1re install), défaut = activé.
 */
export function allowLocalLogin(): boolean {
  const stored = getSetting('allow_local_login');
  if (stored !== null) return stored !== '0';
  const v = (process.env.ALLOW_LOCAL_LOGIN ?? '').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(v);
}

export function setAllowLocalLogin(allow: boolean): void {
  setSetting('allow_local_login', allow ? '1' : '0');
}

// ── Amorçage depuis l'environnement (première install seulement) ──────────

function envTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

/** Au démarrage : si le store est vide, initialise depuis les variables d'env. */
export async function seedSecurityFromEnv(): Promise<void> {
  if (!getSetting('cf_team') && process.env.CF_ACCESS_TEAM_DOMAIN) {
    setSetting('cf_team', normalizeTeam(process.env.CF_ACCESS_TEAM_DOMAIN));
  }
  if (!getSetting('cf_aud') && process.env.CF_ACCESS_AUD) {
    setSetting('cf_aud', process.env.CF_ACCESS_AUD.trim());
  }
  if (getSetting('cf_verify') === null && process.env.CF_VERIFY_JWT !== undefined) {
    setSetting('cf_verify', envTruthy(process.env.CF_VERIFY_JWT) ? '1' : '0');
  }
  if (getSetting('allow_local_login') === null && process.env.ALLOW_LOCAL_LOGIN !== undefined) {
    const v = process.env.ALLOW_LOCAL_LOGIN.trim().toLowerCase();
    setSetting('allow_local_login', ['false', '0', 'no', 'off'].includes(v) ? '0' : '1');
  }
  if (!isLocalPasswordSet() && process.env.ADMIN_PASSWORD) {
    await setLocalPassword(process.env.ADMIN_PASSWORD);
  }
}

// ── Portail humain : Cloudflare d'abord, secours local ensuite ────────────

function forbidden(res: Response): void {
  res.status(403).send(
    socleLayout(
      'Accès refusé',
      `<div class="login-card">
        <div class="login-logo">
          <img class="logo-mark" src="/public/logo.svg" alt="" width="44" height="44">
          <span class="logo"><span class="g">multi</span><span class="i">outils</span></span>
        </div>
        <h2>Accès refusé</h2>
        <p class="access-text">L'entrée se fait uniquement via <b>Cloudflare</b>
        (le secours local est désactivé sur ce site). Aucun badge valide n'a été
        présenté pour cette requête.</p>
      </div>`,
      { bodyClass: 'login-page' }
    )
  );
}

/**
 * Middleware des pages HUMAINES (galerie, clips, réglages, admin).
 *  1. session déjà ouverte → passe ;
 *  2. badge Cloudflare vérifié → ouvre la session pour cet e-mail ;
 *  3. sinon : secours local autorisé → /login ; sinon 403 (même en POST).
 * N'est JAMAIS monté sur /api (routes machine protégées par jeton Bearer).
 */
export function gateway(req: Request, res: Response, next: NextFunction): void {
  if (req.session.auth) {
    next();
    return;
  }
  void cfAccessEmail(req, getCfConfig())
    .then((email) => {
      if (email) {
        req.session.auth = true;
        req.session.email = email;
        next();
        return;
      }
      if (allowLocalLogin()) {
        res.redirect('/login');
        return;
      }
      forbidden(res);
    })
    .catch(() => {
      // Une panne de vérif Cloudflare ne doit jamais verrouiller : on retombe
      // sur le secours local s'il est autorisé.
      if (allowLocalLogin()) res.redirect('/login');
      else forbidden(res);
    });
}

/** Garde les pages de secours local (/login, /setup, /oubli) : 403 si désactivé. */
export function requireLocalLoginEnabled(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (allowLocalLogin()) {
    next();
    return;
  }
  forbidden(res);
}
