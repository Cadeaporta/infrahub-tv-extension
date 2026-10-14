async function load() {
  await loadLogs();
  const manifest = chrome.runtime.getManifest();
  const version = document.querySelector("#version");
  if (version) version.textContent = `Versão instalada: ${manifest.version}`;
  await syncIdentity();
}

async function syncIdentity() {
  const status = document.querySelector("#identityStatus");
  const details = document.querySelector("#identityDetails");
  status.textContent = "Consultando helper local...";
  details.textContent = "";
  try {
    const response = await chrome.runtime.sendMessage({ type: "INFRAHUB_SYNC_NATIVE_IDENTITY" });
    if (!response || !response.ok) {
      status.textContent = "Helper indisponível ou identidade ainda não provisionada.";
      details.textContent = response?.erro || "Confirme a instalação via Atera, o cadastro e se o navegador foi reiniciado.";
      return;
    }
    const identity = response.nativeIdentity || {};
    status.textContent = identity.statusAprovacao === "aprovada"
      ? "Identidade sincronizada; máquina aprovada."
      : `Identidade sincronizada; aprovação: ${identity.statusAprovacao || "pendente"}.`;
    details.textContent = [
      `Hostname: ${identity.hostname || "não informado"}`,
      `ID da máquina: ${response.maquinaId || "não informado"}`,
      `API: ${response.apiUrl || "não informada"}`,
      `UUID: ${identity.machineUuid || "não informado"}`,
      `Sincronizada em: ${identity.syncedAt || "não informado"}`
    ].join("\\n");
    details.style.whiteSpace = "pre-line";
  } catch (error) {
    status.textContent = "Não foi possível consultar o helper local.";
    details.textContent = String(error?.message || error);
  }
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

document.querySelector("#syncIdentity").addEventListener("click", syncIdentity);
document.querySelector("#refreshLogs").addEventListener("click", loadLogs);
document.querySelector("#exportLogs").addEventListener("click", exportLogs);
load();
