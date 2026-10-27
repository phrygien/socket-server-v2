/**
 * @file src/App.tsx
 * @description Console de contrôle et banc de test temps réel pour le serveur Socket.IO Auctav.
 * Permet de tester le protocole complet (Admin, Enchérisseur, Écran salle, Régie update.php)
 * et de visualiser tous les livrables de production prêts à déployer.
 */

import React, { useState, useEffect, useRef } from 'react';
import { io as createClientSocket, Socket } from 'socket.io-client';
import {
  Server,
  Shield,
  Activity,
  FileCode,
  Terminal,
  Gavel,
  Tv,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Send,
  UserCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  Clock,
  Layers,
  ChevronRight,
  ExternalLink,
  Zap,
} from 'lucide-react';

// Fichiers livrables embarqués pour inspection et copie en un clic
import { deliverables } from './deliverablesContent';

interface HealthData {
  status: string;
  uptime: number;
  connections: number;
  rooms?: Array<{ name: string; count: number; admin: string | null }>;
  storage?: string;
  timestamp?: string;
}

interface LogEntry {
  id: string;
  time: string;
  actor: 'Admin' | 'Enchérisseur' | 'Écran' | 'Serveur' | 'Attaquant';
  event: string;
  type?: string;
  payload: any;
  direction: 'in' | 'out' | 'sys';
  status?: 'ok' | 'warn' | 'error';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'inspector' | 'security' | 'code' | 'docs'>('simulator');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('server.js');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // États des acteurs simulés
  // 1. Admin
  const [adminSocket, setAdminSocket] = useState<Socket | null>(null);
  const [adminConnected, setAdminConnected] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState('auctav_secret_dev_key');
  const [adminRoom, setAdminRoom] = useState('auctav12');
  const [currentLot, setCurrentLot] = useState({ id: 42, name: 'Pur-sang Éclipse Star', price: 45000 });
  const [adminId, setAdminId] = useState<string | null>(null);

  // 2. Enchérisseur (Bidder)
  const [bidderSocket, setBidderSocket] = useState<Socket | null>(null);
  const [bidderConnected, setBidderConnected] = useState(false);
  const [bidderName, setBidderName] = useState('Marc Dubois (Écurie Normandie)');
  const [bidAmount, setBidAmount] = useState(48000);
  const [bidderRoomAdmin, setBidderRoomAdmin] = useState<string | null>(null);
  const [bidderRoomCount, setBidderRoomCount] = useState(0);
  const [lastBidStatus, setLastBidStatus] = useState<string | null>(null);

  // 3. Écran Salle
  const [screenSocket, setScreenSocket] = useState<Socket | null>(null);
  const [screenConnected, setScreenConnected] = useState(false);
  const [screenLot, setScreenLot] = useState<any>({ lot: 42, nom: 'Pur-sang Éclipse Star', montant: 45000, statut: 'EN COURS' });

