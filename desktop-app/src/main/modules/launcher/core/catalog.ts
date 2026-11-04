/**
 * Catalogues statiques : pages des Paramètres Windows (ms-settings:) et du
 * Panneau de configuration, commandes système. Libellés FR + EN : la
 * recherche porte sur les deux, quelle que soit la langue de l'app.
 * (Liste rédigée pour MultiOutils, d'après les plugins WindowsSettings et Sys
 * de Flow Launcher — licence MIT.)
 */

export interface WinSetting {
  fr: string;
  en: string;
  /** Rubrique affichée en sous-titre. */
  area: { fr: string; en: string };
  /** ms-settings:… ou commande du Panneau de configuration (control …). */
  target: string;
  kind: 'settings' | 'control';
  /** Mots supplémentaires pour la recherche. */
  keywords?: string;
}

const A = {
  system: { fr: 'Système', en: 'System' },
  devices: { fr: 'Bluetooth et appareils', en: 'Bluetooth & devices' },
  network: { fr: 'Réseau et Internet', en: 'Network & internet' },
  perso: { fr: 'Personnalisation', en: 'Personalization' },
  apps: { fr: 'Applications', en: 'Apps' },
  accounts: { fr: 'Comptes', en: 'Accounts' },
  time: { fr: 'Heure et langue', en: 'Time & language' },
  gaming: { fr: 'Jeux', en: 'Gaming' },
  access: { fr: 'Accessibilité', en: 'Accessibility' },
  privacy: { fr: 'Confidentialité et sécurité', en: 'Privacy & security' },
  update: { fr: 'Windows Update', en: 'Windows Update' },
  control: { fr: 'Panneau de configuration', en: 'Control Panel' }
};

