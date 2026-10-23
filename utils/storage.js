const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const getConnectionsPath = () => {
  const dir = app.getPath('userData');
  const filePath = path.join(dir, 'connections.json');

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf-8');
  }

  return filePath;
};

// Normaliza conexões para o schema atual { remotePort, localPort }, migrando
// dados antigos que usavam a chave `port`.
function migrateConnections(connections) {
  if (!Array.isArray(connections)) return [];

  return connections.map((conn) => {
    const c = { ...conn };

    if (c.port != null) {
      if (c.remotePort == null && c.localPort == null) {
        // Esquema original: `port` era a porta remota.
        c.remotePort = c.port;
      } else if (c.localPort == null) {
        // Esquema intermediário: `remotePort` já definido, `port` era a porta local.
        c.localPort = c.port;
      }
      delete c.port;
    }

    return c;
  });
}

function loadConnections() {
  try {
    const filePath = getConnectionsPath();
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const migrated = migrateConnections(parsed);

    // Persiste a migração na primeira carga se algo mudou.
    if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
      saveConnections(migrated);
    }

    return migrated;
  } catch (err) {
    console.error('Erro ao carregar conexões:', err);
    return [];
  }
}

function saveConnections(connections) {
  try {
    const filePath = getConnectionsPath();
    fs.writeFileSync(filePath, JSON.stringify(connections, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar conexões:', err);
  }
}

module.exports = { loadConnections, saveConnections, getConnectionsPath };