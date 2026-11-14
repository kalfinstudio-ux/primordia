// Opsi pm2:  npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [{
    name: 'primordia',
    script: 'npm',
    args: 'run dev',
    autorestart: true,
    max_restarts: 1000,
    restart_delay: 3000,
    watch: false,
  }],
};
