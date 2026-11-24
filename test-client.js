/**
 * @file test-client.js
 * @description Script de test automatisé du protocole Socket.IO d'enchères en direct.
 * Simule les 3 acteurs clés :
 * 1. Admin (Régie / Commissaire-priseur)
 * 2. Enchérisseur (Bidder web/mobile)
 * 3. Écran salle (Screen / Affichage)
 *
 * Scénario validé :
 * 1. Rejet sécurisé sur mauvaise clé admin
 * 2. Connexion et authentification de l'Admin avec timingSafeEqual ack({ ok: true })
 * 3. Inscription dans la room '{prefix}12' -> userList { admin: adminId, count: 1 }
 * 4. Connexion de l'Enchérisseur et de l'Écran -> réception de userList avec l'admin
 * 5. Enchérisseur émet 'doEncheres' en privé vers l'Admin -> Admin reçoit sendMsg
 * 6. Admin valide avec 'confirmEnchere' en privé vers l'Enchérisseur -> Enchérisseur reçoit sendMsg
 * 7. Admin diffuse 'numLot' à toute la room -> Tous reçoivent sendMsg
 * 8. Admin clôture l'enchère avec 'closeEnchere' -> Tous reçoivent sendMsg
 * 9. Blocage émission getMsgRoom par un non-admin
 * 10. Déconnexion de l'Admin -> Tous les clients reçoivent userList { admin: null }
 */

import 'dotenv/config';
import { io } from 'socket.io-client';

const PORT = process.env.PORT || '3000';
const SERVER_URL = process.env.TEST_SERVER_URL || `http://127.0.0.1:${PORT}`;
const ADMIN_KEY = process.env.ADMIN_KEY || 'auction_secret_dev_key';
const ROOM_PREFIX = process.env.ROOM_PREFIX || 'auction';
const ROOM = `${ROOM_PREFIX}12`;
const SCREEN_ROOM = `${ROOM_PREFIX}_screen`;

console.log('===============================================================');
console.log(`🐴 Démarrage du Banc de Test Socket.IO sur ${SERVER_URL}`);
console.log('===============================================================\n');

