const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { startTunnel, terminateTunnel } = require('./utils/commands');
const { loadConnections, saveConnections } = require('./utils/storage');
const { listProfiles, login } = require('./utils/aws');

let mainWindow;
let tray = null;
const processes = {};

function createTray() {
  const iconPath = path.join(__dirname, 'assets/icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) {
    image = image.resize({ width: 16, height: 16 });
  }

  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Gerenciador de Conexões AWS');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  createTray();

  // Fechar a janela (X) apenas esconde para a bandeja; sair só pelo menu da bandeja.
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  ipcMain.on('request-connections', (event) => {
    try {
      const connections = loadConnections();
      event.sender.send('load-connections', connections);
    } catch (err) {
      console.error('Erro ao enviar conexões:', err);
      event.sender.send('load-connections', []);
    }
  });
});

// Garante o encerramento dos túneis ativos ao sair de verdade.
app.on('before-quit', () => {
  app.isQuitting = true;
  Object.keys(processes).forEach((id) => {
    try {
      processes[id].process.kill();
    } catch (e) {
      /* ignore */
    }
  });
});

ipcMain.handle('list-profiles', async () => {
  try {
    return listProfiles();
  } catch (err) {
    console.error('Erro ao listar profiles:', err);
    return [];
  }
});

ipcMain.handle('aws-login', async () => {
  const log = (message) => mainWindow.webContents.send('app-log', { message });

  let connections = [];
  try {
    connections = loadConnections();
  } catch (e) {
    /* ignore */
  }

  const profiles = Array.from(new Set(connections.map((c) => c.profile).filter(Boolean)));

  if (profiles.length === 0) {
    return { success: false, message: 'Nenhuma conexão/profile configurado.' };
  }

  const errors = [];
  for (const profile of profiles) {
    try {
      log(`Autenticando profile "${profile}"...`);
      await login(profile, log);
    } catch (error) {
      errors.push(`${profile}: ${error.message}`);
      log(`Falha no login do profile "${profile}": ${error.message}`);
    }
  }

  if (errors.length) {
    return { success: false, message: errors.join('\n') };
  }

  log('Login AWS concluído.');
  return { success: true, message: 'Login AWS concluído.' };
});

ipcMain.handle('connect-to-db', async (event, dbConfig) => {
  const { id, name } = dbConfig;

  if (processes[id]) {
    try { processes[id].process.kill(); } catch (e) {}
    delete processes[id];
  }

  const log = (message) => mainWindow.webContents.send('db-log', { id, name, message });

  try {
    const tunnel = await startTunnel(dbConfig, log);
    const { process, sessionId, region, credentials } = tunnel;

    processes[id] = { process, sessionId, region, credentials };

    let closedByError = false;

    const closeOnError = async (reason) => {
      if (closedByError) return;
      closedByError = true;
      log(`Encerrando conexão devido a erro: ${reason}`);
      try { process.kill(); } catch (e) {}
      try {
        await terminateTunnel({ sessionId, region, credentials });
      } catch (e) {
        console.error(`Erro ao encerrar sessão ${name}: ${e.message}`);
      }
      delete processes[id];
      mainWindow.webContents.send('db-status', { id, name, status: 'erro' });
    };

    process.stdout.on('data', (data) => {
      log(data.toString());
    });

    process.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      log(`Erro: ${errorMsg}`);
      closeOnError(errorMsg);
    });

    process.on('error', (err) => {
      closeOnError(
        err.code === 'ENOENT'
          ? 'session-manager-plugin não encontrado no PATH.'
          : err.message
      );
    });

    process.on('close', (code) => {
      const status = closedByError || (code !== 0 && code !== null) ? 'erro' : 'desconectado';
      delete processes[id];
      mainWindow.webContents.send('db-status', { id, name, status });
    });

    mainWindow.webContents.send('db-status', { id, name, status: 'conectado' });

    return { success: true, message: 'Conexão iniciada' };
  } catch (error) {
    console.error(`Erro ao conectar ${name}: ${error.message}`);
    if (processes[id]) {
      try { processes[id].process.kill(); } catch (e) {}
      delete processes[id];
    }
    mainWindow.webContents.send('db-status', { id, name, status: 'erro' });
    return { success: false, message: error.message };
  }
});

ipcMain.handle('disconnect-db', async (event, { id }) => {
  const entry = processes[id];
  if (!entry) {
    return { success: false, message: 'Nenhuma conexão ativa encontrada' };
  }

  // Encerrar o processo local já fecha o WebSocket e derruba o túnel.
  try { entry.process.kill(); } catch (e) {}

  // TerminateSession é best-effort: alguns perfis não têm a permissão
  // ssm:TerminateSession, mas a sessão já foi encerrada localmente.
  try {
    await terminateTunnel({
      sessionId: entry.sessionId,
      region: entry.region,
      credentials: entry.credentials,
    });
  } catch (error) {
    console.warn(`Sessão encerrada localmente; TerminateSession falhou: ${error.message}`);
  }

  delete processes[id];
  mainWindow.webContents.send('db-status', { id, status: 'desconectado' });
  return { success: true, message: 'Sessão encerrada' };
});

ipcMain.on('save-connections', (event, connections) => {
  saveConnections(connections);
  mainWindow.webContents.send('load-connections', connections);
});
