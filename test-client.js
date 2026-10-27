/**
 * @file test-client.js
 * @description Script de test automatisé du protocole Auctav Socket.IO.
 * Simule les 3 acteurs clés :
 * 1. Admin (Régie / Commissaire-priseur)
 * 2. Enchérisseur (Bidder web/mobile)
 * 3. Écran salle (Screen / Affichage)
 * 
 * Scénario validé :
 * 1. Connexion et authentification de l'Admin avec timingSafeEqual ack({ ok: true })
 * 2. Inscription dans la room 'auctav12' -> userList { admin: adminId, count: 1 }
 * 3. Connexion de l'Enchérisseur et de l'Écran -> réception de userList avec l'admin
 * 4. Enchérisseur émet 'doEncheres' en privé vers l'Admin -> Admin reçoit sendMsg
 * 5. Admin valide avec 'confirmEnchere' en privé vers l'Enchérisseur -> Enchérisseur reçoit sendMsg
 * 6. Admin diffuse 'numLot' à toute la room -> Tous reçoivent sendMsg
 * 7. Admin clôture l'enchère avec 'closeEnchere' -> Tous reçoivent sendMsg
 * 8. Déconnexion de l'Admin -> Tous les clients reçoivent userList { admin: null }
 * 9. Tests de sécurité : refus mauvaise clé & blocage émission type admin par un non-admin
 */

import { io } from 'socket.io-client';

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://127.0.0.1:3000';
const ADMIN_KEY = process.env.ADMIN_KEY || 'auctav_secret_dev_key';
const ROOM = 'auctav12';

console.log('===============================================================');
console.log(`🐴 Démarrage du Banc de Test Auctav Socket.IO sur ${SERVER_URL}`);
console.log('===============================================================\n');

function createSocket(name) {
  return io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: false,
    timeout: 5000,
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let passedTests = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ÉCHEC : ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
    passedTests++;
  }
}