function createSocket() {
  return io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: false,
    timeout: 5000,
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms}ms) : ${label}`)), ms)
    ),
  ]);
}

let passedTests = 0;
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
  passedTests++;
}

async function closeSocketSafely(socket) {
  if (!socket) return;
  try {
    socket.removeAllListeners();
    if (socket.connected) {
      socket.disconnect();
    } else {
      socket.close();
    }
  } catch {
    // Ignore cleanup errors
  }
}

async function runTests() {
  const adminSocket = createSocket();
  const bidderSocket = createSocket();
  const screenSocket = createSocket();

  let adminId = null;
  let bidderId = null;
  let screenId = null;

  try {
    // --------------------------------------------------------------------------
    // ÉTAPE 0 : Connexions réseau
    // --------------------------------------------------------------------------
    await withTimeout(
      Promise.all([
        new Promise((res, rej) => {
          adminSocket.once('connect', () => { adminId = adminSocket.id; res(); });
          adminSocket.once('connect_error', err => rej(new Error(`Connexion Admin impossible: ${err.message}`)));
        }),
        new Promise((res, rej) => {
          bidderSocket.once('connect', () => { bidderId = bidderSocket.id; res(); });
          bidderSocket.once('connect_error', err => rej(new Error(`Connexion Bidder impossible: ${err.message}`)));
        }),
        new Promise((res, rej) => {
          screenSocket.once('connect', () => { screenId = screenSocket.id; res(); });
          screenSocket.once('connect_error', err => rej(new Error(`Connexion Screen impossible: ${err.message}`)));
        }),
      ]),
      5000,
      'Connexion initiale des sockets'
    );

    assert(
      Boolean(adminId && bidderId && screenId),
      `Tous les sockets sont connectés (Admin=${adminId}, Bidder=${bidderId}, Screen=${screenId})`
    );

    // --------------------------------------------------------------------------
    // ÉTAPE 1 : Test de rejet sur mauvaise clé admin
    // --------------------------------------------------------------------------
    const badAuthResult = await withTimeout(
      new Promise(resolve => {
        adminSocket.emit('admin', 'FauxAdmin', 'mauvaise_cle_123', res => resolve(res));
      }),
      3000,
      'Ack rejet mauvaise clé'
    );
    assert(
      badAuthResult && badAuthResult.ok === false,
      "Rejet sécurisé de l'authentification admin avec clé incorrecte"
    );

    // --------------------------------------------------------------------------
    // ÉTAPE 2 : Authentification Admin réussie
    // --------------------------------------------------------------------------
    const goodAuthResult = await withTimeout(
      new Promise(resolve => {
        adminSocket.emit('admin', 'RegieCommissaire', ADMIN_KEY, res => resolve(res));
      }),
      3000,
      'Ack authentification admin'
    );
    assert(
      goodAuthResult && goodAuthResult.ok === true,
      `Authentification réussie de l'Admin avec timingSafeEqual ack({ ok: true })`
    );

    // --------------------------------------------------------------------------
    // ÉTAPE 3 : Admin rejoint la room principale
    // --------------------------------------------------------------------------
    const adminUserListPromise = withTimeout(
      new Promise(resolve => {
        adminSocket.once('userList', payload => resolve(payload));
      }),
      3000,
      'userList Admin'
    );
    adminSocket.emit('joinroom', ROOM);
    const adminUserList = await adminUserListPromise;
    assert(
      adminUserList.admin === adminId,
      `userList reçu par Admin contient bien son adminId (${adminUserList.admin})`
    );

    // --------------------------------------------------------------------------
    // ÉTAPE 4 : Enchérisseur et Écran rejoignent la room
    // --------------------------------------------------------------------------
    const bidderUserListPromise = withTimeout(
      new Promise(resolve => {
        bidderSocket.once('userList', payload => resolve(payload));
      }),
      3000,
      'userList Bidder'
    );
    bidderSocket.emit('username', 'Marc Enchérisseur');
    bidderSocket.emit('joinroom', ROOM);
    const bidderUserList = await bidderUserListPromise;
    assert(
      bidderUserList.admin === adminId,
      `userList reçu par Enchérisseur identifie l'admin (${bidderUserList.admin})`
    );

    screenSocket.emit('joinroom', ROOM);
    screenSocket.emit('joinroom', SCREEN_ROOM);
    await sleep(200);

    // --------------------------------------------------------------------------
    // ÉTAPE 5 : Enchérisseur émet 'doEncheres' en getMsgPrivate vers l'Admin
    // --------------------------------------------------------------------------
    const adminReceivedBidPromise = withTimeout(
      new Promise(resolve => {
        adminSocket.on('sendMsg', msg => {
          if (msg.type === 'doEncheres') resolve(msg);
        });
      }),
      3000,
      'Réception doEncheres par Admin'
    );

    bidderSocket.emit('getMsgPrivate', {
      toid: adminId,
      type: 'doEncheres',
      msg: { lot: 45, montant: 35000, devise: 'EUR' },
      name: 'Marc Enchérisseur',
    });

    const receivedBid = await adminReceivedBidPromise;
    assert(
      receivedBid && receivedBid.from === bidderId && receivedBid.msg.montant === 35000,
      `Admin a reçu l'enchère privée 'doEncheres' avec from écrasé sécurisé (${receivedBid.from}) et montant 35000€`
    );

    // --------------------------------------------------------------------------
    // ÉTAPE 6 : Admin valide avec 'confirmEnchere' en getMsgPrivate vers le Bidder
    // --------------------------------------------------------------------------
    const bidderReceivedConfirmPromise = withTimeout(
      new Promise(resolve => {
        bidderSocket.on('sendMsg', msg => {
          if (msg.type === 'confirmEnchere') resolve(msg);
        });
      }),
      3000,
      'Réception confirmEnchere par Bidder'
    );

    adminSocket.emit('getMsgPrivate', {
      toid: bidderId,
      type: 'confirmEnchere',
      msg: { lot: 45, montant: 35000, status: 'ACCEPTEE' },
      name: 'Régie Enchères',
    });

    const receivedConfirm = await bidderReceivedConfirmPromise;
    assert(
      receivedConfirm && receivedConfirm.from === adminId && receivedConfirm.msg.status === 'ACCEPTEE',
      `Enchérisseur a reçu la confirmation privée 'confirmEnchere' de l'Admin`
    );

    // --------------------------------------------------------------------------
    // ÉTAPE 7 : Admin diffuse 'numLot' à toute la room (getMsgRoom)
    // --------------------------------------------------------------------------
    let screenReceivedLot = false;
    let bidderReceivedLot = false;

    screenSocket.on('sendMsg', msg => {
      if (msg.type === 'numLot') screenReceivedLot = true;
    });
    bidderSocket.on('sendMsg', msg => {
      if (msg.type === 'numLot') bidderReceivedLot = true;
    });

    adminSocket.emit('getMsgRoom', {
      room: ROOM,
      type: 'numLot',
      msg: { lot: 46, nomLot: 'Royal Thunder', prixDepart: 20000 },
      name: 'Commissaire-Priseur',
    });

    await sleep(300);
    assert(
      screenReceivedLot && bidderReceivedLot,
      `Diffusion 'numLot' reçue par l'Écran et l'Enchérisseur dans la room`
    );

    // --------------------------------------------------------------------------
    // ÉTAPE 8 : Admin clôture le lot avec 'closeEnchere'
    // --------------------------------------------------------------------------
    let screenReceivedClose = false;
    screenSocket.on('sendMsg', msg => {
      if (msg.type === 'closeEnchere') screenReceivedClose = true;
    });

    adminSocket.emit('getMsgRoom', {
      room: ROOM,
      type: 'closeEnchere',
      msg: { lot: 46, statut: 'ADJUGE', montantFinal: 65000 },
      name: 'Régie Enchères',
    });

    await sleep(300);
    assert(screenReceivedClose, `Événement 'closeEnchere' reçu avec succès sur l'Écran`);

    // --------------------------------------------------------------------------
    // ÉTAPE 9 : Test de sécurité - Non-admin tente d'émettre un type réservé admin
    // --------------------------------------------------------------------------
    let unauthorizedTriggered = false;
    screenSocket.on('sendMsg', msg => {
      if (msg.type === 'closeEnchere' && msg.msg?.hack === true) unauthorizedTriggered = true;
    });

    bidderSocket.emit('getMsgRoom', {
      room: ROOM,
      type: 'closeEnchere',
      msg: { hack: true },
      name: 'Attaquant',
    });

    await sleep(300);
    assert(!unauthorizedTriggered, `Tentative d'usurpation getMsgRoom par non-admin bloquée avec succès`);

    // --------------------------------------------------------------------------
    // ÉTAPE 10 : Déconnexion de l'Admin -> userList { admin: null }
    // --------------------------------------------------------------------------
    const bidderNullAdminPromise = withTimeout(
      new Promise(resolve => {
        bidderSocket.on('userList', payload => {
          if (payload.admin === null) resolve(payload);
        });
      }),
      3000,
      'Notification userList { admin: null }'
    );

    console.log("🔌 Déconnexion de l'Admin...");
    adminSocket.disconnect();

    const finalUserList = await bidderNullAdminPromise;
    assert(
      finalUserList && finalUserList.admin === null,
      `Notification reçue : userList { admin: null } après déconnexion admin`
    );

    console.log('\n===============================================================');
    console.log(`🎉 SUCCÈS TOTAL DU BANC DE TEST ! (${passedTests}/${passedTests} assertions validées)`);
    console.log('===============================================================\n');

    process.exitCode = 0;
  } catch (err) {
    console.error(`❌ ÉCHEC : ${err.message}`);
    if (err.message.includes('Authentification réussie')) {
      console.error(
        '💡 Astuce : Vérifiez que ADMIN_KEY dans votre .env (ou variable d’environnement) est identique entre le serveur et test-client.js.'
      );
    }
    process.exitCode = 1;
  } finally {
    await closeSocketSafely(adminSocket);
    await closeSocketSafely(bidderSocket);
    await closeSocketSafely(screenSocket);
    await sleep(100);
  }
}

runTests();
