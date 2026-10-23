const { spawn } = require('child_process');
const {
  SSMClient,
  StartSessionCommand,
  TerminateSessionCommand,
} = require('@aws-sdk/client-ssm');
const { getCredentials } = require('./aws');

const PLUGIN_BIN =
  process.platform === 'win32' ? 'session-manager-plugin.exe' : 'session-manager-plugin';

// Best-effort region detection from an RDS endpoint such as
// "name.xxxx.us-east-1.rds.amazonaws.com".
function parseRegionFromHost(host) {
  const match = /\.([a-z]{2}-[a-z]+-\d)\./.exec(host || '');
  return match ? match[1] : null;
}

// Opens the SSM port-forwarding tunnel using the AWS SDK (no `aws` CLI).
// The SDK performs the StartSession API call and the session-manager-plugin
// binary handles the WebSocket data channel.
async function startTunnel({ instanceId, host, remotePort = 5432, localPort, profile }, onLog) {
  const { credentials, profileRegion, ssoRegion } = await getCredentials(profile, onLog);
  const region = profileRegion || parseRegionFromHost(host) || ssoRegion;

  const ssm = new SSMClient({ region, credentials });

  const startParams = {
    Target: instanceId,
    DocumentName: 'AWS-StartPortForwardingSessionToRemoteHost',
    Parameters: {
      host: [host],
      portNumber: [String(remotePort)],
      localPortNumber: [String(localPort)],
    },
  };

  const session = await ssm.send(new StartSessionCommand(startParams));

  // Argument layout expected by session-manager-plugin (same as the AWS CLI):
  // <ssm-response-json> <region> StartSession <profile> <params-json> <endpoint>
  const pluginArgs = [
    JSON.stringify({
      SessionId: session.SessionId,
      TokenValue: session.TokenValue,
      StreamUrl: session.StreamUrl,
    }),
    region,
    'StartSession',
    '',
    JSON.stringify(startParams),
    `https://ssm.${region}.amazonaws.com`,
  ];

  const proc = spawn(PLUGIN_BIN, pluginArgs);

  return { process: proc, sessionId: session.SessionId, region, credentials };
}

// Terminates the SSM session via the SDK.
async function terminateTunnel({ sessionId, region, credentials }) {
  const ssm = new SSMClient({ region, credentials });
  await ssm.send(new TerminateSessionCommand({ SessionId: sessionId }));
}

module.exports = { startTunnel, terminateTunnel };