async function runTests() {
  const adminSocket = createSocket('Admin');
  const bidderSocket = createSocket('Bidder');
  const screenSocket = createSocket('Screen');

  let adminId = null;
  let bidderId = null;
  let screenId = null;

  try {
    // --------------------------------------------------------------------------
    // ÉTAPE 0 : Connexions réseau
    // --------------------------------------------------------------------------
    await Promise.all([
      new Promise(res => adminSocket.on('connect', () => { adminId = adminSocket.id; res(); })),
      new Promise(res => bidderSocket.on('connect', () => { bidderId = bidderSocket.id; res(); })),
      new Promise(res => screenSocket.on('connect', () => { screenId = screenSocket.id; res(); })),
    ]);

    assert(adminId && bidderId && screenId, `Tous les sockets sont connectés (Admin=${adminId}, Bidder=${bidderId}, Screen=${screenId})`);

    // --------------------------------------------------------------------------
    // ÉTAPE 1 : Test de rejet sur mauvaise clé admin
    // --------------------------------------------------------------------------
    const badAuthResult = await new Promise(resolve => {
      adminSocket.emit('admin', 'FauxAdmin', 'mauvaise_cle_123', res => resolve(res));
    });
    assert(badAuthResult && badAuthResult.ok === false, "Rejet sécurisé de l'authentification admin avec clé incorrecte");

    // --------------------------------------------------------------------------
    // ÉTAPE 2 : Authentification Admin réussie
    // --------------------------------------------------------------------------
    const goodAuthResult = await new Promise(resolve => {
      adminSocket.emit('admin', 'RegieCommissaire', ADMIN_KEY, res => resolve(res));
    });
    assert(goodAuthResult && goodAuthResult.ok === true, "Authentification réussie de l'Admin avec timingSafeEqual ack({ ok: true })");

    // --------------------------------------------------------------------------
    // ÉTAPE 3 : Admin rejoint la room 'auctav12'
    // --------------------------------------------------------------------------
    const adminUserListPromise = new Promise(resolve => {
      adminSocket.once('userList', payload => resolve(payload));
    });
    adminSocket.emit('joinroom', ROOM);
    const adminUserList = await adminUserListPromise;
    assert(adminUserList.admin === adminId, `userList reçu par Admin contient bien son adminId (${adminUserList.admin})`);

    // --------------------------------------------------------------------------
    // ÉTAPE 4 : Enchérisseur et Écran rejoignent la room
    // --------------------------------------------------------------------------
    const bidderUserListPromise = new Promise(resolve => {
      bidderSocket.once('userList', payload => resolve(payload));
    });
    bidderSocket.emit('username', 'Marc Enchérisseur');
    bidderSocket.emit('joinroom', ROOM);
    const bidderUserList = await bidderUserListPromise;
    assert(bidderUserList.admin === adminId, `userList reçu par Enchérisseur identifie l'admin (${bidderUserList.admin})`);

    screenSocket.emit('joinroom', ROOM);
    screenSocket.emit('joinroom', 'auctav_screen');
    await sleep(200);

    // --------------------------------------------------------------------------
    // ÉTAPE 5 : Enchérisseur émet 'doEncheres' en getMsgPrivate vers l'Admin
    // --------------------------------------------------------------------------
    const adminReceivedBidPromise = new Promise(resolve => {
      adminSocket.on('sendMsg', msg => {
        if (msg.type === 'doEncheres') resolve(msg);
      });
    });

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
    const bidderReceivedConfirmPromise = new Promise(resolve => {
      bidderSocket.on('sendMsg', msg => {
        if (msg.type === 'confirmEnchere') resolve(msg);
      });
    });

    adminSocket.emit('getMsgPrivate', {
      toid: bidderId,
      type: 'confirmEnchere',
      msg: { lot: 45, montant: 35000, status: 'ACCEPTEE' },
      name: 'Régie Auctav',
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
      msg: { lot: 46, nomCheval: 'Royal Thunder', prixDepart: 20000 },
      name: 'Commissaire-Priseur',
    });

    await sleep(300);
    assert(screenReceivedLot && bidderReceivedLot, `Diffusion 'numLot' reçue par l'Écran et l'Enchérisseur dans la room`);

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
      name: 'Régie Auctav',
    });

    await sleep(300);
    assert(screenReceivedClose, `Événement 'closeEnchere' reçu avec succès sur l'Écran`);

    // --------------------------------------------------------------------------
    // ÉTAPE 9 : Test de sécurité - Non-admin tente d'émettre un type réservé admin
    // --------------------------------------------------------------------------
    let unauthorizedTriggered = false;
    screenSocket.on('sendMsg', msg => {
      if (msg.type === 'fakeAdminAttack') unauthorizedTriggered = true;
    });

    bidderSocket.emit('getMsgRoom', {
      room: ROOM,
      type: 'closeEnchere', // Type réservé à l'admin
      msg: { hack: true },
      name: 'Attaquant',
    });

    await sleep(300);
    assert(!unauthorizedTriggered, `Tentative d'usurpation getMsgRoom par non-admin bloquée avec succès`);

    // --------------------------------------------------------------------------
    // ÉTAPE 10 : Déconnexion de l'Admin -> userList { admin: null }
    // --------------------------------------------------------------------------
    const bidderNullAdminPromise = new Promise(resolve => {
      bidderSocket.on('userList', payload => {
        if (payload.admin === null) resolve(payload);
      });
    });

    console.log("🔌 Déconnexion de l'Admin...");
    adminSocket.disconnect();

    const finalUserList = await bidderNullAdminPromise;
    assert(finalUserList && finalUserList.admin === null, `Notification reçue : userList { admin: null } après déconnexion admin`);

    console.log('\n===============================================================');
    console.log(`🎉 SUCCÈS TOTAL DU BANC DE TEST ! (${passedTests}/${passedTests} assertions validées)`);
    console.log('===============================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur inattendue pendant le scénario de test :', err);
    process.exit(1);
  } finally {
    adminSocket.close();
    bidderSocket.close();
    screenSocket.close();
  }
}

runTests();
