import { app } from 'electron';
import http from 'node:http';

export const LOCAL_SERVICE_PORT = 41320;

type LocalCommand = () => void | Promise<void>;

/** Gestionnaire de route brut : renvoie une valeur JSON (ou undefined → 204). */
type RouteHandler = (url: URL) => unknown | Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
}

/**
 * Service localhost pour le plugin Stream Deck (docs/00 §8) : le plugin parle
 * UNIQUEMENT à l'app locale, jamais au serveur distant. Lié à 127.0.0.1 —
 * inaccessible depuis le réseau. Les modules enregistrent leurs commandes ;
 * l'hôte ne connaît aucune commande en dur.
 */
export class LocalService {
  private commands = new Map<string, LocalCommand>();
  private routes: Route[] = [];
  private server: http.Server | null = null;

  register(id: string, run: LocalCommand): void {
    this.commands.set(id, run);
  }

  /**
   * Route HTTP enrichie (GET/POST) pour les besoins du plugin Stream Deck au-delà
   * des simples commandes : par ex. lister les profils d'autoclic (le panneau de
   * configuration du plugin, exécuté dans un navigateur, l'interroge → CORS ouvert).
   */
  registerRoute(method: string, pattern: RegExp, handler: RouteHandler): void {
    this.routes.push({ method, pattern, handler });
  }

  start(port = LOCAL_SERVICE_PORT): void {
    this.server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      // Le panneau de configuration du plugin (webview) interroge ce service
      // depuis une autre origine : CORS ouvert (service lié à 127.0.0.1 seulement).
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      // Routes enrichies (avant les commandes génériques).
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const route = this.routes.find(
        (r) => r.method === req.method && r.pattern.test(url.pathname)
      );
      if (route) {
        Promise.resolve(route.handler(url)).then(
          (value) => {
            if (value === undefined) {
              res.statusCode = 204;
              res.end();
            } else {
              res.end(JSON.stringify(value));
            }
          },
          (err) => {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
            );
          }
        );
        return;
      }

      if (req.method === 'GET' && req.url === '/ping') {
        res.end(
          JSON.stringify({
            app: 'multioutils',
            version: app.getVersion(),
            commands: [...this.commands.keys()]
          })
        );
        return;
      }

      const match = req.method === 'POST' && req.url?.match(/^\/command\/([\w.-]+)$/);
      if (match) {
        const command = this.commands.get(match[1]);
        if (!command) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'commande inconnue' }));
          return;
        }
        Promise.resolve(command()).then(
          () => res.end(JSON.stringify({ ok: true })),
          (err) => {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err)
              })
            );
          }
        );
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'introuvable' }));
    });

    this.server.on('error', () => {
      // port occupé (autre instance ?) : le service est optionnel, on continue
      this.server = null;
    });
    this.server.listen(port, '127.0.0.1');
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}
