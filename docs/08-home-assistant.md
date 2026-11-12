# Home Assistant ↔ PC

MultiOutils relie le PC à Home Assistant **comme l'appli mobile** (intégration
« Application mobile », déjà présente dans HA). Pas de MQTT, pas d'intégration
HACS, pas de port à ouvrir : c'est le PC qui se connecte à HA (WebSocket) et
garde la connexion, avec reconnexion automatique après une veille, un
redémarrage de HA ou une coupure réseau.

Réglages → Lanceur → Home Assistant.

## Mise en route

1. Adresse de HA + jeton d'accès longue durée (déjà utilisés par le lanceur).
   Le jeton doit être celui d'un administrateur pour que les boutons soient créés.
2. Activer « Relier ce PC à Home Assistant ».
3. Le PC apparaît dans Paramètres → Appareils et services → Application mobile,
   sous le nom **PC** (modifiable).

## Ce que HA voit

| Élément | Exemple |
| --- | --- |
| Service de notification | `notify.mobile_app_pc` |
| Boutons (scripts) | `script.pc_veille`, `script.pc_verrouiller`, `script.pc_eteindre`, `script.pc_redemarrer` |
| Capteurs | processeur, mémoire, disque, PC utilisé, session verrouillée, inactif depuis, sur batterie, dernier démarrage, version |

Les scripts ne sont créés que s'ils n'existent pas : on peut les modifier dans HA
sans qu'ils soient écrasés. Éteindre et Redémarrer laissent 30 s pour annuler
depuis une pop-up.

## Envoyer une notification

```yaml
action: notify.mobile_app_pc
data:
  title: "Machine à laver"
  message: "Le linge est prêt 🧺"
  data:
    icon: mdi:washing-machine        # ou un emoji
    color: menthe                    # lavande, or, ambre, corail, menthe, #rrggbb
    image: /api/camera_proxy/camera.entree
    tag: lessive                     # même tag = remplace la précédente
    duration: 15                     # secondes ; 0 = reste à l'écran
    sticky: true                     # ou importance: high → reste à l'écran
    sound: sonnette                  # none = muet ; carillon, cloche, alerte, sonnette,
                                     # bulle, douce ; nom d'un fichier du dossier des sons
                                     # (Réglages → Home Assistant) ; ou /local/sons/x.mp3
    volume: 80                       # 0 à 100
    position: center                 # top-left, top-center, top-right, bottom-left,
                                     # bottom-center, bottom-right, center (ou haut, bas, centre…)
    size: large                      # small, normal, large (ou petite, grande)
    url: /lovelace/cameras           # clic sur la pop-up (page HA ou lien web)
    actions:
      - action: LESSIVE_VUE
        title: "OK, j'y vais"
      - action: URI
        title: "Voir la caméra"
        uri: /lovelace/cameras
```

Un bouton sans `uri` déclenche l'événement `mobile_app_notification_action`
(comme sur le téléphone) : il sert de déclencheur à une automatisation.

Effacer : `message: clear_notification` avec `data.tag`.

Le script `script.pc_notification` (« PC · Notification ») propose tous ces
champs dans l'éditeur de HA : pas besoin d'écrire le YAML à la main.

Sons personnalisés : un fichier (.mp3, .wav, .ogg, .m4a, .flac ; 4 Mo max)
déposé dans le dossier des sons du PC, ou servi par HA (`/local/…` = dossier
`www` de HA, lu avec le jeton). Si le son n'est pas trouvé, on joue le son par
défaut des réglages.

Commandes (messages spéciaux, utilisés par les boutons) : `command_sleep`,
`command_lock`, `command_shutdown`, `command_restart`, `command_dashboard`,
`command_launcher`, `command_open_url` (`data.url`).

## Mini tableau de bord

Raccourci global (par défaut Alt+Maj+H) : petite fenêtre en bas à droite avec la
page de HA choisie. Connexion automatique avec le jeton, sinon on se connecte une
fois et la session est gardée. Aussi dans le lanceur (`ha`), le menu du tray et
le Stream Deck (commande locale `homeassistant.dashboard`).

## Lanceur

`ha` seul : tableau de bord + 3 dernières notifications + entités.
`ha notif` : historique des notifications reçues.
