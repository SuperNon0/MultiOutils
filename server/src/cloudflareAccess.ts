/**
 * Vérification du badge Cloudflare Access — PORT Node/Express de la recette
 * testée du socle (`socle-lite/ports/RECETTE-cloudflare.md`).
 *
 * Même algorithme que l'implémentation FastAPI de référence :
 *   1. jeton = en-tête `Cf-Access-Jwt-Assertion`, sinon cookie `CF_Authorization` ;
 *   2. clés publiques de l'équipe (JWKS) mises en cache ;
 *   3. vérifier + décoder le JWT : RS256 + audience = AUD + issuer = équipe ;
 *   4. en tirer le claim `email` (minuscules).
 *
 * On NE fait JAMAIS confiance à l'en-tête `Cf-Access-Authenticated-User-Email`
 * seul (forgeable si l'origine est joignable hors Cloudflare) : on ne le lit
 * qu'en mode `verify=false` (dev local). Zéro dépendance : `node:crypto` +
 * `node:https` suffisent (RS256 = RSASSA-PKCS1-v1_5 + SHA-256).
 */
import type { Request } from 'express';
import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import https from 'node:https';

export interface CfConfig {
  team: string;
  aud: string;
  verify: boolean;
}

/** Normalise le nom d'équipe : enlève https://, les `/` et .cloudflareaccess.com. */
export function normalizeTeam(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace('https://', '')
    .replace('http://', '')
    .replace(/\/+$/, '')
    .replace(/^\/+/, '')
    .replace('.cloudflareaccess.com', '');
}

function issuerFor(team: string): string {
  return `https://${team}.cloudflareaccess.com`;
}

/** URL JWKS de l'équipe (surchargée par CF_CERTS_URL, utile hors ligne/tests). */
function certsUrl(team: string): string {
  return process.env.CF_CERTS_URL || `${issuerFor(team)}/cdn-cgi/access/certs`;
}

