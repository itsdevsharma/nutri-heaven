module.exports = {
  apps: [{
    name: 'nutri-heaven-api',
    cwd: '/var/www/apps/nutri-heaven/backend',
    script: 'dist/main.js',
    interpreter: '/usr/bin/node',
    node_args: '--env-file=/var/www/apps/nutri-heaven/backend/.env',
    env: { NODE_ENV: 'production', API_HOST: '127.0.0.1' },
    autorestart: true,
    max_memory_restart: '512M',
    time: true,
  }],
};
