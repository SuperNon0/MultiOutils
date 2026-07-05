import { app } from 'electron';
import http from 'node:http';

export const LOCAL_SERVICE_PORT = 41320;

type LocalCommand = () => void | Promise<void>;

/**
 * Service localhost pour le plugin Stream Deck (docs/00 §8) : le plugin parle
 * UNIQUEMENT à l'app locale, jamais au serveur distant. Lié à 127.0.0.1 —
 * inaccessible depuis le réseau. Les modules enregistrent leurs commandes ;
 * l'hôte ne connaît aucune commande en dur.
 */
export class LocalService {
  private commands = new Map<string, LocalCommand>();
  private server: http.Server | null = null;

  register(id: string, run: LocalCommand): void {
    this.commands.set(id, run);
  }

  start(port = LOCAL_SERVICE_PORT): void {
    this.server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');

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
