const DEFAULT_API_URL =
  "https://infrahub-monitor-api.vercel.app";

async function load() {
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

document.querySelector("#save").addEventListener("click", save);
load();