export const WINDOWS_SETTINGS: WinSetting[] = [
  // Système
  { fr: 'Écran', en: 'Display', area: A.system, target: 'ms-settings:display', kind: 'settings', keywords: 'résolution resolution luminosité brightness échelle scale moniteur monitor' },
  { fr: 'Éclairage nocturne', en: 'Night light', area: A.system, target: 'ms-settings:nightlight', kind: 'settings', keywords: 'lumière bleue blue light' },
  { fr: 'Son', en: 'Sound', area: A.system, target: 'ms-settings:sound', kind: 'settings', keywords: 'audio volume haut-parleur speaker micro microphone' },
  { fr: 'Mélangeur de volume', en: 'Volume mixer', area: A.system, target: 'ms-settings:apps-volume', kind: 'settings', keywords: 'son sound audio' },
  { fr: 'Notifications', en: 'Notifications', area: A.system, target: 'ms-settings:notifications', kind: 'settings', keywords: 'alertes alerts' },
  { fr: 'Assistant de concentration', en: 'Focus assist', area: A.system, target: 'ms-settings:quiethours', kind: 'settings', keywords: 'ne pas déranger do not disturb focus' },
  { fr: "Alimentation et batterie", en: 'Power & battery', area: A.system, target: 'ms-settings:powersleep', kind: 'settings', keywords: 'veille sleep énergie energy batterie battery' },
  { fr: 'Économiseur de batterie', en: 'Battery saver', area: A.system, target: 'ms-settings:batterysaver', kind: 'settings' },
  { fr: 'Stockage', en: 'Storage', area: A.system, target: 'ms-settings:storagesense', kind: 'settings', keywords: 'disque disk espace space assistant stockage sense' },
  { fr: 'Multitâche', en: 'Multitasking', area: A.system, target: 'ms-settings:multitasking', kind: 'settings', keywords: 'ancrage snap fenêtres windows bureaux virtuels virtual desktops' },
  { fr: 'Presse-papiers', en: 'Clipboard', area: A.system, target: 'ms-settings:clipboard', kind: 'settings', keywords: 'historique history copier copy' },
  { fr: 'Bureau à distance', en: 'Remote Desktop', area: A.system, target: 'ms-settings:remotedesktop', kind: 'settings', keywords: 'rdp' },
  { fr: 'Projection sur ce PC', en: 'Projecting to this PC', area: A.system, target: 'ms-settings:project', kind: 'settings' },
  { fr: 'Informations système', en: 'About', area: A.system, target: 'ms-settings:about', kind: 'settings', keywords: 'à propos nom du pc pc name version spécifications specifications' },
  { fr: 'Activation', en: 'Activation', area: A.system, target: 'ms-settings:activation', kind: 'settings', keywords: 'licence license clé key' },
  { fr: 'Résolution des problèmes', en: 'Troubleshoot', area: A.system, target: 'ms-settings:troubleshoot', kind: 'settings', keywords: 'dépannage dépanner problème problem' },
  { fr: 'Récupération', en: 'Recovery', area: A.system, target: 'ms-settings:recovery', kind: 'settings', keywords: 'réinitialiser reset restaurer' },
  // Appareils
  { fr: 'Bluetooth', en: 'Bluetooth', area: A.devices, target: 'ms-settings:bluetooth', kind: 'settings', keywords: 'appareils devices casque headset' },
  { fr: 'Imprimantes et scanners', en: 'Printers & scanners', area: A.devices, target: 'ms-settings:printers', kind: 'settings', keywords: 'imprimer print' },
  { fr: 'Souris', en: 'Mouse', area: A.devices, target: 'ms-settings:mousetouchpad', kind: 'settings', keywords: 'pointeur pointer vitesse speed défilement scroll' },
  { fr: 'Pavé tactile', en: 'Touchpad', area: A.devices, target: 'ms-settings:devices-touchpad', kind: 'settings', keywords: 'trackpad gestes gestures' },
  { fr: 'Saisie', en: 'Typing', area: A.devices, target: 'ms-settings:typing', kind: 'settings', keywords: 'clavier keyboard correction orthographe spelling' },
  { fr: 'Exécution automatique', en: 'AutoPlay', area: A.devices, target: 'ms-settings:autoplay', kind: 'settings', keywords: 'usb' },
  { fr: 'Stylet et Windows Ink', en: 'Pen & Windows Ink', area: A.devices, target: 'ms-settings:pen', kind: 'settings' },
  // Réseau
  { fr: 'Wi-Fi', en: 'Wi-Fi', area: A.network, target: 'ms-settings:network-wifi', kind: 'settings', keywords: 'wifi sans fil wireless réseau network' },
  { fr: 'Ethernet', en: 'Ethernet', area: A.network, target: 'ms-settings:network-ethernet', kind: 'settings', keywords: 'câble cable réseau network' },
  { fr: 'État du réseau', en: 'Network status', area: A.network, target: 'ms-settings:network-status', kind: 'settings', keywords: 'connexion connection internet' },
  { fr: 'VPN', en: 'VPN', area: A.network, target: 'ms-settings:network-vpn', kind: 'settings' },
  { fr: 'Mode avion', en: 'Airplane mode', area: A.network, target: 'ms-settings:network-airplanemode', kind: 'settings', keywords: 'avion airplane flight' },
  { fr: 'Point d’accès mobile', en: 'Mobile hotspot', area: A.network, target: 'ms-settings:network-mobilehotspot', kind: 'settings', keywords: 'partage connexion hotspot' },
  { fr: 'Proxy', en: 'Proxy', area: A.network, target: 'ms-settings:network-proxy', kind: 'settings' },
  // Personnalisation
  { fr: 'Arrière-plan', en: 'Background', area: A.perso, target: 'ms-settings:personalization-background', kind: 'settings', keywords: "fond d'écran wallpaper" },
  { fr: 'Couleurs', en: 'Colors', area: A.perso, target: 'ms-settings:colors', kind: 'settings', keywords: 'mode sombre dark mode clair light accent thème' },
  { fr: 'Thèmes', en: 'Themes', area: A.perso, target: 'ms-settings:themes', kind: 'settings', keywords: 'icônes du bureau desktop icons curseur cursor' },
  { fr: 'Écran de verrouillage', en: 'Lock screen', area: A.perso, target: 'ms-settings:lockscreen', kind: 'settings' },
  { fr: 'Démarrer', en: 'Start', area: A.perso, target: 'ms-settings:personalization-start', kind: 'settings', keywords: 'menu démarrer start menu' },
  { fr: 'Barre des tâches', en: 'Taskbar', area: A.perso, target: 'ms-settings:taskbar', kind: 'settings', keywords: 'taskbar zone de notification tray' },
  { fr: 'Polices', en: 'Fonts', area: A.perso, target: 'ms-settings:fonts', kind: 'settings', keywords: 'font typographie' },
  // Applications
  { fr: 'Applications installées', en: 'Installed apps', area: A.apps, target: 'ms-settings:appsfeatures', kind: 'settings', keywords: 'désinstaller uninstall programmes programs ajout suppression' },
  { fr: 'Applications par défaut', en: 'Default apps', area: A.apps, target: 'ms-settings:defaultapps', kind: 'settings', keywords: 'navigateur par défaut default browser associations' },
  { fr: 'Applications de démarrage', en: 'Startup apps', area: A.apps, target: 'ms-settings:startupapps', kind: 'settings', keywords: 'démarrage startup lancement automatique' },
  { fr: 'Fonctionnalités facultatives', en: 'Optional features', area: A.apps, target: 'ms-settings:optionalfeatures', kind: 'settings' },
  { fr: 'Cartes hors connexion', en: 'Offline maps', area: A.apps, target: 'ms-settings:maps', kind: 'settings' },
  // Comptes
  { fr: 'Vos informations', en: 'Your info', area: A.accounts, target: 'ms-settings:yourinfo', kind: 'settings', keywords: 'compte account profil profile' },
  { fr: 'Options de connexion', en: 'Sign-in options', area: A.accounts, target: 'ms-settings:signinoptions', kind: 'settings', keywords: 'mot de passe password code pin windows hello empreinte' },
  { fr: 'Famille et autres utilisateurs', en: 'Family & other users', area: A.accounts, target: 'ms-settings:otherusers', kind: 'settings', keywords: 'utilisateur user ajouter add' },
  { fr: 'Adresse e-mail et comptes', en: 'Email & accounts', area: A.accounts, target: 'ms-settings:emailandaccounts', kind: 'settings', keywords: 'mail' },
  { fr: 'Sauvegarde Windows', en: 'Windows backup', area: A.accounts, target: 'ms-settings:backup', kind: 'settings', keywords: 'onedrive sauvegarder backup' },
  // Heure et langue
  { fr: 'Date et heure', en: 'Date & time', area: A.time, target: 'ms-settings:dateandtime', kind: 'settings', keywords: 'horloge clock fuseau horaire time zone' },
  { fr: 'Langue et région', en: 'Language & region', area: A.time, target: 'ms-settings:regionlanguage', kind: 'settings', keywords: 'langue language pays country clavier keyboard format' },
  { fr: 'Voix', en: 'Speech', area: A.time, target: 'ms-settings:speech', kind: 'settings', keywords: 'reconnaissance vocale speech recognition' },
  // Jeux
  { fr: 'Xbox Game Bar', en: 'Xbox Game Bar', area: A.gaming, target: 'ms-settings:gaming-gamebar', kind: 'settings' },
  { fr: 'Captures (jeux)', en: 'Captures (gaming)', area: A.gaming, target: 'ms-settings:gaming-gamedvr', kind: 'settings', keywords: 'enregistrement recording' },
  { fr: 'Mode Jeu', en: 'Game Mode', area: A.gaming, target: 'ms-settings:gaming-gamemode', kind: 'settings' },
  // Accessibilité
  { fr: 'Taille du texte', en: 'Text size', area: A.access, target: 'ms-settings:easeofaccess-display', kind: 'settings', keywords: 'agrandir police larger text' },
  { fr: 'Loupe', en: 'Magnifier', area: A.access, target: 'ms-settings:easeofaccess-magnifier', kind: 'settings', keywords: 'zoom' },
  { fr: 'Narrateur', en: 'Narrator', area: A.access, target: 'ms-settings:easeofaccess-narrator', kind: 'settings', keywords: 'lecteur écran screen reader' },
  { fr: 'Contraste élevé', en: 'Contrast themes', area: A.access, target: 'ms-settings:easeofaccess-highcontrast', kind: 'settings' },
  { fr: 'Clavier (accessibilité)', en: 'Keyboard (accessibility)', area: A.access, target: 'ms-settings:easeofaccess-keyboard', kind: 'settings', keywords: 'touches rémanentes sticky keys clavier visuel on-screen keyboard' },
  { fr: 'Pointeur de la souris', en: 'Mouse pointer', area: A.access, target: 'ms-settings:easeofaccess-mousepointer', kind: 'settings', keywords: 'curseur cursor taille size' },
  // Confidentialité
  { fr: 'Sécurité Windows', en: 'Windows Security', area: A.privacy, target: 'ms-settings:windowsdefender', kind: 'settings', keywords: 'antivirus defender pare-feu firewall' },
  { fr: 'Localisation', en: 'Location', area: A.privacy, target: 'ms-settings:privacy-location', kind: 'settings', keywords: 'gps position' },
  { fr: 'Caméra', en: 'Camera', area: A.privacy, target: 'ms-settings:privacy-webcam', kind: 'settings', keywords: 'webcam' },
  { fr: 'Microphone', en: 'Microphone', area: A.privacy, target: 'ms-settings:privacy-microphone', kind: 'settings', keywords: 'micro' },
  { fr: 'Pour les développeurs', en: 'For developers', area: A.privacy, target: 'ms-settings:developers', kind: 'settings', keywords: 'mode développeur developer mode' },
  // Windows Update
  { fr: 'Windows Update', en: 'Windows Update', area: A.update, target: 'ms-settings:windowsupdate', kind: 'settings', keywords: 'mise à jour mises à jour update updates' },
  { fr: 'Historique des mises à jour', en: 'Update history', area: A.update, target: 'ms-settings:windowsupdate-history', kind: 'settings' },
  { fr: 'Options avancées (mises à jour)', en: 'Advanced options (update)', area: A.update, target: 'ms-settings:windowsupdate-options', kind: 'settings' },
  // Panneau de configuration
  { fr: 'Panneau de configuration', en: 'Control Panel', area: A.control, target: 'control', kind: 'control' },
  { fr: 'Programmes et fonctionnalités', en: 'Programs and Features', area: A.control, target: 'control appwiz.cpl', kind: 'control', keywords: 'désinstaller uninstall' },
  { fr: 'Connexions réseau', en: 'Network Connections', area: A.control, target: 'control ncpa.cpl', kind: 'control', keywords: 'carte réseau adapter ip' },
  { fr: 'Options d’alimentation', en: 'Power Options', area: A.control, target: 'control powercfg.cpl', kind: 'control', keywords: 'mode de gestion plan' },
  { fr: 'Propriétés système', en: 'System Properties', area: A.control, target: 'control sysdm.cpl', kind: 'control', keywords: "variables d'environnement environment variables nom de l'ordinateur" },
  { fr: 'Son (classique)', en: 'Sound (classic)', area: A.control, target: 'control mmsys.cpl', kind: 'control', keywords: 'périphériques audio playback devices' },
  { fr: 'Souris (classique)', en: 'Mouse (classic)', area: A.control, target: 'control main.cpl', kind: 'control' },
  { fr: 'Options Internet', en: 'Internet Options', area: A.control, target: 'control inetcpl.cpl', kind: 'control' },
  { fr: 'Pare-feu Windows Defender', en: 'Windows Defender Firewall', area: A.control, target: 'control firewall.cpl', kind: 'control', keywords: 'firewall' },
  { fr: 'Gestionnaire de périphériques', en: 'Device Manager', area: A.control, target: 'control hdwwiz.cpl', kind: 'control', keywords: 'pilotes drivers matériel hardware' },
  { fr: 'Comptes d’utilisateurs', en: 'User Accounts', area: A.control, target: 'control nusrmgr.cpl', kind: 'control' },
  { fr: 'Région (classique)', en: 'Region (classic)', area: A.control, target: 'control intl.cpl', kind: 'control' },
  { fr: 'Date et heure (classique)', en: 'Date and Time (classic)', area: A.control, target: 'control timedate.cpl', kind: 'control' },
  { fr: 'Gestion de l’ordinateur', en: 'Computer Management', area: A.control, target: 'compmgmt.msc', kind: 'control', keywords: 'disques disks gestion des disques services' },
  { fr: 'Gestion des disques', en: 'Disk Management', area: A.control, target: 'diskmgmt.msc', kind: 'control', keywords: 'partition' },
  { fr: 'Services', en: 'Services', area: A.control, target: 'services.msc', kind: 'control' },
  { fr: 'Observateur d’événements', en: 'Event Viewer', area: A.control, target: 'eventvwr.msc', kind: 'control', keywords: 'journaux logs' },
  { fr: 'Éditeur du Registre', en: 'Registry Editor', area: A.control, target: 'regedit', kind: 'control', keywords: 'regedit registre registry' },
  { fr: 'Configuration du système', en: 'System Configuration', area: A.control, target: 'msconfig', kind: 'control', keywords: 'msconfig démarrage boot' },
  { fr: 'Informations système (msinfo32)', en: 'System Information', area: A.control, target: 'msinfo32', kind: 'control' }
];

