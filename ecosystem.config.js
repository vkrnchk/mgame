module.exports = {
  apps: [{
    name: 'math-game',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
      HOST: 'xn--80akibkj0angmf.xn--p1ai',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      HOST: 'xn--80akibkj0angmf.xn--p1ai',
      PORT: 3000
    }
  }]
};
