import { randomUUID } from 'node:crypto';
import { cities, domains, firstNames, lastNames, streetNames, streetSuffixes } from './dictionaries.js';

const SUPPORTED_TYPES = new Set(['name', 'email', 'date', 'number', 'address', 'uuid']);

/**
 * @param {readonly unknown[]} array
 */
function getRandomElement(array) {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error('getRandomElement: array must be a non-empty array.');
  }
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildEmailLocalPartFromFullName(fullName) {
  const normalized = fullName.trim().toLowerCase();
  const parts = normalized.split(/\s+/).filter(Boolean);

  let base;
  if (parts.length >= 2) {
    base = `${parts[0]}.${parts[parts.length - 1]}`;
  } else if (parts.length === 1) {
    base = parts[0];
  } else {
    base = 'user';
  }

  return base.replace(/[^a-z0-9.]/g, '');
}

/**
 * Custom zero-dependency fake data generator (Faker.js replacement).
 */
export const fakeGenerator = {
  name() {
    return `${getRandomElement(firstNames)} ${getRandomElement(lastNames)}`;
  },

  /**
   * @param {string | undefined} fullName
   */
  email(fullName) {
    const sourceName =
      typeof fullName === 'string' && fullName.trim().length > 0 ? fullName : this.name();
    const local = buildEmailLocalPartFromFullName(sourceName);
    const num = randomIntInclusive(1, 9999);
    const domain = getRandomElement(domains);
    return `${local}${num}@${domain}`;
  },

  date() {
    const now = Date.now();
    const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;
    const minAgo = 1 * oneYearMs;
    const maxAgo = 5 * oneYearMs;
    const offsetMs = minAgo + Math.random() * (maxAgo - minAgo);
    const ts = now - offsetMs;
    return new Date(ts).toISOString();
  },

  number() {
    return Math.floor(Math.random() * 1000) + 1;
  },

  address() {
    const number = randomIntInclusive(1, 999);
    const street = getRandomElement(streetNames);
    const suffix = getRandomElement(streetSuffixes);
    const city = getRandomElement(cities);
    const zip = randomIntInclusive(10000, 99999);
    return `${number} ${street} ${suffix}, ${city}, ${zip}`;
  },

  uuid() {
    return randomUUID();
  },
};

export function validateSchema(schema) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Schema must be a JSON object with string keys and supported type values.');
  }

  for (const [key, type] of Object.entries(schema)) {
    if (typeof type !== 'string' || !SUPPORTED_TYPES.has(type)) {
      throw new Error(
        `Unknown or invalid field type for "${key}": ${JSON.stringify(type)}. Supported types: ${[...SUPPORTED_TYPES].join(', ')}.`
      );
    }
  }

  if (Object.keys(schema).length === 0) {
    throw new Error('Schema must define at least one field.');
  }
}

/**
 * @param {string} type
 * @param {string | null} lastFullNameForEmail
 */
function valueForSchemaType(type, lastFullNameForEmail) {
  switch (type) {
    case 'name':
      return fakeGenerator.name();
    case 'email':
      return fakeGenerator.email(lastFullNameForEmail ?? undefined);
    case 'date':
      return fakeGenerator.date();
    case 'number':
      return fakeGenerator.number();
    case 'address':
      return fakeGenerator.address();
    case 'uuid':
      return fakeGenerator.uuid();
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

/**
 * @param {Record<string, string>} schema
 * @param {number} count
 * @returns {Array<Record<string, unknown>>}
 */
export function generateRecords(schema, count) {
  const keys = Object.keys(schema);
  const records = [];

  for (let i = 0; i < count; i += 1) {
    const row = {};
    /** @type {string | null} */
    let lastFullName = null;

    for (const key of keys) {
      const type = schema[key];
      const value = valueForSchemaType(type, lastFullName);
      row[key] = value;
      if (type === 'name' && typeof value === 'string') {
        lastFullName = value;
      }
    }
    records.push(row);
  }

  return records;
}