// ── Récupération du jeton dans la requête ────────────────────────────────

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function tokenFromRequest(req: Request): string | null {
  const header = req.headers['cf-access-jwt-assertion'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return (fromHeader && fromHeader.trim()) || cookieValue(req, 'CF_Authorization');
}

export function headerEmail(req: Request): string | null {
  const raw = req.headers['cf-access-authenticated-user-email'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? value.trim().toLowerCase() : null;
}

// ── Cache JWKS (par équipe) ──────────────────────────────────────────────

interface Jwk extends JsonWebKey {
  kid?: string;
}
interface JwksEntry {
  keys: Jwk[];
  fetchedAt: number;
}
const JWKS_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map<string, JwksEntry>();

function httpsGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 8000 }, (response) => {
      if (!response.statusCode || response.statusCode >= 400) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} sur ${url}`));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('délai dépassé (JWKS)')));
    request.on('error', reject);
  });
}

async function getJwks(team: string): Promise<Jwk[]> {
  const cached = jwksCache.get(team);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const data = httpsGetJson(certsUrl(team));
  const parsed = (await data) as { keys?: Jwk[] };
  const keys = Array.isArray(parsed.keys) ? parsed.keys : [];
  jwksCache.set(team, { keys, fetchedAt: Date.now() });
  return keys;
}

// ── Vérification du JWT (RS256 + aud + iss + exp) ─────────────────────────

function b64urlToBuffer(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}
function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(b64urlToBuffer(segment).toString('utf8')) as Record<string, unknown>;
}

export interface CfClaims {
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
}

/** Vérifie signature + claims. Lève une erreur explicite en cas d'échec. */
export function verifyCfToken(
  token: string,
  keys: Jwk[],
  opts: { aud: string; issuer: string }
): CfClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('jeton mal formé');
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeSegment(headerB64) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error(`algorithme ${header.alg ?? '?'} refusé (RS256 requis)`);

  const candidates = header.kid ? keys.filter((k) => k.kid === header.kid) : keys;
  if (candidates.length === 0) throw new Error('clé de signature (kid) introuvable dans le JWKS');

  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = b64urlToBuffer(signatureB64);
  const signatureOk = candidates.some((jwk) => {
    try {
      const key = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
      return cryptoVerify('RSA-SHA256', signingInput, key, signature);
    } catch {
      return false;
    }
  });
  if (!signatureOk) throw new Error('signature invalide');

  const claims = decodeSegment(payloadB64) as CfClaims;
  if (claims.iss !== opts.issuer) throw new Error(`issuer inattendu (${claims.iss ?? '?'})`);
  const auds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!auds.includes(opts.aud)) throw new Error("l'AUD du jeton ne correspond pas");
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && now >= claims.exp) throw new Error('jeton expiré');
  if (typeof claims.nbf === 'number' && now < claims.nbf - 60) throw new Error('jeton pas encore valide');
  return claims;
}

// ── API publique ─────────────────────────────────────────────────────────

/** E-mail Cloudflare vérifié pour la requête, sinon `null`. */
export async function cfAccessEmail(
  req: Request,
  cfg: CfConfig
): Promise<string | null> {
  if (!cfg.verify) {
    // Dev local uniquement : on se contente de l'en-tête (jamais en prod).
    return headerEmail(req);
  }
  const team = normalizeTeam(cfg.team);
  const aud = (cfg.aud || '').trim();
  if (!team || !aud) return null;
  const token = tokenFromRequest(req);
  if (!token) return null;
  try {
    const keys = await getJwks(team);
    const claims = verifyCfToken(token, keys, { aud, issuer: issuerFor(team) });
    const email = (claims.email || '').trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

export interface CfAttempt {
  tokenPresent: boolean;
  tokenSource: 'header' | 'cookie' | null;
  headerEmail: string | null;
  verify: boolean;
  ok: boolean;
  email: string | null;
  detail: string;
}

/** Diagnostic pour le bouton « Tester » : décrit ce qui s'est passé, sans rien enregistrer. */
export async function describeCfAttempt(req: Request, cfg: CfConfig): Promise<CfAttempt> {
  const hEmail = headerEmail(req);
  const headerToken = req.headers['cf-access-jwt-assertion'];
  const hasHeaderToken = Boolean(Array.isArray(headerToken) ? headerToken[0] : headerToken);
  const token = tokenFromRequest(req);
  const source: 'header' | 'cookie' | null = token
    ? hasHeaderToken
      ? 'header'
      : 'cookie'
    : null;

  if (!cfg.verify) {
    return {
      tokenPresent: Boolean(token),
      tokenSource: source,
      headerEmail: hEmail,
      verify: false,
      ok: Boolean(hEmail),
      email: hEmail,
      detail: hEmail
        ? 'Vérification DÉSACTIVÉE (dev) : on fait confiance à l’en-tête e-mail. À ne jamais laisser en production.'
        : 'Vérification désactivée mais aucun en-tête Cf-Access-Authenticated-User-Email reçu.'
    };
  }

  const team = normalizeTeam(cfg.team);
  const aud = (cfg.aud || '').trim();
  if (!team) return { tokenPresent: Boolean(token), tokenSource: source, headerEmail: hEmail, verify: true, ok: false, email: null, detail: 'Équipe Cloudflare manquante.' };
  if (!aud) return { tokenPresent: Boolean(token), tokenSource: source, headerEmail: hEmail, verify: true, ok: false, email: null, detail: 'AUD manquant.' };
  if (!token)
    return {
      tokenPresent: false,
      tokenSource: null,
      headerEmail: hEmail,
      verify: true,
      ok: false,
      email: null,
      detail: 'Aucun jeton reçu (ni en-tête Cf-Access-Jwt-Assertion, ni cookie CF_Authorization). Requête hors Cloudflare, ou l’application Access ne couvre pas ce chemin.'
    };
  try {
    const keys = await getJwks(team);
    const claims = verifyCfToken(token, keys, { aud, issuer: issuerFor(team) });
    const email = (claims.email || '').trim().toLowerCase() || null;
    return {
      tokenPresent: true,
      tokenSource: source,
      headerEmail: hEmail,
      verify: true,
      ok: true,
      email,
      detail: `JWT vérifié (RS256 + aud + iss). E-mail : ${email ?? '—'}.`
    };
  } catch (err) {
    return {
      tokenPresent: true,
      tokenSource: source,
      headerEmail: hEmail,
      verify: true,
      ok: false,
      email: null,
      detail: `JWT refusé : ${err instanceof Error ? err.message : String(err)}.`
    };
  }
}
