const { ipcRenderer } = require("electron");

let dbList = [];
let editIndex = null;

const dbListContainer = document.getElementById("db-list");
const dbForm = document.getElementById("db-form");
const formTitle = document.getElementById("form-title");

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function novaConexao() {
  editIndex = null;
  abrirTela("nova");
  dbForm.reset();
  formTitle.textContent = "Nova Conexão";
}

ipcRenderer.send("request-connections");

ipcRenderer.on("load-connections", (event, connections) => {
  dbList = connections;
  renderDbList();
});

function abrirTela(nome) {
  document.querySelectorAll(".tela").forEach((t) => (t.style.display = "none"));
  document.getElementById(`tela-${nome}`).style.display = "block";
}

function renderDbList() {
  dbListContainer.innerHTML = "";

  dbList.forEach((db, index) => {
    const dbBlock = document.createElement("div");
    dbBlock.className = "db-block";

    const dbItem = document.createElement("div");
    dbItem.className = "db-item";
    dbItem.innerHTML = `
      <span>${db.name}</span>
      <span id="status-${db.id}">Status: Desconectado</span>
      <button id="connect-btn-${db.id}" data-id="${db.id}">Conectar</button>
      <button id="disconnect-btn-${db.id}" data-id="${db.id}" disabled>Desconectar</button>
      <button id="edit-btn-${db.id}" data-id="${db.id}">✏️</button>
      <button id="remove-btn-${db.id}" data-id="${db.id}">🗑️</button>
    `;

    const dbLog = document.createElement("div");
    dbLog.className = "db-log";
    dbLog.innerHTML = `<div id="log-${db.id}" class="log"></div>`;

    dbBlock.appendChild(dbItem);
    dbBlock.appendChild(dbLog);
    dbListContainer.appendChild(dbBlock);
  });
}

dbListContainer.addEventListener("click", async (event) => {
  const target = event.target;
  const id = target.dataset.id;
  const profile = target.dataset.profile;
  if (!id) return;

  const index = dbList.findIndex((db) => db.id === id);
  if (index === -1) return;

  if (target.id.startsWith("connect-btn")) {
    const connectBtn = document.getElementById(`connect-btn-${id}`);
    const disconnectBtn = document.getElementById(`disconnect-btn-${id}`);

    connectBtn.disabled = true;
    connectBtn.textContent = "Conectando...";

    const dbConfig = dbList[index];
    const result = await ipcRenderer.invoke("connect-to-db", dbConfig);

    if (result.success) {
      connectBtn.textContent = "Conectado";
      disconnectBtn.disabled = false;
    } else {
      connectBtn.disabled = false;
      connectBtn.textContent = "Conectar";
      alert(`Erro ao conectar: ${result.message}`);
    }
  } else if (target.id.startsWith("disconnect-btn")) {
    const connectBtn = document.getElementById(`connect-btn-${id}`);
    const disconnectBtn = document.getElementById(`disconnect-btn-${id}`);

    disconnectBtn.disabled = true;
    disconnectBtn.textContent = "Desconectando...";

    const result = await ipcRenderer.invoke("disconnect-db", { id, profile: dbList[index].profile, });

    if (result.success) {
      connectBtn.disabled = false;
      connectBtn.textContent = "Conectar";
      disconnectBtn.textContent = "Desconectar";
    } else {
      disconnectBtn.disabled = false;
      disconnectBtn.textContent = "Desconectar";
      alert(`Erro ao desconectar: ${result.message}`);
    }
  } else if (target.id.startsWith("edit-btn")) {
    editIndex = index;
    formTitle.textContent = "Editar Conexão";
    abrirTela("nova");
    const db = dbList[index];
    for (const [key, value] of Object.entries(db)) {
      const input = dbForm.elements[key];
      if (input) input.value = value;
    }
  } else if (target.id.startsWith("remove-btn")) {
    dbList.splice(index, 1);
    ipcRenderer.send("save-connections", dbList);
    renderDbList();
  }
});

dbForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (editIndex === null) {
    const newDb = {
      id: generateId(),
      name: dbForm.name.value,
      instanceId: dbForm.instanceId.value,
      host: dbForm.host.value,
      port: parseInt(dbForm.port.value, 10),
      localPort: parseInt(dbForm.localPort.value, 10),
      profile: dbForm.profile.value,
    };
    dbList.push(newDb);
  } else {
    dbList[editIndex] = {
      id: dbList[editIndex].id,
      name: dbForm.name.value,
      instanceId: dbForm.instanceId.value,
      host: dbForm.host.value,
      port: parseInt(dbForm.port.value, 10),
      localPort: parseInt(dbForm.localPort.value, 10),
      profile: dbForm.profile.value,
    };
  }

  ipcRenderer.send("save-connections", dbList);
  renderDbList();
  dbForm.reset();
  formTitle.textContent = "Nova Conexão";
  editIndex = null;
  abrirTela("home");
});

ipcRenderer.on("db-status", (event, { id, status }) => {
  const el = document.getElementById(`status-${id}`);
  if (el) el.textContent = `Status: ${status}`;
});

ipcRenderer.on("db-log", (event, { id, message }) => {
  const el = document.getElementById(`log-${id}`);
  if (el) {
    const div = document.createElement("div");
    div.textContent = message;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
});
