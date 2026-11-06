const addButton = document.getElementById("addClientBtn");
const addDialog = document.getElementById("addClientDialog");
const addForm = document.getElementById("addClientForm");
const clientList = document.getElementById("clientList");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortClients");
const totalDebt = document.getElementById("totalDebt");
const profileDialog = document.getElementById("clientProfileDialog");
const purchaseForm = document.getElementById("purchaseForm");
const paymentForm = document.getElementById("paymentForm");
const amountFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

let clients = [];
let activeClientId = null;

function formatAmount(amount) {
  return `${amountFormatter.format(amount)} DA`;
}

function showError(error) {
  console.error(error);
  window.alert(error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.");
}

function renderClients() {
  const query = searchInput.value.trim().toLocaleLowerCase("fr");
  const direction = sortSelect.value === "asc" ? 1 : -1;
  const visibleClients = clients
    .filter((client) => `${client.name} ${client.phone}`.toLocaleLowerCase("fr").includes(query))
    .sort((a, b) => direction * (a.debt - b.debt) || a.name.localeCompare(b.name, "fr"));

  totalDebt.textContent = formatAmount(
    clients.reduce((sum, client) => sum + client.debt, 0)
  );
  clientList.replaceChildren();

  if (visibleClients.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = query ? "Aucun client ne correspond à la recherche." : "Aucun client pour le moment. Ajoutez votre premier client.";
    clientList.append(emptyState);
    return;
  }

  for (const client of visibleClients) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `client-card${client.debt > 0 ? " has-debt" : " debt-clear"}`;
    card.setAttribute("aria-label", `Ouvrir le profil de ${client.name}, dette de ${formatAmount(client.debt)}`);
    card.addEventListener("click", () => openProfile(client.id));

    const details = document.createElement("span");
    details.className = "card-details";
    const name = document.createElement("strong");
    name.className = "card-name";
    name.textContent = client.name;
    const phone = document.createElement("span");
    phone.className = "card-phone";
    phone.textContent = client.phone || "Téléphone non renseigné";
    details.append(name, phone);

    const debt = document.createElement("span");
    debt.className = "card-debt";
    const debtLabel = document.createElement("span");
    debtLabel.textContent = "Dette restante";
    const debtAmount = document.createElement("strong");
    debtAmount.textContent = formatAmount(client.debt);
    debt.append(debtLabel, debtAmount);
    card.append(details, debt);
    clientList.append(card);
  }
}

function openProfile(clientId) {
  const client = clients.find((item) => item.id === clientId);
  if (!client) return;

  activeClientId = clientId;
  document.getElementById("profileName").textContent = client.name;
  document.getElementById("profilePhone").textContent = client.phone || "Aucun numéro renseigné";
  const profileDebt = document.getElementById("profileDebt");
  profileDebt.textContent = formatAmount(client.debt);
  profileDebt.className = client.debt > 0 ? "debt-value has-debt-text" : "debt-value debt-clear-text";
  document.getElementById("paymentAmount").max = String(client.debt);
  purchaseForm.reset();
  paymentForm.reset();
  profileDialog.showModal();
}

async function refreshClients() {
  clients = await getClients();
  renderClients();
  if (activeClientId && profileDialog.open) {
    const updatedClient = clients.find((client) => client.id === activeClientId);
    if (updatedClient) openProfile(updatedClient.id);
  }
}

addButton.addEventListener("click", () => addDialog.showModal());

document.getElementById("cancelBtn").addEventListener("click", () => addDialog.close());
document.getElementById("closeProfileBtn").addEventListener("click", () => profileDialog.close());
profileDialog.addEventListener("close", () => {
  activeClientId = null;
});

searchInput.addEventListener("input", renderClients);
sortSelect.addEventListener("change", renderClients);

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("clientName").value.trim();
  const phone = document.getElementById("clientPhone").value.trim();
  if (!name) return;

  try {
    await addClient({ name, phone });
    addForm.reset();
    addDialog.close();
    await refreshClients();
  } catch (error) {
    showError(error);
  }
});

async function submitTransaction(event, type, inputId) {
  event.preventDefault();
  const amountInput = document.getElementById(inputId);
  const amount = Math.round(Number(amountInput.value) * 100) / 100;
  if (!activeClientId || !Number.isFinite(amount) || amount <= 0) {
    showError(new Error("Saisissez un montant valide supérieur à zéro."));
    return;
  }

  try {
    await recordClientTransaction(activeClientId, type, amount);
    await refreshClients();
  } catch (error) {
    showError(error);
  }
}

purchaseForm.addEventListener("submit", (event) => submitTransaction(event, "purchase", "purchaseAmount"));
paymentForm.addEventListener("submit", (event) => submitTransaction(event, "payment", "paymentAmount"));

refreshClients().catch(showError);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Impossible d’enregistrer le service worker.", error);
    });
  });
}
