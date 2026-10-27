# 🐴 Auctav Realtime Socket.IO Server

Serveur de relais temps réel haute performance pour la plateforme de ventes aux enchères de chevaux en direct **Auctav**.

Ce serveur assure le pont bidirectionnel instantané entre la **régie/commissaire-priseur (Admin)**, les **enchérisseurs (bidders web et mobiles)**, les **écrans de projection en salle** et les **systèmes de suivi et d'historique (logs)**.

---

## 📋 Table des Matières
1. [Architecture & Rôle du Serveur](#1-architecture--rôle-du-serveur)
2. [Spécification Complète du Protocole](#2-spécification-complète-du-protocole)
3. [Compatibilité Socket.IO v4 ↔ Client 2.3.0 (allowEIO3)](#3-compatibilité-socketio-v4--client-230-alloweio3)
4. [Guide de Migration pour `update.php`](#4-guide-de-migration-pour-updatephp)
5. [Variables d'Environnement](#5-variables-denvironnement)
6. [Déploiement en Production](#6-déploiement-en-production)
   - [Option A : PM2 (Recommandé sur VM dédiée)](#option-a--pm2-recommandé)
   - [Option B : Docker & Docker Compose](#option-b--docker--docker-compose)
   - [Configuration Nginx Reverse Proxy SSL](#configuration-nginx-reverse-proxy-ssl)
7. [Banc de Test Automatisé](#7-banc-de-test-automatisé)
8. [Sécurité & Anti-Abus](#8-sécurité--anti-abus)

---

## 1. Architecture & Rôle du Serveur

Le serveur n'intègre **aucune logique métier propre aux enchères** :
- Le navigateur de la régie (Admin) détient l'autorité exclusive : validation ou rejet des enchères, chronomètres, attribution des adjudications et gestion de l'état des lots.
- Le serveur Socket.IO agit comme un **routeur sécurisé et certifié** :
  1. Gestion des rooms et identification de l'administrateur en titre.
  2. Relais unifié des événements via `sendMsg`.
  3. Maintien et diffusion en continu de la présence de l'admin via `userList`.
  4. Contrôle strict d'accès (RBAC) et limitation de débit (Rate Limiting).

### Format des Rooms
Les rooms autorisées répondent impérativement à l'expression régulière `^auctav(\d+|_follow|_screen)$` :
- `auctav{ID}` (ex. `auctav12`) : Room principale d'une vente (Admin, enchérisseurs, écrans salle).
- `auctav_follow` : Flux temps réel pour les écrans et pages de logs régie.
- `auctav_screen` : Écrans d'affichage vidéo grand format.

---

## 2. Spécification Complète du Protocole

### A. Événements Client ➔ Serveur

| Événement | Signature | Rôle & Comportement | Droits requis |
| :--- | :--- | :--- | :--- |
| `admin` | `(pseudo, key, ack)` | Authentifie l'Admin. Vérification en temps constant (`crypto.timingSafeEqual`). Si valide, `socket.data.isAdmin = true`, enregistrement dans `adminStore` et diffusion `userList`. Renvoie `ack({ ok: true })`. | Tous (clé requise) |
| `joinroom` | `(room)` | Rejoint la room. Si le socket est admin, il devient l'admin actif de la room. Déclenche immédiatement l'émission de `userList` à la room et au socket entrant. | Tous |
| `username` | `(pseudo)` | Assigne le nom public du socket (`socket.data.name`). Tronqué à 100 caractères. Ne peut pas écraser le nom d'un admin. | Enchérisseurs |
| `getMsgRoom` | `{ room, type, msg, name }` | Relais vers **tous** les membres de la room via `sendMsg`. Le champ `from` est écrasé avec le vrai `socket.id`. L'émetteur n'a pas besoin d'être dans la room. | Admin uniquement *(sauf exception `ALLOW_UNAUTH_UPDATELOT` pour `updateLot`)* |
| `getMsgPrivate` | `{ toid, type, msg, name }` | Relais privé vers le socket `toid` via `sendMsg`. Si `toid` est déconnecté, ignorer sans erreur. | Non-Admin ➔ Admin uniquement<br>Admin ➔ Tout socket |

---

### B. Événements Serveur ➔ Client

| Événement | Payload | Rôle |
| :--- | :--- | :--- |
| `sendMsg` | `{ type: string, msg: object, name: string, from: string }` | Format unique de transmission de tous les messages (salle ou privé). Le champ `from` identifie formellement le socket émetteur d'origine. |
| `userList` | `{ admin: string \| null, count: number }` | Indique l'identifiant du socket de l'admin actif pour la room et le nombre total d'inscrits. Si `admin` est `null`, les clients masquent l'interface d'enchère. |

---

### C. Catalogue des Types de Messages (`type` de `sendMsg`)

| Type | Flux Type | Émetteur | Destinataire | Description |
| :--- | :--- | :--- | :--- | :--- |
| `numLot` | `getMsgRoom` | Admin | Room (`auctav{ID}`, `auctav_screen`) | Annonce du numéro et descriptif du lot en cours |
| `listLot` | `getMsgRoom` / `Private` | Admin | Room ou Client | Liste complète des lots du catalogue de la vente |
| `updateLot` | `getMsgRoom` | Admin / `update.php` | Room | Modification des données d'un lot (pédigrée, réserve...) |
| `closeEnchere` | `getMsgRoom` | Admin | Room | Clôture de l'enchère (adjudication ou rachat) |
| `previousLot` | `getMsgRoom` | Admin | Room | Retour au lot précédent |
| `confirmEnchere` | `getMsgPrivate` | Admin | Enchérisseur | Accusé de réception de validation d'enchère |
| `validEnchere` | `getMsgPrivate` | Admin | Enchérisseur | Confirmation officielle de validation |
| `changeDevice` | `getMsgPrivate` | Admin | Ancien socket | Avertissement de connexion sur un second terminal |
| `noActivity` | `getMsgPrivate` | Admin | Enchérisseur | Avertissement d'inactivité avant déconnexion |
| `doEncheres` | `getMsgPrivate` | Enchérisseur | Admin | **Offre d'enchère émise par le client** (ex. `{ lot: 12, montant: 25000 }`) |
| `reconnection` | `getMsgPrivate` | Enchérisseur | Admin | Demande de resynchronisation après reconnexion |
| `getEncheresList` | `getMsgPrivate` | Client / Écran | Admin | Récupération de l'historique des enchères |
| `getScreen` | `getMsgPrivate` | Écran | Admin | Demande des données de configuration de l'affichage salle |
| `requestRefresh` | `getMsgPrivate` | Client | Admin | Demande de rafraîchissement d'état |
| `connected` | `getMsgPrivate` | Client | Admin | Notification de présence de l'enchérisseur |
| `exit` | `getMsgPrivate` | Client | Admin | Sortie volontaire de la salle d'enchère |
| `follow` | `getMsgPrivate` | Client | Admin | Inscription au flux de suivi |
| `message` / `online` / `users` | `getMsgRoom` | Admin | Room `auctav_follow` | Télémétrie et logs destinés à la console de suivi |

---

## 3. Compatibilité Socket.IO v4 ↔ Client 2.3.0 (allowEIO3)

Les applications clientes Auctav existantes sont intégrées dans des pages PHP avec la bibliothèque JavaScript `socket.io-client 2.3.0`.

### Le problème du protocole Engine.IO
- `socket.io-client@2.x` utilise le protocole **Engine.IO v3**.
- `socket.io@4.x` (serveur) utilise par défaut le protocole **Engine.IO v4**, incompatible au niveau du handshake initial et de l'encodage des paquets (notamment le typage binaire et les pings).

### La solution : `allowEIO3: true`
Le serveur active impérativement l'option `allowEIO3: true` lors de l'instanciation de `SocketIOServer` :
```javascript
const io = new SocketIOServer(httpServer, {
  allowEIO3: true, // Accepte les clients socket.io 2.x
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 20000,
});
```

Grâce à cette directive :
- Le handshake d'Engine.IO v3 est traité de façon transparente.
- Les callbacks de confirmation (`ack`) fonctionnent parfaitement avec `socket.emit('admin', pseudo, key, function(res) { ... })`.
- Le transport démarre en polling et bascule automatiquement en WebSocket (`upgrade`).
- **Aucune ligne de code n'a besoin d'être modifiée dans les clients legacy existants !**

---

## 4. Guide de Migration pour `update.php`

Dans l'architecture historique, la page de régie secondaire `update.php` émet des modifications de lots via `getMsgRoom` (`updateLot`) **sans jamais s'authentifier** ni exécuter `joinroom`.

### Option Recommandée : Authentification de `update.php` (Sécurisée)
Dans le fichier PHP / JS de `update.php`, ajoutez l'authentification avec la clé admin avant d'émettre les messages :

```javascript
// Dans update.php (client socket.io-client 2.3.0) :
var socket = io.connect('https://socket-auctav.astucom.com/', { withCredentials: true });

socket.on('connect', function() {
    // Authentification de la régie secondaire avec la clé secrète partagée
    var adminKey = '<?php echo AUCTAV_SOCKET_ADMIN_KEY; ?>';
    socket.emit('admin', 'RegieUpdatePHP', adminKey, function(ack) {
        if (ack && ack.ok) {
            console.log('update.php authentifié auprès du serveur Socket.IO');
        } else {
            console.error('Échec authentification régie');
        }
    });
});

// Émission normale ensuite :
function sendLotUpdate(lotId, data) {
    socket.emit('getMsgRoom', {
        room: 'auctav' + venteId,
        type: 'updateLot',
        msg: data,
        name: 'Régie Update'
    });
}
```

### Option de transition temporaire (`ALLOW_UNAUTH_UPDATELOT=true`)
Si `update.php` ne peut pas être modifié immédiatement lors de la mise en service du nouveau serveur :
1. Définissez dans `.env` : `ALLOW_UNAUTH_UPDATELOT=true`.
2. Le serveur autorisera temporairement le message `updateLot` par des sockets non authentifiés via `getMsgRoom`.
3. Dès que `update.php` est mis à jour, repassez à `ALLOW_UNAUTH_UPDATELOT=false` pour sceller définitivement la sécurité.

---

## 5. Variables d'Environnement

Créez votre fichier `.env` sur le serveur :

| Variable | Défaut | Obligatoire | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | `3000` | Non | Port d'écoute du serveur Node.js |
| `ADMIN_KEY` | - | **OUI** | Clé secrète d'administration régie (à générer aléatoirement) |
| `ALLOWED_ORIGINS` | `https://www.auctav.com,https://auctav.com` | **OUI** | Liste blanche des domaines autorisés pour CORS (séparés par `,`) |
| `REDIS_URL` | *vide* | Non | URL Redis (ex. `redis://127.0.0.1:6379`) pour clustering multi-processus |
| `LOG_LEVEL` | `info` | Non | Niveau de log Pino (`fatal`, `error`, `warn`, `info`, `debug`) |
| `ALLOW_UNAUTH_UPDATELOT`| `false` | Non | Autorise exceptionnellement `updateLot` non authentifié |

---

## 6. Déploiement en Production

### Option A : PM2 (Recommandé sur machine virtuelle / VPS)

1. **Installation de Node.js 20 LTS** et PM2 :
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

2. **Installation des dépendances** :
   ```bash
   cd /var/www/auctav-socket
   npm ci --omit=dev
   ```

3. **Création du `.env` de production** :
   ```bash
   cp .env.example .env
   nano .env
   ```

4. **Démarrage avec PM2** :
   ```bash
   pm2 start ecosystem.config.js --env production
   pm2 save
   pm2 startup
   ```

5. **Surveillance** :
   ```bash
   pm2 logs auctav-socket-server
   pm2 monit
   ```

---

### Option B : Docker & Docker Compose

1. **Lancement instantané** avec Redis :
   ```bash
   docker compose up -d --build
   ```

2. **Vérification de l'état** :
   ```bash
   docker compose ps
   curl http://127.0.0.1:3000/health
   ```

---

### Configuration Nginx Reverse Proxy SSL

Copiez `nginx.conf` vers `/etc/nginx/sites-available/socket-auctav.astucom.com.conf` :
```bash
sudo ln -s /etc/nginx/sites-available/socket-auctav.astucom.com.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Points clés de la configuration Nginx :
- `proxy_http_version 1.1;` et en-têtes `Upgrade` / `Connection "upgrade"` pour le WebSocket.
- `proxy_read_timeout 86400s;` (24 heures) pour empêcher Nginx de couper prématurément les connexions inactives des enchérisseurs.
- `proxy_buffering off;` pour garantir la transmission instantanée paquet par paquet.
- `ip_hash` sur le bloc `upstream` pour garantir la persistance lors du long-polling initial.

---

## 7. Banc de Test Automatisé

Un script de test bout-en-bout complet est fourni dans `test-client.js`. Il simule l'interaction simultanée d'un Admin, d'un Enchérisseur et d'un Écran salle.

Exécutez le test :
```bash
npm run test:client
# ou directement :
ADMIN_KEY="votre_cle" TEST_SERVER_URL="http://127.0.0.1:3000" node test-client.js
```

Le script vérifie automatiquement :
1. Le rejet sur mauvaise clé admin (`timingSafeEqual`).
2. L'authentification réussie de l'admin et l'accusé de réception.
3. L'attribution de la room `auctav12` et l'émission de `userList`.
4. L'émission d'une enchère privée `doEncheres` par le client vers l'admin.
5. La confirmation privée `confirmEnchere` de l'admin vers le client.
6. La diffusion de `numLot` et `closeEnchere` à toute la room.
7. Le blocage et le rejet silencieux d'émissions frauduleuses par des non-admins.
8. La déconnexion de l'admin et la notification immédiate `userList { admin: null }`.

---

## 8. Sécurité & Anti-Abus

1. **Protection contre les attaques temporelles (Timing Attacks)** :
   La comparaison de `ADMIN_KEY` utilise `crypto.timingSafeEqual` sur les condensats SHA-256 des clés, garantissant un temps de calcul strictement identique indépendamment de la longueur du mot de passe fourni.
2. **Anti-usurpation du champ `from`** :
   Le champ `from` transmis dans `sendMsg` est **systématiquement écrasé** par le serveur avec l'identifiant réel du socket (`socket.id`). Aucun client ne peut se faire passer pour un autre enchérisseur ou pour l'admin.
3. **Double Token Bucket (Rate Limiter)** :
   - Quota global : 20 messages par seconde par socket.
   - Quota spécialisé : 5 enchères (`doEncheres`) par seconde par socket.
   Les messages excédentaires sont silencieusement abandonnés avec enregistrement d'un avertissement (`warn`).
4. **Taille maximale des paquets (`maxHttpBufferSize`)** :
   Plafonnée à **100 KB** pour interdire les attaques par déni de service (DoS) par envoi de charges utiles volumineuses.
5. **Absence de journalisation des secrets** :
   La clé secrète `ADMIN_KEY` n'est **jamais** inscrite dans les fichiers de log. Seule l'adresse IP et l'identifiant du socket sont tracés en cas d'échec.
6. **Arrêt Propre (Graceful Shutdown)** :
   Prise en charge de `SIGTERM` et `SIGINT` : fermeture propre des sockets, vidage des états Redis et arrêt gracieux du serveur HTTP.