// ── Commandes système (plugin Sys de Flow) ────────────────────────────────

export type SystemCommandId =
  | 'shutdown'
  | 'restart'
  | 'restartAdvanced'
  | 'logoff'
  | 'lock'
  | 'sleep'
  | 'hibernate'
  | 'emptyBin'
  | 'openBin'
  | 'settings'
  | 'controlPanel'
  | 'taskManager'
  | 'explorer'
  | 'appQuit'
  | 'appOpen'
  | 'appSettings'
  | 'launcherSettings'
  | 'launcherReindex'
  | 'appData';

export interface SystemCommand {
  id: SystemCommandId;
  fr: string;
  en: string;
  subFr: string;
  subEn: string;
  icon: string;
  keywords: string;
  /** Demande confirmation (action destructive / irréversible). */
  confirm?: boolean;
  /** Windows uniquement. */
  winOnly?: boolean;
}

export const SYSTEM_COMMANDS: SystemCommand[] = [
  { id: 'shutdown', fr: 'Éteindre', en: 'Shut down', subFr: "Arrêter l'ordinateur", subEn: 'Shut down the computer', icon: 'zap', keywords: 'shutdown arrêter arret eteindre power off', confirm: true },
  { id: 'restart', fr: 'Redémarrer', en: 'Restart', subFr: "Redémarrer l'ordinateur", subEn: 'Restart the computer', icon: 'rotate', keywords: 'restart reboot redemarrer', confirm: true },
  { id: 'restartAdvanced', fr: 'Redémarrer (options avancées)', en: 'Restart with advanced boot options', subFr: 'Redémarrer vers le menu de récupération', subEn: 'Restart into the recovery menu', icon: 'rotate', keywords: 'advanced boot uefi bios recovery récupération', confirm: true, winOnly: true },
  { id: 'logoff', fr: 'Se déconnecter', en: 'Log off', subFr: 'Fermer la session', subEn: 'Sign out of the session', icon: 'logout', keywords: 'logoff sign out déconnexion deconnecter session', confirm: true },
  { id: 'lock', fr: 'Verrouiller', en: 'Lock', subFr: "Verrouiller l'ordinateur", subEn: 'Lock the computer', icon: 'lock', keywords: 'lock verrouiller ecran' },
  { id: 'sleep', fr: 'Mettre en veille', en: 'Sleep', subFr: "Mettre l'ordinateur en veille", subEn: 'Put the computer to sleep', icon: 'moon', keywords: 'sleep veille suspend' },
  { id: 'hibernate', fr: 'Mettre en veille prolongée', en: 'Hibernate', subFr: "Mettre l'ordinateur en veille prolongée", subEn: 'Hibernate the computer', icon: 'moon', keywords: 'hibernate hibernation veille prolongée', confirm: true, winOnly: true },
  { id: 'emptyBin', fr: 'Vider la corbeille', en: 'Empty Recycle Bin', subFr: 'Supprimer définitivement le contenu de la corbeille', subEn: 'Permanently delete the Recycle Bin contents', icon: 'trash', keywords: 'empty recycle bin trash corbeille vider', confirm: true },
  { id: 'openBin', fr: 'Ouvrir la corbeille', en: 'Open Recycle Bin', subFr: 'Afficher la corbeille', subEn: 'Show the Recycle Bin', icon: 'trash', keywords: 'recycle bin trash corbeille', winOnly: true },
  { id: 'settings', fr: 'Paramètres Windows', en: 'Windows Settings', subFr: "Ouvrir l'application Paramètres", subEn: 'Open the Settings app', icon: 'gear', keywords: 'settings paramètres reglages', winOnly: true },
  { id: 'controlPanel', fr: 'Panneau de configuration', en: 'Control Panel', subFr: 'Ouvrir le Panneau de configuration', subEn: 'Open Control Panel', icon: 'wrench', keywords: 'control panel configuration', winOnly: true },
  { id: 'taskManager', fr: 'Gestionnaire des tâches', en: 'Task Manager', subFr: 'Ouvrir le Gestionnaire des tâches', subEn: 'Open Task Manager', icon: 'chart', keywords: 'task manager taskmgr processus taches', winOnly: true },
  { id: 'explorer', fr: 'Explorateur de fichiers', en: 'File Explorer', subFr: "Ouvrir l'Explorateur", subEn: 'Open File Explorer', icon: 'folderopen', keywords: 'explorer explorateur fichiers files', winOnly: true },
  { id: 'appOpen', fr: 'Ouvrir MultiOutils', en: 'Open MultiOutils', subFr: "Afficher la fenêtre principale", subEn: 'Show the main window', icon: 'home', keywords: 'multioutils app application fenêtre' },
  { id: 'appSettings', fr: 'Réglages de MultiOutils', en: 'MultiOutils settings', subFr: "Ouvrir les réglages de l'application", subEn: 'Application settings', icon: 'gear', keywords: 'multioutils settings paramètres reglages options' },
  { id: 'launcherSettings', fr: 'Réglages du lanceur', en: 'Launcher settings', subFr: 'Raccourci, fournisseurs, moteurs web…', subEn: 'Shortcut, providers, web engines…', icon: 'search', keywords: 'launcher lanceur settings réglages flow' },
  { id: 'launcherReindex', fr: 'Réindexer le lanceur', en: 'Reindex the launcher', subFr: 'Relire programmes et favoris', subEn: 'Reload programs and bookmarks', icon: 'refresh', keywords: 'reindex reload index rafraichir actualiser recharger' },
  { id: 'appData', fr: 'Dossier des données de MultiOutils', en: 'MultiOutils data folder', subFr: 'Ouvrir le dossier des réglages et de la base', subEn: 'Open the settings and database folder', icon: 'folder', keywords: 'userdata data données appdata dossier folder' },
  { id: 'appQuit', fr: 'Quitter MultiOutils', en: 'Quit MultiOutils', subFr: "Fermer complètement l'application", subEn: 'Exit the application', icon: 'x', keywords: 'quit exit quitter fermer close multioutils', confirm: true }
];