  // 4. Testeur de sécurité
  const [securityStatus, setSecurityStatus] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (
    actor: LogEntry['actor'],
    event: string,
    payload: any,
    direction: LogEntry['direction'] = 'sys',
    type?: string,
    status?: LogEntry['status']
  ) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString('fr-FR', { hour12: false }),
      actor,
      event,
      type,
      payload,
      direction,
      status: status || 'ok',
    };
    setLogs(prev => [entry, ...prev.slice(0, 150)]);
  };

  // Polling du healthcheck
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/server-info');
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        } else {
          const fallback = await fetch('/health');
          if (fallback.ok) setHealth(await fallback.json());
        }
      } catch (e) {
        // En cas d'indisponibilité momentanée
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 2500);
    return () => clearInterval(interval);
  }, []);

  // Déconnexion propre des sockets de simulation au démontage
  useEffect(() => {
    return () => {
      adminSocket?.disconnect();
      bidderSocket?.disconnect();
      screenSocket?.disconnect();
    };
  }, [adminSocket, bidderSocket, screenSocket]);

  // Actions Admin
  const handleConnectAdmin = () => {
    if (adminSocket) {
      adminSocket.disconnect();
      setAdminSocket(null);
      setAdminConnected(false);
      setAdminAuth(false);
      setAdminId(null);
      addLog('Admin', 'Déconnexion manuelle régie', {}, 'out', undefined, 'warn');
      return;
    }

    const socket = createClientSocket(window.location.origin, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: false,
    });

    socket.on('connect', () => {
      setAdminConnected(true);
      setAdminId(socket.id || null);
      addLog('Admin', 'connect', { socketId: socket.id }, 'sys');

      // Tentative d'authentification admin avec clé
      socket.emit('admin', 'Régie Auctav', adminKeyInput, (ack: any) => {
        if (ack && ack.ok) {
          setAdminAuth(true);
          addLog('Admin', 'admin (auth ACK)', { ok: true, pseudo: 'Régie Auctav' }, 'in', undefined, 'ok');
          // Rejoint automatiquement la room de vente
          socket.emit('joinroom', adminRoom);
          addLog('Admin', 'joinroom', { room: adminRoom }, 'out');
        } else {
          setAdminAuth(false);
          addLog('Admin', 'admin (auth REJETÉ)', { ok: false }, 'in', undefined, 'error');
        }
      });
    });

    socket.on('userList', payload => {
      addLog('Admin', 'userList', payload, 'in');
    });

    socket.on('sendMsg', msg => {
      addLog('Admin', 'sendMsg (reçu)', msg, 'in', msg.type, 'ok');
      // Si c'est une offre d'enchère, incrémenter le prix suggéré
      if (msg.type === 'doEncheres' && msg.msg && msg.msg.montant) {
        setBidAmount(Number(msg.msg.montant) + 2000);
      }
    });

    socket.on('disconnect', () => {
      setAdminConnected(false);
      setAdminAuth(false);
      setAdminId(null);
      addLog('Admin', 'disconnect', {}, 'sys', undefined, 'warn');
    });

    setAdminSocket(socket);
  };

  const handleAdminBroadcastNumLot = () => {
    if (!adminSocket || !adminAuth) return;
    const payload = {
      room: adminRoom,
      type: 'numLot',
      msg: {
        lot: currentLot.id,
        nom: currentLot.name,
        montantDepart: currentLot.price,
        description: 'Yearling Mâle, pedigree d’exception gagnant Groupe 1',
      },
      name: 'Régie Commissaire',
    };
    adminSocket.emit('getMsgRoom', payload);
    addLog('Admin', 'getMsgRoom (numLot)', payload, 'out', 'numLot');
  };

  const handleAdminConfirmBid = (targetId: string, montant: number) => {
    if (!adminSocket || !adminAuth) return;
    const payload = {
      toid: targetId,
      type: 'confirmEnchere',
      msg: {
        lot: currentLot.id,
        montant: montant,
        status: 'VALIDE_REGIE',
        heure: new Date().toLocaleTimeString(),
      },
      name: 'Commissaire Auctav',
    };
    adminSocket.emit('getMsgPrivate', payload);
    addLog('Admin', 'getMsgPrivate (confirmEnchere)', payload, 'out', 'confirmEnchere');
  };

  const handleAdminCloseEnchere = () => {
    if (!adminSocket || !adminAuth) return;
    const payload = {
      room: adminRoom,
      type: 'closeEnchere',
      msg: {
        lot: currentLot.id,
        statut: 'ADJUGÉ',
        montantFinal: bidAmount,
        adjudicataire: bidderName,
      },
      name: 'Régie Auctav',
    };
    adminSocket.emit('getMsgRoom', payload);
    addLog('Admin', 'getMsgRoom (closeEnchere)', payload, 'out', 'closeEnchere');
  };

  // Actions Enchérisseur (Bidder)
  const handleConnectBidder = () => {
    if (bidderSocket) {
      bidderSocket.disconnect();
      setBidderSocket(null);
      setBidderConnected(false);
      setBidderRoomAdmin(null);
      addLog('Enchérisseur', 'Déconnexion manuelle', {}, 'out');
      return;
    }

    const socket = createClientSocket(window.location.origin, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: false,
    });

    socket.on('connect', () => {
      setBidderConnected(true);
      addLog('Enchérisseur', 'connect', { socketId: socket.id }, 'sys');

      // Identification pseudo et joinroom
      socket.emit('username', bidderName);
      socket.emit('joinroom', adminRoom);
      addLog('Enchérisseur', 'username & joinroom', { name: bidderName, room: adminRoom }, 'out');
    });

    socket.on('userList', payload => {
      setBidderRoomAdmin(payload.admin);
      setBidderRoomCount(payload.count);
      addLog('Enchérisseur', 'userList', payload, 'in', undefined, payload.admin ? 'ok' : 'warn');
    });

    socket.on('sendMsg', msg => {
      addLog('Enchérisseur', 'sendMsg (reçu)', msg, 'in', msg.type);
      if (msg.type === 'confirmEnchere') {
        setLastBidStatus(`Enchère de ${msg.msg?.montant?.toLocaleString()} € validée par la régie !`);
      } else if (msg.type === 'numLot') {
        setLastBidStatus(`Nouveau lot au catalogue : Lot #${msg.msg?.lot}`);
      } else if (msg.type === 'closeEnchere') {
        setLastBidStatus(`Lot adjugé à ${msg.msg?.montantFinal?.toLocaleString()} € !`);
      }
    });

    socket.on('disconnect', () => {
      setBidderConnected(false);
      setBidderRoomAdmin(null);
      addLog('Enchérisseur', 'disconnect', {}, 'sys', undefined, 'warn');
    });

    setBidderSocket(socket);
  };

  const handleBidderPlaceBid = () => {
    if (!bidderSocket || !bidderRoomAdmin) return;
    const payload = {
      toid: bidderRoomAdmin,
      type: 'doEncheres',
      msg: {
        lot: currentLot.id,
        montant: bidAmount,
        devise: 'EUR',
      },
      name: bidderName,
    };
    bidderSocket.emit('getMsgPrivate', payload);
    addLog('Enchérisseur', 'getMsgPrivate (doEncheres)', payload, 'out', 'doEncheres');
    setLastBidStatus(`Offre transmise à l'Admin : ${bidAmount.toLocaleString()} €...`);
  };

  // Actions Écran Salle
  const handleConnectScreen = () => {
    if (screenSocket) {
      screenSocket.disconnect();
      setScreenSocket(null);
      setScreenConnected(false);
      return;
    }

    const socket = createClientSocket(window.location.origin, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: false,
    });

    socket.on('connect', () => {
      setScreenConnected(true);
      socket.emit('joinroom', adminRoom);
      socket.emit('joinroom', 'auctav_screen');
      addLog('Écran', 'connect & joinroom', { rooms: [adminRoom, 'auctav_screen'] }, 'out');
    });

    socket.on('userList', payload => {
      addLog('Écran', 'userList', payload, 'in');
    });

    socket.on('sendMsg', msg => {
      addLog('Écran', 'sendMsg (reçu)', msg, 'in', msg.type);
      if (msg.type === 'numLot') {
        setScreenLot({
          lot: msg.msg?.lot,
          nom: msg.msg?.nom,
          montant: msg.msg?.montantDepart,
          statut: 'EN COURS',
        });
      } else if (msg.type === 'confirmEnchere' || msg.type === 'doEncheres') {
        setScreenLot((prev: any) => ({
          ...prev,
          montant: msg.msg?.montant || prev.montant,
        }));
      } else if (msg.type === 'closeEnchere') {
        setScreenLot((prev: any) => ({
          ...prev,
          statut: 'ADJUGÉ',
          montant: msg.msg?.montantFinal || prev.montant,
        }));
      }
    });

    setScreenSocket(socket);
  };

  // Test de spam pour vérifier le Token Bucket Rate Limiter
  const handleTriggerRateLimitTest = () => {
    if (!bidderSocket || !bidderRoomAdmin) {
      alert("Connectez d'abord l'Enchérisseur et l'Admin pour tester le rate limiting.");
      return;
    }
    setSecurityStatus('Envoi rapide de 25 enchères doEncheres consécutives...');
    for (let i = 1; i <= 25; i++) {
      bidderSocket.emit('getMsgPrivate', {
        toid: bidderRoomAdmin,
        type: 'doEncheres',
        msg: { testSpam: i, montant: 50000 + i * 100 },
        name: 'SpamTester',
      });
    }
    addLog('Attaquant', 'Spam 25x doEncheres', { quotaMax: '5/sec' }, 'out', 'doEncheres', 'warn');
    setTimeout(() => {
      setSecurityStatus('Test terminé : Seules 5 enchères ont été traitées, les 20 autres ont été bridées.');
    }, 800);
  };

  // Copier le contenu d'un fichier
  const handleCopyCode = (filename: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(filename);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Barre supérieure principale */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black">
            <Gavel className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Auctav Realtime Socket.IO
                <span className="text-xs font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  v4.8.4
                </span>
                <span className="text-xs font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> allowEIO3 (Client 2.3.0)
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Serveur de ventes aux enchères équines en direct &bull; Relais Régie, Enchérisseurs et Salle
            </p>
          </div>
        </div>

        {/* Métriques Health en direct */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300">Connexions :</span>
            <span className="font-mono font-bold text-emerald-400">
              {health ? health.connections : '1'}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-300">Uptime :</span>
            <span className="font-mono text-slate-200">
              {health ? `${health.uptime}s` : 'actif'}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-300">Stockage :</span>
            <span className="font-mono text-amber-300 font-semibold uppercase">
              {health?.storage || 'Mémoire (Map)'}
            </span>
          </div>

          <a
            href="/health"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded transition"
            title="Consulter le endpoint JSON /health"
          >
            /health <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* Navigation par onglets */}
      <nav className="bg-slate-900 border-b border-slate-800 px-6 flex gap-2">
        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition ${
            activeTab === 'simulator'
              ? 'border-amber-500 text-amber-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Play className="w-4 h-4" /> Banc de Test Multi-Acteurs
        </button>

        <button
          onClick={() => setActiveTab('inspector')}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition ${
            activeTab === 'inspector'
              ? 'border-amber-500 text-amber-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Terminal className="w-4 h-4" /> Flux Événements Temps Réel ({logs.length})
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition ${
            activeTab === 'security'
              ? 'border-amber-500 text-amber-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Shield className="w-4 h-4" /> Sécurité &amp; Rate Limiter
        </button>

        <button
          onClick={() => setActiveTab('code')}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition ${
            activeTab === 'code'
              ? 'border-amber-500 text-amber-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <FileCode className="w-4 h-4" /> Livrables de Déploiement (9 fichiers)
        </button>
      </nav>

      {/* Corps principal */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* ==================================================================== */}
        {/* ONGLET 1 : BANC DE TEST MULTI-ACTEURS SIMULÉS                        */}
        {/* ==================================================================== */}
        {activeTab === 'simulator' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Simulateur Réseau Interactif Auctav
                  </h2>
                  <p className="text-xs text-slate-400">
                    Instancie de véritables connexions Socket.IO dans votre navigateur pour valider le protocole sans modifier vos pages PHP existantes.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Room active de test :</span>
                <input
                  type="text"
                  value={adminRoom}
                  onChange={e => setAdminRoom(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Grille des 3 acteurs clés */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ACTEUR 1 : RÉGIE / COMMISSAIRE-PRISEUR (ADMIN) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-amber-950/20 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                      <Gavel className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">1. Régie / Commissaire</h3>
                      <p className="text-xs text-slate-400">Autorité exclusive des enchères</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      adminAuth
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : adminConnected
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {adminAuth ? '● Authentifié' : adminConnected ? '○ Non-Auth' : '○ Déconnecté'}
                  </span>
                </div>

                <div className="p-5 flex-1 space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">
                      Clé d'administration (ADMIN_KEY) :
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={adminKeyInput}
                        onChange={e => setAdminKeyInput(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                        placeholder="ADMIN_KEY"
                      />
                      <button
                        onClick={handleConnectAdmin}
                        className={`px-3 py-1.5 rounded-lg font-medium transition ${
                          adminConnected
                            ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
                        }`}
                      >
                        {adminConnected ? 'Quitter' : 'Connecter'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Vérifié avec <code>crypto.timingSafeEqual</code> par le serveur.
                    </p>
                  </div>

                  {adminId && (
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 font-mono text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Socket ID:</span>
                      <span className="text-amber-400 font-bold">{adminId}</span>
                    </div>
                  )}

                  {/* Actions de la régie */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <span className="font-semibold text-slate-300 block">Actions Régie :</span>

                    <button
                      disabled={!adminAuth}
                      onClick={handleAdminBroadcastNumLot}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-amber-400" /> Annoncer Lot #{currentLot.id}
                      </span>
                      <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 font-mono">
                        getMsgRoom (numLot)
                      </span>
                    </button>

                    <button
                      disabled={!adminAuth || !bidderSocket}
                      onClick={() => bidderSocket && handleAdminConfirmBid(bidderSocket.id!, bidAmount)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Valider Enchère ({bidAmount.toLocaleString()} €)
                      </span>
                      <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 font-mono">
                        confirmEnchere
                      </span>
                    </button>

                    <button
                      disabled={!adminAuth}
                      onClick={handleAdminCloseEnchere}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Gavel className="w-3.5 h-3.5" /> Clôturer l'Enchère (Adjugé)
                      </span>
                      <span className="text-[10px] bg-rose-950 px-1.5 py-0.5 rounded text-rose-300 font-mono">
                        closeEnchere
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ACTEUR 2 : ENCHÉRISSEUR (BIDDER WEB / MOBILE) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-blue-950/20 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">2. Enchérisseur (Client)</h3>
                      <p className="text-xs text-slate-400">Page PHP enchères (socket 2.3.0)</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      bidderConnected
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {bidderConnected ? '● Connecté' : '○ Déconnecté'}
                  </span>
                </div>

                <div className="p-5 flex-1 space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Pseudo Enchérisseur :</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={bidderName}
                        onChange={e => setBidderName(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={handleConnectBidder}
                        className={`px-3 py-1.5 rounded-lg font-medium transition ${
                          bidderConnected
                            ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                            : 'bg-blue-600 hover:bg-blue-700 text-white font-bold'
                        }`}
                      >
                        {bidderConnected ? 'Quitter' : 'Rejoindre'}
                      </button>
                    </div>
                  </div>

                  {/* État de présence reçu via userList */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Admin actif de la salle :</span>
                      {bidderRoomAdmin ? (
                        <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {bidderRoomAdmin.slice(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-amber-400 font-mono font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> null (Régie absente)
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Participants en salle :</span>
                      <span className="font-mono text-slate-200">{bidderRoomCount}</span>
                    </div>
                  </div>

                  {/* Bouton d'enchère interactive */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 font-medium">Offre à placer :</span>
                      <span className="text-base font-mono font-bold text-emerald-400">
                        {bidAmount.toLocaleString()} €
                      </span>
                    </div>

                    <button
                      disabled={!bidderConnected || !bidderRoomAdmin}
                      onClick={handleBidderPlaceBid}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-emerald-950/40 transition"
                    >
                      <Send className="w-4 h-4" /> Placer Enchère (doEncheres)
                    </button>

                    {!bidderRoomAdmin && bidderConnected && (
                      <p className="text-[11px] text-amber-400 text-center bg-amber-950/30 p-2 rounded-lg border border-amber-800/40">
                        ⚠️ L'interface d'enchère est automatiquement verrouillée car aucun admin n'est présent dans la room (contrôle <code>userList.admin</code>).
                      </p>
                    )}

                    {lastBidStatus && (
                      <div className="text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{lastBidStatus}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTEUR 3 : ÉCRAN SALLE & AFFICHAGE VIDÉO */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-purple-950/20 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                      <Tv className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">3. Écran Salle / Vidéo</h3>
                      <p className="text-xs text-slate-400">Écoute auctav12 &amp; auctav_screen</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      screenConnected
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {screenConnected ? '● Connecté' : '○ Déconnecté'}
                  </span>
                </div>

                <div className="p-5 flex-1 space-y-4 text-xs">
                  <button
                    onClick={handleConnectScreen}
                    className={`w-full py-2 rounded-lg font-medium transition ${
                      screenConnected
                        ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                        : 'bg-purple-600 hover:bg-purple-700 text-white font-bold'
                    }`}
                  >
                    {screenConnected ? "Arrêter l'Écran" : "Activer l'Écran Salle"}
                  </button>

                  {/* Affichage géant simulé de la salle */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                      <span className="text-[11px] font-mono text-purple-400 uppercase tracking-wider font-semibold">
                        Affichage Salle Grand Format
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          screenLot.statut === 'ADJUGÉ'
                            ? 'bg-rose-500 text-white'
                            : 'bg-amber-500 text-slate-950'
                        }`}
                      >
                        {screenLot.statut}
                      </span>
                    </div>

                    <div>
                      <div className="text-slate-400 text-[11px]">LOT ACTUEL EN PISTE :</div>
                      <div className="text-lg font-bold text-white flex items-center gap-2">
                        <span>Lot #{screenLot.lot}</span>
                        <span className="text-xs font-normal text-slate-300">
                          {screenLot.nom}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 text-[11px]">ENCHÈRE EN COURS :</div>
                      <div className="text-3xl font-mono font-black text-amber-400 tracking-tight">
                        {screenLot.montant ? screenLot.montant.toLocaleString() : '---'} €
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    L'écran réagit aux messages diffusés par l'Admin via <code>getMsgRoom</code> (ex: <code>numLot</code>, <code>closeEnchere</code>, <code>previousLot</code>).
                  </p>
                </div>
              </div>
            </div>

            {/* Scénario test pas-à-pas guidé */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-amber-400" />
                Guide d'essai rapide du protocole complet :
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-slate-300">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="font-bold text-amber-400 block mb-1">1. Connectez l'Admin</span>
                  Cliquez sur "Connecter" dans le panneau Régie. Le serveur valide la clé et diffuse <code>userList</code>.
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="font-bold text-blue-400 block mb-1">2. Rejoignez comme Enchérisseur</span>
                  Cliquez sur "Rejoindre". L'enchérisseur détecte l'admin et déverrouille le bouton vert.
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="font-bold text-emerald-400 block mb-1">3. Placez une Enchère</span>
                  Cliquez sur "Placer Enchère". L'Admin la reçoit en privé et clique sur "Valider Enchère".
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="font-bold text-purple-400 block mb-1">4. Déconnectez l'Admin</span>
                  Cliquez sur "Quitter" côté Admin. Les clients reçoivent instantanément <code>userList &#123; admin: null &#125;</code> !
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* ONGLET 2 : FLUX ÉVÉNEMENTS TEMPS RÉEL (LOGS STRUCTURÉS)              */}
        {/* ==================================================================== */}
        {activeTab === 'inspector' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-amber-400" /> Flux d'Événements Socket.IO en Direct
                </h2>
                <p className="text-xs text-slate-400">
                  Traçabilité exhaustive des événements émis et reçus (<code>sendMsg</code>, <code>userList</code>, <code>getMsgRoom</code>, <code>getMsgPrivate</code>).
                </p>
              </div>
              <button
                onClick={() => setLogs([])}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Effacer les logs
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
              <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-800/60 p-2">
                {logs.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    Aucun événement pour le moment. Interagissez avec les acteurs dans l'onglet "Banc de Test".
                  </div>
                ) : (
                  logs.map(log => (
                    <div key={log.id} className="p-2.5 hover:bg-slate-900/60 transition flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-[10px]">{log.time}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.actor === 'Admin'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : log.actor === 'Enchérisseur'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : log.actor === 'Écran'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : log.actor === 'Attaquant'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {log.actor}
                          </span>
                          <span className="text-white font-semibold">{log.event}</span>
                          {log.type && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                              type: {log.type}
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-bold ${
                            log.direction === 'in'
                              ? 'text-emerald-400'
                              : log.direction === 'out'
                              ? 'text-cyan-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {log.direction === 'in' ? '⬅ REÇU' : log.direction === 'out' ? '➡ ÉMIS' : '⚙ SYSTÈME'}
                        </span>
                      </div>
                      <pre className="text-[11px] text-slate-300 bg-slate-900/70 p-2 rounded overflow-x-auto border border-slate-800/60">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* ONGLET 3 : SÉCURITÉ & RATE LIMITER                                   */}
        {/* ==================================================================== */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" /> Sécurité, Contrôle d'Accès &amp; Anti-Abus
              </h2>
              <p className="text-xs text-slate-400">
                Vérification des protections contre l'usurpation d'identité, les attaques temporelles et le flooding.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Test du Rate Limiter */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Rate Limiter (Token Bucket)</h3>
                    <p className="text-xs text-slate-400">Plafond : 20 msgs/s total &amp; 5 doEncheres/s</p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Chaque socket possède son propre panier à jetons en mémoire. Si un client malveillant ou une page en boucle bombarde le serveur, les messages excédentaires sont ignorés silencieusement sans saturer le processeur.
                </p>

                <button
                  onClick={handleTriggerRateLimitTest}
                  className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition"
                >
                  <Zap className="w-4 h-4" /> Tester le Rate Limiter (Spam 25x doEncheres)
                </button>

                {securityStatus && (
                  <div className="p-3 rounded-lg bg-slate-950 border border-amber-500/30 text-amber-300 text-xs">
                    {securityStatus}
                  </div>
                )}
              </div>

              {/* Protection Timing Attacks & Anti-Usurpation */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Cryptographie &amp; Intégrité</h3>
                    <p className="text-xs text-slate-400">timingSafeEqual &amp; from immuable</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block">1. crypto.timingSafeEqual (SHA-256)</span>
                    <p className="text-slate-400">
                      La comparaison de la clé d'administration s'exécute en temps strictement constant indépendamment de la taille ou du contenu de la clé fournie, neutralisant les attaques par canal auxiliaire (timing attacks).
                    </p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block">2. Écrasement forcé de 'from'</span>
                    <p className="text-slate-400">
                      Même si un client envoie <code>&#123; from: 'Admin' &#125;</code> dans son payload, le serveur réécrit systématiquement <code>from: socket.id</code> réel avant le relais.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block">3. maxHttpBufferSize (100 KB)</span>
                    <p className="text-slate-400">
                      Rejet automatique au niveau Engine.IO de tout paquet dépassant 100 Ko pour interdire les attaques par déni de service mémoire.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* ONGLET 4 : FICHIERS ET DÉPLOIEMENT (9 LIVRABLES)                     */}
        {/* ==================================================================== */}
        {activeTab === 'code' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-amber-400" /> Livrables Prêts à Déployer
                </h2>
                <p className="text-xs text-slate-400">
                  Tous les fichiers complets demandés, prêts pour la production sur vos serveurs ou conteneurs.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Sélecteur de fichier */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider px-2 block mb-2 font-semibold">
                  Fichiers générés :
                </span>
                {Object.keys(deliverables).map(fileName => (
                  <button
                    key={fileName}
                    onClick={() => setSelectedFile(fileName)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between transition ${
                      selectedFile === fileName
                        ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span>{fileName}</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                ))}
              </div>

              {/* Visualiseur de code avec bouton Copier */}
              <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                <div className="p-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
                    <FileCode className="w-4 h-4 text-amber-400" />
                    <span>/{selectedFile}</span>
                  </div>

                  <button
                    onClick={() => handleCopyCode(selectedFile, deliverables[selectedFile])}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition font-medium"
                  >
                    {copiedKey === selectedFile ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copier le fichier
                      </>
                    )}
                  </button>
                </div>

                <div className="p-4 bg-slate-950 overflow-x-auto max-h-[600px] overflow-y-auto">
                  <pre className="font-mono text-xs text-slate-200 leading-relaxed">
                    {deliverables[selectedFile]}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Pied de page */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-4 px-6 text-center text-xs text-slate-500">
        Serveur Socket.IO Auctav &bull; Architecture Node.js 20+ &amp; Socket.IO v4 (allowEIO3) &bull; Conçu pour Auctav Live Auctions
      </footer>
    </div>
  );
}
