"use strict";

const DB_NAME = "nour-admin-backup";
const STORE_NAME = "snapshots";
const SCHEMA_VERSION = 3;
const ACTIVE_ADMIN_KEY = "__active_admin__";

function node(tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(2)} DH` : "—";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "indisponible"
    : new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function snapshotsForCurrentAdmin() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const values = await new Promise((resolve, reject) => {
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const active = values.find(value => value.key === ACTIVE_ADMIN_KEY && value.schemaVersion === SCHEMA_VERSION);
    if (!active || typeof active.scope !== "string") return [];
    return values.filter(value => value.scope === active.scope &&
      value.schemaVersion === SCHEMA_VERSION &&
      typeof value.savedAt === "string" &&
      !Number.isNaN(Date.parse(value.savedAt)) &&
      value.data && typeof value.data === "object");
  } finally {
    database.close();
  }
}

function appendTable(parent, headers, rows) {
  const wrapper = node("div");
  wrapper.className = "table-wrap";
  const table = node("table");
  const head = node("thead");
  const headerRow = node("tr");
  for (const header of headers) headerRow.append(node("th", header));
  head.append(headerRow);
  table.append(head);
  const body = node("tbody");
  for (const values of rows) {
    const row = node("tr");
    for (const value of values) row.append(node("td", value ?? ""));
    body.append(row);
  }
  table.append(body);
  wrapper.append(table);
  parent.append(wrapper);
}

function renderStudents(data, parent) {
  const students = Array.isArray(data.students) ? data.students : [];
  parent.append(node("h2", `Élèves (${students.length})`));
  appendTable(parent, ["Nom", "Code ID", "Téléphone", "Niveau et matières"], students.map(student => [
    student.fullName,
    student.codeId,
    student.phone || "—",
    Array.isArray(student.groups) ? student.groups.map(group => `${group.levelName} — ${group.name}`).join(", ") : "",
  ]));
}

function renderPayments(data, parent) {
  const students = Array.isArray(data.students) ? data.students : [];
  parent.append(node("h2", `Paiements — ${String(data.month).padStart(2, "0")}/${data.year}`));
  appendTable(parent, ["Nom", "Code ID", "Montant facturé", "Montant payé", "Statut"], students.map(student => [
    student.fullName,
    student.codeId,
    formatMoney(student.payment?.totalAmount ?? student.groups?.reduce((sum, group) => sum + Number(group.amount || 0), 0)),
    formatMoney(student.payment?.paidAmount ?? 0),
    student.payment?.status ?? "UNPAID",
  ]));
}

async function renderOfflineData() {
  const snapshots = await snapshotsForCurrentAdmin();
  const isPaymentsPage = location.pathname.startsWith("/admin/payments");
  const requestedMonth = new URLSearchParams(location.search).get("month");
  const candidates = snapshots
    .filter(entry => isPaymentsPage ? entry.key.includes(":payments:") : entry.key.endsWith(":students"))
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
  const requestedLevel = new URLSearchParams(location.search).get("level") || "all";
  const requestedKey = `:payments:${requestedMonth}:${requestedLevel}`;
  const selected = requestedMonth
    ? candidates.find(entry => entry.key.includes(requestedKey))
    : candidates[0];
  if (!selected) {
    document.getElementById("notice").hidden = false;
    document.getElementById("updated").textContent = "Dernière mise à jour : aucune sauvegarde disponible";
    return;
  }
  document.getElementById("updated").textContent = `Dernière mise à jour : ${formatDate(selected.savedAt)}`;
  const content = document.getElementById("content");
  if (isPaymentsPage) renderPayments(selected.data, content);
  else renderStudents(selected.data, content);
}

renderOfflineData().catch(() => {
  document.getElementById("notice").hidden = false;
  document.getElementById("updated").textContent = "Dernière mise à jour : sauvegarde locale indisponible";
});
