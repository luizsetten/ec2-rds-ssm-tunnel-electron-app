const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { shell } = require('electron');
const {
  SSOOIDCClient,
  RegisterClientCommand,
  StartDeviceAuthorizationCommand,
  CreateTokenCommand,
} = require('@aws-sdk/client-sso-oidc');
const { SSOClient, GetRoleCredentialsCommand } = require('@aws-sdk/client-sso');

const DEFAULT_SSO_SCOPES = ['sso:account:access'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// AWS shared config (~/.aws/config) parsing
// ---------------------------------------------------------------------------

function parseIni(content) {
  const result = {};
  let current = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const section = /^\[(.+)\]$/.exec(line);
    if (section) {
      current = section[1].trim();
      if (!result[current]) result[current] = {};
      continue;
    }

    const eq = line.indexOf('=');
    if (current && eq !== -1) {
      const key = line.slice(0, eq).trim();
      result[current][key] = line.slice(eq + 1).trim();
    }
  }

  return result;
}

function loadAwsConfig() {
  const configPath = process.env.AWS_CONFIG_FILE || path.join(os.homedir(), '.aws', 'config');
  try {
    return parseIni(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function getProfileSection(config, profileName) {
  return config[`profile ${profileName}`] || config[profileName];
}

// Lists the AWS profiles configured in ~/.aws/config so the UI can offer them
// for selection per connection.
function listProfiles() {
  const config = loadAwsConfig();
  const profiles = [];

  for (const section of Object.keys(config)) {
    if (section === 'default') profiles.push('default');
    else if (section.startsWith('profile ')) profiles.push(section.slice('profile '.length).trim());
  }

  return [...new Set(profiles)].sort((a, b) => a.localeCompare(b));
}

// Resolve SSO settings for a profile, supporting both the legacy inline format
// and the newer [sso-session NAME] format.
function resolveProfileSso(profileName) {
  const config = loadAwsConfig();
  const profile = getProfileSection(config, profileName);

  if (!profile) {
    throw new Error(`Profile "${profileName}" não encontrado em ~/.aws/config`);
  }

  let startUrl = profile.sso_start_url;
  let region = profile.sso_region;
  let scopes = profile.sso_registration_scopes;
  let cacheKey = startUrl;

  if (profile.sso_session) {
    const session = config[`sso-session ${profile.sso_session}`] || {};
    startUrl = session.sso_start_url || startUrl;
    region = session.sso_region || region;
    scopes = session.sso_registration_scopes || scopes;
    cacheKey = profile.sso_session;
  }

  if (!startUrl || !region) {
    throw new Error(
      `Profile "${profileName}" não está configurado para SSO (faltando sso_start_url/sso_region).`
    );
  }

  return {
    startUrl,
    region,
    accountId: profile.sso_account_id,
    roleName: profile.sso_role_name,
    profileRegion: profile.region,
    scopes: scopes
      ? scopes.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_SSO_SCOPES,
    cacheKey,
  };
}

// ---------------------------------------------------------------------------
// SSO token cache (~/.aws/sso/cache/<sha1>.json) — shared with the AWS CLI
// ---------------------------------------------------------------------------

function ssoCacheDir() {
  return path.join(os.homedir(), '.aws', 'sso', 'cache');
}

function tokenCachePath(cacheKey) {
  const hash = crypto.createHash('sha1').update(cacheKey).digest('hex');
  return path.join(ssoCacheDir(), `${hash}.json`);
}

function readCachedToken(cacheKey) {
  try {
    const data = JSON.parse(fs.readFileSync(tokenCachePath(cacheKey), 'utf-8'));
    if (!data.accessToken || !data.expiresAt) return null;
    // Treat tokens expiring within the next minute as invalid.
    if (new Date(data.expiresAt).getTime() <= Date.now() + 60_000) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCachedToken(cacheKey, token) {
  try {
    fs.mkdirSync(ssoCacheDir(), { recursive: true });
    fs.writeFileSync(tokenCachePath(cacheKey), JSON.stringify(token, null, 2), 'utf-8');
  } catch (err) {
    console.error('Não foi possível gravar o cache do token SSO:', err);
  }
}

// ---------------------------------------------------------------------------
// SSO OIDC device authorization flow (replaces `aws sso login`)
// ---------------------------------------------------------------------------

async function ssoDeviceLogin(sso, onLog) {
  const oidc = new SSOOIDCClient({ region: sso.region });

  const register = await oidc.send(
    new RegisterClientCommand({
      clientName: `ec2-rds-ssm-tunnel-${Date.now()}`,
      clientType: 'public',
      scopes: sso.scopes,
    })
  );

  const auth = await oidc.send(
    new StartDeviceAuthorizationCommand({
      clientId: register.clientId,
      clientSecret: register.clientSecret,
      startUrl: sso.startUrl,
    })
  );

  const verificationUri = auth.verificationUriComplete || auth.verificationUri;
  onLog?.(`Autorize o login SSO no navegador: ${verificationUri}`);
  onLog?.(`Código do dispositivo: ${auth.userCode}`);
  try {
    await shell.openExternal(verificationUri);
  } catch {
    /* usuário pode abrir manualmente */
  }

  const intervalMs = (auth.interval || 5) * 1000;
  const deadline = Date.now() + (auth.expiresIn || 600) * 1000;

  while (true) {
    if (Date.now() > deadline) {
      throw new Error('Tempo esgotado aguardando a autorização do SSO.');
    }

    await sleep(intervalMs);

    try {
      const token = await oidc.send(
        new CreateTokenCommand({
          clientId: register.clientId,
          clientSecret: register.clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode: auth.deviceCode,
        })
      );

      const cached = {
        startUrl: sso.startUrl,
        region: sso.region,
        accessToken: token.accessToken,
        expiresAt: new Date(Date.now() + (token.expiresIn || 0) * 1000).toISOString(),
        clientId: register.clientId,
        clientSecret: register.clientSecret,
        registrationExpiresAt: register.clientSecretExpiresAt
          ? new Date(register.clientSecretExpiresAt * 1000).toISOString()
          : undefined,
        refreshToken: token.refreshToken,
      };

      writeCachedToken(sso.cacheKey, cached);
      onLog?.('Login SSO concluído.');
      return cached;
    } catch (err) {
      const name = err && err.name;
      if (name === 'AuthorizationPendingException') continue;
      if (name === 'SlowDownException') {
        await sleep(intervalMs);
        continue;
      }
      throw err;
    }
  }
}

async function ensureSsoToken(sso, onLog) {
  const cached = readCachedToken(sso.cacheKey);
  if (cached) return cached;
  onLog?.('Token SSO inexistente ou expirado. Iniciando login...');
  return ssoDeviceLogin(sso, onLog);
}

// Garante o login SSO de um profile (reutiliza o cache quando válido).
async function login(profileName, onLog) {
  const sso = resolveProfileSso(profileName);
  const cached = readCachedToken(sso.cacheKey);
  if (cached) {
    onLog?.(`Profile "${profileName}" já autenticado (SSO válido).`);
    return { alreadyValid: true };
  }
  await ssoDeviceLogin(sso, onLog);
  return { alreadyValid: false };
}

// Returns temporary credentials for the profile, performing the SSO login
// flow in-app when the cached token is missing or expired.
async function getCredentials(profileName, onLog) {
  const sso = resolveProfileSso(profileName);
  const token = await ensureSsoToken(sso, onLog);

  if (!sso.accountId || !sso.roleName) {
    throw new Error(`Profile "${profileName}" não define sso_account_id/sso_role_name.`);
  }

  const ssoClient = new SSOClient({ region: sso.region });
  const { roleCredentials } = await ssoClient.send(
    new GetRoleCredentialsCommand({
      accountId: sso.accountId,
      roleName: sso.roleName,
      accessToken: token.accessToken,
    })
  );

  return {
    profileRegion: sso.profileRegion,
    ssoRegion: sso.region,
    credentials: {
      accessKeyId: roleCredentials.accessKeyId,
      secretAccessKey: roleCredentials.secretAccessKey,
      sessionToken: roleCredentials.sessionToken,
      expiration: roleCredentials.expiration ? new Date(roleCredentials.expiration) : undefined,
    },
  };
}

module.exports = { getCredentials, resolveProfileSso, listProfiles, login };
