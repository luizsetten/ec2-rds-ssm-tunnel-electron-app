const { spawnSync, spawn } = require('child_process');

const ssoLoggedProfiles = new Set();

function runAwsSSOLogin(profile) {
  return new Promise((resolve, reject) => {
    const test = spawnSync('aws', ['sts', 'get-caller-identity', '--profile', profile]);

    const tokenExpirado = test.status !== 0;

    if (!tokenExpirado) {
      return resolve();
    }

    const login = spawn('aws', ['sso', 'login', '--profile', profile], { stdio: 'inherit' });

    login.on('close', (code) => {
      if (code === 0) {
        ssoLoggedProfiles.add(profile);
        resolve();
      } else {
        reject(new Error(`Erro no aws sso login para profile ${profile}`));
      }
    });
  });
}

async function execSSMCommand({ instanceId, host, port=5432, localPort, profile }) {
  await runAwsSSOLogin(profile);

  const args = [
    'ssm',
    'start-session',
    '--target',
    instanceId,
    '--profile',
    profile,
    '--document-name',
    'AWS-StartPortForwardingSessionToRemoteHost',
    '--parameters',
    `host=${host},portNumber=${port},localPortNumber=${localPort}`,
  ];

  return spawn('aws', args);
}

module.exports = { execSSMCommand };