var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
var _a = require('electron'), app = _a.app, BrowserWindow = _a.BrowserWindow, ipcMain = _a.ipcMain, Tray = _a.Tray, Menu = _a.Menu, nativeImage = _a.nativeImage;
var path = require('path');
var fs = require('fs');
var _b = require('./utils/commands'), startTunnel = _b.startTunnel, terminateTunnel = _b.terminateTunnel;
var _c = require('./utils/storage'), loadConnections = _c.loadConnections, saveConnections = _c.saveConnections;
var _d = require('./utils/aws'), listProfiles = _d.listProfiles, login = _d.login;
var mainWindow;
var tray = null;
var processes = {};
function createTray() {
    var iconPath = path.join(__dirname, 'assets/icon.png');
    var image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
        image = image.resize({ width: 16, height: 16 });
    }
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    tray.setToolTip('Gerenciador de Conexões AWS');
    var contextMenu = Menu.buildFromTemplate([
        { label: 'Abrir', click: function () { return mainWindow.show(); } },
        { type: 'separator' },
        {
            label: 'Sair',
            click: function () {
                app.isQuitting = true;
                app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', function () {
        if (mainWindow.isVisible())
            mainWindow.hide();
        else
            mainWindow.show();
    });
}
app.whenReady().then(function () {
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
    mainWindow.on('close', function (event) {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
    ipcMain.on('request-connections', function (event) {
        try {
            var connections = loadConnections();
            event.sender.send('load-connections', connections);
        }
        catch (err) {
            console.error('Erro ao enviar conexões:', err);
            event.sender.send('load-connections', []);
        }
    });
});
// Garante o encerramento dos túneis ativos ao sair de verdade.
app.on('before-quit', function () {
    app.isQuitting = true;
    Object.keys(processes).forEach(function (id) {
        try {
            processes[id].process.kill();
        }
        catch (e) {
            /* ignore */
        }
    });
});
ipcMain.handle('list-profiles', function () { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        try {
            return [2 /*return*/, listProfiles()];
        }
        catch (err) {
            console.error('Erro ao listar profiles:', err);
            return [2 /*return*/, []];
        }
        return [2 /*return*/];
    });
}); });
ipcMain.handle('aws-login', function () { return __awaiter(_this, void 0, void 0, function () {
    var log, connections, profiles, errors, _i, profiles_1, profile, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                log = function (message) { return mainWindow.webContents.send('app-log', { message: message }); };
                connections = [];
                try {
                    connections = loadConnections();
                }
                catch (e) {
                    /* ignore */
                }
                profiles = Array.from(new Set(connections.map(function (c) { return c.profile; }).filter(Boolean)));
                if (profiles.length === 0) {
                    return [2 /*return*/, { success: false, message: 'Nenhuma conexão/profile configurado.' }];
                }
                errors = [];
                _i = 0, profiles_1 = profiles;
                _a.label = 1;
            case 1:
                if (!(_i < profiles_1.length)) return [3 /*break*/, 6];
                profile = profiles_1[_i];
                _a.label = 2;
            case 2:
                _a.trys.push([2, 4, , 5]);
                log("Autenticando profile \"".concat(profile, "\"..."));
                return [4 /*yield*/, login(profile, log)];
            case 3:
                _a.sent();
                return [3 /*break*/, 5];
            case 4:
                error_1 = _a.sent();
                errors.push("".concat(profile, ": ").concat(error_1.message));
                log("Falha no login do profile \"".concat(profile, "\": ").concat(error_1.message));
                return [3 /*break*/, 5];
            case 5:
                _i++;
                return [3 /*break*/, 1];
            case 6:
                if (errors.length) {
                    return [2 /*return*/, { success: false, message: errors.join('\n') }];
                }
                log('Login AWS concluído.');
                return [2 /*return*/, { success: true, message: 'Login AWS concluído.' }];
        }
    });
}); });
ipcMain.handle('connect-to-db', function (event, dbConfig) { return __awaiter(_this, void 0, void 0, function () {
    var id, name, log, tunnel, process_1, sessionId_1, region_1, credentials_1, closedByError_1, closeOnError_1, error_2;
    var _this = this;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = dbConfig.id, name = dbConfig.name;
                if (processes[id]) {
                    try {
                        processes[id].process.kill();
                    }
                    catch (e) { }
                    delete processes[id];
                }
                log = function (message) { return mainWindow.webContents.send('db-log', { id: id, name: name, message: message }); };
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, startTunnel(dbConfig, log)];
            case 2:
                tunnel = _a.sent();
                process_1 = tunnel.process, sessionId_1 = tunnel.sessionId, region_1 = tunnel.region, credentials_1 = tunnel.credentials;
                processes[id] = { process: process_1, sessionId: sessionId_1, region: region_1, credentials: credentials_1 };
                closedByError_1 = false;
                closeOnError_1 = function (reason) { return __awaiter(_this, void 0, void 0, function () {
                    var e_1;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (closedByError_1)
                                    return [2 /*return*/];
                                closedByError_1 = true;
                                log("Encerrando conex\u00E3o devido a erro: ".concat(reason));
                                try {
                                    process_1.kill();
                                }
                                catch (e) { }
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, terminateTunnel({ sessionId: sessionId_1, region: region_1, credentials: credentials_1 })];
                            case 2:
                                _a.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                e_1 = _a.sent();
                                console.error("Erro ao encerrar sess\u00E3o ".concat(name, ": ").concat(e_1.message));
                                return [3 /*break*/, 4];
                            case 4:
                                delete processes[id];
                                mainWindow.webContents.send('db-status', { id: id, name: name, status: 'erro' });
                                return [2 /*return*/];
                        }
                    });
                }); };
                process_1.stdout.on('data', function (data) {
                    log(data.toString());
                });
                process_1.stderr.on('data', function (data) {
                    var errorMsg = data.toString();
                    log("Erro: ".concat(errorMsg));
                    closeOnError_1(errorMsg);
                });
                process_1.on('error', function (err) {
                    closeOnError_1(err.code === 'ENOENT'
                        ? 'session-manager-plugin não encontrado no PATH.'
                        : err.message);
                });
                process_1.on('close', function (code) {
                    var status = closedByError_1 || (code !== 0 && code !== null) ? 'erro' : 'desconectado';
                    delete processes[id];
                    mainWindow.webContents.send('db-status', { id: id, name: name, status: status });
                });
                mainWindow.webContents.send('db-status', { id: id, name: name, status: 'conectado' });
                return [2 /*return*/, { success: true, message: 'Conexão iniciada' }];
            case 3:
                error_2 = _a.sent();
                console.error("Erro ao conectar ".concat(name, ": ").concat(error_2.message));
                if (processes[id]) {
                    try {
                        processes[id].process.kill();
                    }
                    catch (e) { }
                    delete processes[id];
                }
                mainWindow.webContents.send('db-status', { id: id, name: name, status: 'erro' });
                return [2 /*return*/, { success: false, message: error_2.message }];
            case 4: return [2 /*return*/];
        }
    });
}); });
ipcMain.handle('disconnect-db', function (event_1, _a) { return __awaiter(_this, [event_1, _a], void 0, function (event, _b) {
    var entry, error_3;
    var id = _b.id;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                entry = processes[id];
                if (!entry) {
                    return [2 /*return*/, { success: false, message: 'Nenhuma conexão ativa encontrada' }];
                }
                // Encerrar o processo local já fecha o WebSocket e derruba o túnel.
                try {
                    entry.process.kill();
                }
                catch (e) { }
                _c.label = 1;
            case 1:
                _c.trys.push([1, 3, , 4]);
                return [4 /*yield*/, terminateTunnel({
                        sessionId: entry.sessionId,
                        region: entry.region,
                        credentials: entry.credentials,
                    })];
            case 2:
                _c.sent();
                return [3 /*break*/, 4];
            case 3:
                error_3 = _c.sent();
                console.warn("Sess\u00E3o encerrada localmente; TerminateSession falhou: ".concat(error_3.message));
                return [3 /*break*/, 4];
            case 4:
                delete processes[id];
                mainWindow.webContents.send('db-status', { id: id, status: 'desconectado' });
                return [2 /*return*/, { success: true, message: 'Sessão encerrada' }];
        }
    });
}); });
ipcMain.on('save-connections', function (event, connections) {
    saveConnections(connections);
    mainWindow.webContents.send('load-connections', connections);
});
//# sourceMappingURL=index.js.map