// ── Outils MultiOutils (commandes locales des autres modules) ─────────────

export interface ToolEntry {
  /** Commande locale (ctx.registerLocalCommand) ou navigation. */
  command?: string;
  openTool?: string;
  fr: string;
  en: string;
  subFr: string;
  subEn: string;
  icon: string;
  keywords: string;
  /** Laisse disparaître le lanceur avant (capture d'écran). */
  delayMs?: number;
}

export const TOOL_ENTRIES: ToolEntry[] = [
  { command: 'capture.region', fr: 'Capturer une zone', en: 'Capture a region', subFr: "Capture d'écran", subEn: 'Screenshot', icon: 'region', keywords: 'screenshot capture zone region rectangle', delayMs: 220 },
  { command: 'capture.fullscreen', fr: "Capturer l'écran entier", en: 'Capture full screen', subFr: "Capture d'écran", subEn: 'Screenshot', icon: 'fullscreen', keywords: 'screenshot capture plein écran fullscreen', delayMs: 220 },
  { command: 'capture.window', fr: 'Capturer une fenêtre', en: 'Capture a window', subFr: "Capture d'écran", subEn: 'Screenshot', icon: 'window', keywords: 'screenshot capture fenêtre window', delayMs: 220 },
  { command: 'capture.delayed', fr: 'Capture différée', en: 'Delayed capture', subFr: "Capture d'écran", subEn: 'Screenshot', icon: 'hourglass', keywords: 'screenshot capture différée delayed timer minuteur' },
  { command: 'library.open', fr: 'Bibliothèque des captures', en: 'Capture library', subFr: 'MultiOutils', subEn: 'MultiOutils', icon: 'image', keywords: 'library bibliothèque galerie gallery captures' },
  { command: 'clipboard.last', fr: 'Dernière capture → presse-papiers', en: 'Last capture → clipboard', subFr: "Capture d'écran", subEn: 'Screenshot', icon: 'copy', keywords: 'copier copy last dernière capture' },
  { command: 'colorpicker.start', fr: 'Pipette de couleur', en: 'Color picker', subFr: 'Prendre une couleur à l’écran', subEn: 'Pick a color on screen', icon: 'eyedropper', keywords: 'color picker pipette couleur colour eyedropper hex', delayMs: 220 },
  { openTool: 'ocr', fr: 'OCR — extraire le texte', en: 'OCR — extract text', subFr: 'Texte d’une capture', subEn: 'Text from a capture', icon: 'textscan', keywords: 'ocr texte text reconnaissance extraction' },
  { command: 'clips.open', fr: 'Presse-papiers', en: 'Clipboard', subFr: 'Historique des copies', subEn: 'Copy history', icon: 'clipboard', keywords: 'clipboard presse papiers clips historique history' },
  { command: 'clips.copyLast', fr: 'Recopier le dernier clip', en: 'Copy last clip', subFr: 'Presse-papiers', subEn: 'Clipboard', icon: 'copy', keywords: 'clip dernier last copier copy' },
  { command: 'autoclick.toggle', fr: 'Autoclic marche / arrêt', en: 'Toggle autoclicker', subFr: 'Profil sélectionné', subEn: 'Selected profile', icon: 'mouse', keywords: 'autoclick autoclic clic click auto' },
  { openTool: 'autoclicker', fr: 'Autoclic — profils', en: 'Autoclicker — profiles', subFr: 'MultiOutils', subEn: 'MultiOutils', icon: 'mouse', keywords: 'autoclick autoclic profils profiles' }
];
