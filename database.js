const CLIENT_DATABASE_NAME = "bmb-client-manager";
const CLIENT_DATABASE_VERSION = 1;
const CLIENT_STORE_NAME = "clients";

function openClientDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Ce navigateur ne prend pas en charge le stockage local IndexedDB."));
      return;
    }

    const request = window.indexedDB.open(CLIENT_DATABASE_NAME, CLIENT_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CLIENT_STORE_NAME)) {
        database.createObjectStore(CLIENT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Impossible d’ouvrir la base de données."));
  });
}

function createClientId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getClients() {
  const database = await openClientDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CLIENT_STORE_NAME, "readonly");
    const request = transaction.objectStore(CLIENT_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Impossible de charger les clients."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Impossible de lire la base de données."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("La lecture de la base de données a été interrompue."));
    };
  });
}

async function addClient(client) {
  const database = await openClientDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CLIENT_STORE_NAME, "readwrite");
    transaction.objectStore(CLIENT_STORE_NAME).add({
      ...client,
      id: createClientId(),
      debt: 0,
      transactions: [],
      createdAt: new Date().toISOString()
    });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Impossible d’enregistrer le client."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("L’enregistrement du client a été interrompu."));
    };
  });
}

async function updateClient(clientId, updates) {
  const name = updates.name.trim();
  const phone = updates.phone.trim();
  if (!name) {
    throw new Error("Le nom du client est obligatoire.");
  }

  const database = await openClientDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CLIENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CLIENT_STORE_NAME);
    const request = store.get(clientId);
    let failure;

    request.onsuccess = () => {
      const client = request.result;
      if (!client) {
        failure = new Error("Le profil sélectionné n’existe plus.");
        transaction.abort();
        return;
      }

      client.name = name;
      client.phone = phone;
      store.put(client);
    };

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Impossible de modifier le profil."));
    };
    transaction.onabort = () => {
      database.close();
      reject(failure ?? transaction.error ?? new Error("La modification du profil a été interrompue."));
    };
  });
}

async function deleteClient(clientId) {
  const database = await openClientDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CLIENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CLIENT_STORE_NAME);
    const request = store.get(clientId);
    let failure;

    request.onsuccess = () => {
      if (!request.result) {
        failure = new Error("Le profil sélectionné n’existe plus.");
        transaction.abort();
        return;
      }

      store.delete(clientId);
    };

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Impossible de supprimer le profil."));
    };
    transaction.onabort = () => {
      database.close();
      reject(failure ?? transaction.error ?? new Error("La suppression du profil a été interrompue."));
    };
  });
}

async function recordClientTransaction(clientId, type, amount) {
  if (!["purchase", "payment"].includes(type) || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("La transaction saisie est invalide.");
  }

  const database = await openClientDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CLIENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CLIENT_STORE_NAME);
    const request = store.get(clientId);

    request.onsuccess = () => {
      const client = request.result;
      if (!client) {
        transaction.abort();
        return;
      }

      if (type === "payment" && amount > client.debt) {
        transaction.abort();
        reject(new Error("Le paiement ne peut pas dépasser la dette restante."));
        return;
      }

      client.debt = Math.round(
        (type === "purchase" ? client.debt + amount : client.debt - amount) * 100
      ) / 100;
      if (client.debt < 0.005) client.debt = 0;
      client.transactions.push({ type, amount, createdAt: new Date().toISOString() });
      store.put(client);
    };

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Impossible d’enregistrer la transaction."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Le client sélectionné n’existe plus."));
    };
  });
}