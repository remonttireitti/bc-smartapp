/**
 * Maps Firestore quote documents to the current QuoteRequestData shape.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedPumpDevices = null;

function loadPumpDevices() {
  if (cachedPumpDevices) return cachedPumpDevices;
  const src = readFileSync(resolve(__dirname, '../../src/data/pumpDeviceCatalog.ts'), 'utf8');
  const devices = [];
  for (const block of src.split(/\n\s*\{/).slice(1)) {
    const id = block.match(/id:\s*'([^']+)'/)?.[1];
    const model = block.match(/model:\s*'([^']+)'/)?.[1];
    const category = block.match(/category:\s*'([^']+)'/)?.[1] ?? '';
    if (id && model) devices.push({ id, model, category });
  }
  cachedPumpDevices = devices;
  return devices;
}

function normalizeModelHint(hint) {
  return String(hint).trim().toLowerCase().replace(/\s+/g, ' ');
}

function devicesForQuoteType(type) {
  const all = loadPumpDevices();
  if (type === 'ilma-ilma') return all.filter((d) => d.category === 'ilmalampopumppu');
  if (type === 'vesi-ilma') return all.filter((d) => d.category === 'vesi-ilmalampopumppu');
  return all;
}

export function findDeviceByModelHint(modelHint, type) {
  const hint = normalizeModelHint(modelHint);
  if (!hint) return null;

  const pool = devicesForQuoteType(type);
  const byId = pool.find((device) => device.id.toLowerCase() === hint);
  if (byId) return byId;

  const exact = pool.find((device) => normalizeModelHint(device.model) === hint);
  if (exact) return exact;

  const contains = pool.filter((device) => {
    const model = normalizeModelHint(device.model);
    return hint.includes(model) || model.includes(hint);
  });
  if (contains.length === 1) return contains[0];

  const primary = hint.split('+')[0]?.trim() ?? hint;
  const primaryMatches = pool.filter((device) => {
    const model = normalizeModelHint(device.model);
    const devicePrimary = model.split('+')[0]?.trim() ?? model;
    return devicePrimary === primary || primary.includes(devicePrimary) || devicePrimary.includes(primary);
  });
  if (primaryMatches.length === 1) return primaryMatches[0];

  const tokens = hint.split(/\s+|\+/).map((token) => token.trim()).filter((token) => token.length >= 4);
  const tokenMatches = pool.filter((device) => {
    const model = normalizeModelHint(device.model);
    return tokens.some((token) => model.includes(token));
  });
  if (tokenMatches.length === 1) return tokenMatches[0];

  if (tokenMatches.length > 1) {
    const scored = tokenMatches
      .map((device) => {
        const model = normalizeModelHint(device.model);
        const score = tokens.reduce((sum, token) => (model.includes(token) ? sum + token.length : sum), 0);
        return { device, score };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0]?.score > 0 && scored[0].score !== scored[1]?.score) return scored[0].device;
  }

  return null;
}

function resolveLegacyDeviceId(currentId, modelHint, type) {
  const pool = devicesForQuoteType(type);
  if (currentId && pool.some((device) => device.id === currentId)) return currentId;
  if (typeof modelHint === 'string' && modelHint.trim()) {
    const match = findDeviceByModelHint(modelHint, type);
    if (match) return match.id;
  }
  return currentId && pool.some((device) => device.id === currentId) ? currentId : '';
}

export function resolveLegacyDeviceIds(record, type) {
  const modelHint = typeof record.deviceModel === 'string' ? record.deviceModel : undefined;
  return {
    selectedDeviceId: resolveLegacyDeviceId(record.selectedDeviceId ?? '', modelHint, type),
    altDevice1Id: resolveLegacyDeviceId(record.altDevice1Id ?? '', undefined, type),
    altDevice2Id: resolveLegacyDeviceId(record.altDevice2Id ?? '', undefined, type),
  };
}

export function applyLegacyQuoteFields(raw, meta = {}) {
  const source = { ...meta, ...raw };
  const out = { ...raw };

  if (!out.selectedDeviceId && typeof source.deviceId === 'string' && source.deviceId.trim()) {
    out.selectedDeviceId = source.deviceId.trim();
  }

  if (!out.validUntil) {
    if (typeof source.offerValidUntil === 'string' && source.offerValidUntil.trim()) {
      out.validUntil = source.offerValidUntil.slice(0, 10);
    } else if (typeof source.date === 'string' && source.date.trim()) {
      out.validUntil = source.date.slice(0, 10);
    }
  }

  const deviceOptions = source.deviceOptions;
  if (Array.isArray(deviceOptions) && deviceOptions.length > 0) {
    deviceOptions.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const id =
        typeof entry.deviceId === 'string'
          ? entry.deviceId
          : typeof entry.id === 'string'
            ? entry.id
            : '';
      if (!id) return;
      if (index === 0 && !out.selectedDeviceId) out.selectedDeviceId = id;
      if (index === 1 && !out.altDevice1Id) out.altDevice1Id = id;
      if (index === 2 && !out.altDevice2Id) out.altDevice2Id = id;
    });
  }

  if (typeof source.customerName === 'string' && source.customerName.trim()) {
    out.legacyCustomerName = source.customerName.trim();
  }

  if (!out.customerPhone && typeof source.customerPhone === 'string') {
    out.customerPhone = source.customerPhone;
  }
  if (!out.customerEmail && typeof source.customerEmail === 'string') {
    out.customerEmail = source.customerEmail;
  }

  if (!out.deviceModel && typeof source.deviceName === 'string' && source.deviceName.trim()) {
    out.deviceModel = source.deviceName.trim();
  }

  if (!out.notes && typeof source.situationReportText === 'string' && source.situationReportText.trim()) {
    out.notes = source.situationReportText.trim();
  }

  if (!out.vilpBrandChoice && typeof source.deviceBrand === 'string') {
    const brand = source.deviceBrand.trim();
    if (brand === 'Daikin' || brand === 'Inventor' || brand === 'Samsung') {
      out.vilpBrandChoice = brand;
    }
  }

  return out;
}

export function firestoreQuoteCustomerId(data) {
  return String(data.customerRegistryId || data.customerId || '').trim();
}

export function quoteTitleFromFirestore(data) {
  const customerName = String(data.customerName || '').trim();
  const type = String(data.type || '').trim();
  if (customerName && type) return `${customerName} – ${type}`;
  return customerName || type || 'Tarjous';
}
