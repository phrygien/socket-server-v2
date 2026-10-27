/**
 * @file ecosystem.config.js
 * @description Configuration PM2 pour le déploiement en production du serveur Auctav Socket.IO.
 * 
 * Note Architecture :
 * - En mode cluster ('instances: max' ou > 1), chaque processus a sa propre mémoire.
 *   L'utilisation de REDIS_URL est donc INDISPENSABLE pour synchroniser les rooms
 *   et l'AdminStore via @socket.io/redis-adapter et Redis pub/sub.
 * - Si vous n'utilisez pas Redis, configurez 'instances: 1' (mode fork).
 */

module.exports = {
  apps: [
    {
      name: 'auctav-socket-server',
      script: './server.js',
      // Utiliser 1 instance si REDIS_URL n'est pas configuré, sinon 'max' pour cluster multi-cœurs
      instances: process.env.REDIS_URL ? 'max' : 1,
      exec_mode: process.env.REDIS_URL ? 'cluster' : 'fork',
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      listen_timeout: 8000,
      kill_timeout: 10000,
      time: true,
      merge_logs: true,
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        ADMIN_KEY: 'METTRE_VOTRE_CLE_SECRETE_PRODUCTION_ICI',
        ALLOWED_ORIGINS: 'https://www.auctav.com,https://auctav.com,https://socket-auctav.astucom.com',
        LOG_LEVEL: 'info',
        ALLOW_UNAUTH_UPDATELOT: 'false',
        // REDIS_URL: 'redis://127.0.0.1:6379',
      },
    },
  ],
};
