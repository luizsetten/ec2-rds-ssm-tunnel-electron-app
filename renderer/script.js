const { ipcRenderer } = require("electron");

let dbList = [];
let editIndex = null;

const dbListContainer = document.getElementById("db-list");
const dbForm = document.getElementById("db-form");
const formTitle = document.getElementById("form-title");
const loginAwsBtn = document.getElementById("login-aws-btn");
const appLogEl = document.getElementById("app-log");

loginAwsBtn.addEventListener("click", async () => {
  loginAwsBtn.disabled = true;
  loginAwsBtn.textContent = "Autenticando...";
  if (appLogEl) appLogEl.textContent = "";

  const result = await ipcRenderer.invoke("aws-login");

  loginAwsBtn.disabled = false;
  loginAwsBtn.textContent = "🔑 Login AWS";

  if (!result.success) {
    alert(`Erro no login AWS:\n${result.message}`);
  }
});

ipcRenderer.on("app-log", (event, { message }) => {
  if (!appLogEl) return;
  const div = document.createElement("div");
  div.textContent = message;
  appLogEl.appendChild(div);
  while (appLogEl.childElementCount > 4) {
    appLogEl.removeChild(appLogEl.firstElementChild);
  }
  appLogEl.scrollTop = appLogEl.scrollHeight;
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Popula o <select name="profile"> com os profiles do ~/.aws/config.
async function carregarProfiles() {
  const select = dbForm.elements["profile"];
  if (!select) return;

  const atual = select.value;
  const profiles = await ipcRenderer.invoke("list-profiles");

  select.innerHTML =
    '<option value="" disabled selected>Selecione um AWS Profile</option>';

  profiles.forEach((profile) => {
    const opt = document.createElement("option");
    opt.value = profile;
    opt.textContent = profile;
    select.appendChild(opt);
  });

  if (atual) setProfileValue(atual);
}

// Seleciona um profile, adicionando uma opção caso ele não exista mais no config.
function setProfileValue(value) {
  const select = dbForm.elements["profile"];
  if (!select || !value) return;

  const existe = Array.from(select.options).some((o) => o.value === value);
  if (!existe) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = `${value} (não encontrado no config)`;
    select.appendChild(opt);
  }

  select.value = value;
}

carregarProfiles();

function novaConexao() {
  editIndex = null;
  abrirTela("nova");
  dbForm.reset();
  carregarProfiles();
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
      <span class="db-profile">Profile: ${db.profile || "—"}</span>
      <span id="status-${db.id}">Status: Desconectado</span>
      <button id="connect-btn-${db.id}" data-id="${db.id}">Conectar</button>
      <button id="disconnect-btn-${db.id}" data-id="${db.id}" disabled>Desconectar</button>
      <button id="edit-btn-${db.id}" class="btn-edit" data-id="${db.id}">✏️ Editar</button>
      <button id="remove-btn-${db.id}" class="btn-remove" data-id="${db.id}">🗑️ Excluir</button>
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
    await carregarProfiles();
    for (const [key, value] of Object.entries(db)) {
      if (key === "profile") {
        setProfileValue(value);
        continue;
      }
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
      remotePort: parseInt(dbForm.remotePort.value, 10),
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
      remotePort: parseInt(dbForm.remotePort.value, 10),
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

  const connectBtn = document.getElementById(`connect-btn-${id}`);
  const disconnectBtn = document.getElementById(`disconnect-btn-${id}`);
  if (!connectBtn || !disconnectBtn) return;

  if (status === "conectado") {
    connectBtn.disabled = true;
    connectBtn.textContent = "Conectado";
    disconnectBtn.disabled = false;
    disconnectBtn.textContent = "Desconectar";
  } else {
    // desconectado / erro: libera reconexão
    connectBtn.disabled = false;
    connectBtn.textContent = "Conectar";
    disconnectBtn.disabled = true;
    disconnectBtn.textContent = "Desconectar";

    if (status === "erro") {
      alert(`Conexão "${dbList.find((db) => db.id === id)?.name || id}" foi encerrada devido a um erro.`);
    }
  }
});

ipcRenderer.on("db-log", (event, { id, message }) => {
  const el = document.getElementById(`log-${id}`);
  if (el) {
    const div = document.createElement("div");
    div.textContent = message;
    el.appendChild(div);
    while (el.childElementCount > 4) {
      el.removeChild(el.firstElementChild);
    }
    el.scrollTop = el.scrollHeight;
  }
});
