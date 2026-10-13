const DEFAULT_API_URL =
  "https://infrahub-monitor-api.vercel.app";

async function load() {
  await loadLogs();
  const manifest = chrome.runtime.getManifest();
  const version = document.querySelector("#version");
  if (version) version.textContent = `Versão instalada: ${manifest.version}`;
  const cfg = await chrome.storage.local.get({
    apiUrl: DEFAULT_API_URL,
    maquinaId: "",
    token: ""
  });

  document.querySelector("#apiUrl").value = cfg.apiUrl;
  document.querySelector("#maquinaId").value = cfg.maquinaId;
  document.querySelector("#token").value = cfg.token;
}

async function save() {
  const apiUrl = document.querySelector("#apiUrl").value.trim().replace(/\/+$/, "");
  const maquinaId = document.querySelector("#maquinaId").value.trim();
  const token = document.querySelector("#token").value.trim();
  const status = document.querySelector("#status");

  if (!apiUrl || !maquinaId || !token) {
    status.textContent = "Preencha os três campos.";
    return;
  }

  await chrome.storage.local.set({ apiUrl, maquinaId, token });
  status.textContent = "Configuração salva.";
}

async function loadLogs() {
  const field = document.querySelector("#logs");
  if (!field) return;
  const { diagnosticLogs = [] } = await chrome.storage.local.get({ diagnosticLogs: [] });
  const logs = Array.isArray(diagnosticLogs) ? diagnosticLogs : [];
  field.value = logs.slice(-100).reverse().map((event) => {
    const details = event.detalhes && Object.keys(event.detalhes).length
      ? " " + JSON.stringify(event.detalhes)
      : "";
    return `[${event.timestamp || "sem data"}] [${String(event.nivel || "info").toUpperCase()}] ${event.mensagem || ""}${details}`;
  }).join("\n") || "Nenhum evento registrado ainda.";
}

async function exportLogs() {
  const { diagnosticLogs = [] } = await chrome.storage.local.get({ diagnosticLogs: [] });
  const logs = Array.isArray(diagnosticLogs) ? diagnosticLogs : [];
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "infrahub-tv-logs.json";
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#save").addEventListener("click", save);
document.querySelector("#refreshLogs").addEventListener("click", loadLogs);
document.querySelector("#exportLogs").addEventListener("click", exportLogs);
load();
