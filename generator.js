import { randomUUID } from 'node:crypto';
import {
  cities,
  domains,
  firstNames,
  lastNames,
  loremWords,
  streetNames,
  streetSuffixes,
} from './dictionaries.js';

/** Maximum nesting depth for object / array (root depth = 0). */
export const MAX_SCHEMA_DEPTH = 5;

const LEAF_TYPES = new Set([
  'name',
  'email',
  'date',
  'number',
  'float',
  'boolean',
  'enum',
  'phone',
  'text',
  'address',
  'uuid',
  'template',
]);

const CONTAINER_TYPES = new Set(['object', 'array']);

const ALL_TYPES = new Set([...LEAF_TYPES, ...CONTAINER_TYPES]);

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
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
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
 * Shorthand string → `{ type }`; passes objects through (cloned shallowly).
 * @param {unknown} raw
 */
export function normalizeFieldConfig(raw) {
  if (typeof raw === 'string') {
    return { type: raw };
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = /** @type {Record<string, unknown>} */ (raw);
    if (typeof o.type !== 'string') {
      throw new Error('Field config object must include a string "type" property.');
    }
    return { ...o };
  }
  throw new Error(`Invalid field config: ${JSON.stringify(raw)}`);
}

/**
 * @param {unknown} schema
 * @returns {Record<string, Record<string, unknown>>}
 */
export function normalizeSchema(schema) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Schema must be a plain JSON object.');
  }
  /** @type {Record<string, Record<string, unknown>>} */
  const out = {};
  for (const [key, raw] of Object.entries(schema)) {
    out[key] = normalizeFieldConfig(raw);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} cfg
 * @param {string} path
 */
function validateFieldConfig(cfg, path) {
  const type = cfg.type;
  if (typeof type !== 'string' || !ALL_TYPES.has(type)) {
    throw new Error(
      `${path}: unknown type ${JSON.stringify(type)}. Supported: ${[...ALL_TYPES].sort().join(', ')}`
    );
  }

  switch (type) {
    case 'enum': {
      const values = cfg.values;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`${path}: enum requires non-empty "values" array.`);
      }
      break;
    }
    case 'template': {
      if (typeof cfg.format !== 'string' || cfg.format.length === 0) {
        throw new Error(`${path}: template requires non-empty "format" string.`);
      }
      const enumVals = cfg.enum_values ?? cfg.values;
      if (/\{\{\s*enum\s*\}\}/.test(cfg.format)) {
        if (!Array.isArray(enumVals) || enumVals.length === 0) {
          throw new Error(
            `${path}: template format contains {{enum}}; provide non-empty "enum_values" or "values".`
          );
        }
      }
      break;
    }
    case 'object': {
      const props = cfg.properties;
      if (props === null || typeof props !== 'object' || Array.isArray(props)) {
        throw new Error(`${path}: object requires "properties" object.`);
      }
      const keys = Object.keys(props);
      if (keys.length === 0) {
        throw new Error(`${path}: object "properties" must not be empty.`);
      }
      for (const k of keys) {
        validateFieldConfig(normalizeFieldConfig(/** @type {unknown} */ (props[k])), `${path}.${k}`);
      }
      break;
    }
    case 'array': {
      if (!('items' in cfg)) {
        throw new Error(`${path}: array requires "items" config.`);
      }
      const minItems = cfg.minItems ?? 1;
      const maxItems = cfg.maxItems ?? 5;
      if (
        typeof minItems !== 'number' ||
        typeof maxItems !== 'number' ||
        !Number.isInteger(minItems) ||
        !Number.isInteger(maxItems) ||
        minItems < 0 ||
        maxItems < minItems
      ) {
        throw new Error(`${path}: array minItems/maxItems must be integers with 0 <= minItems <= maxItems.`);
      }
      validateFieldConfig(normalizeFieldConfig(cfg.items), `${path}[items]`);
      break;
    }
    case 'number': {
      const min = cfg.min;
      const max = cfg.max;
      if (min !== undefined && typeof min !== 'number') throw new Error(`${path}: number.min must be a number.`);
      if (max !== undefined && typeof max !== 'number') throw new Error(`${path}: number.max must be a number.`);
      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        throw new Error(`${path}: number.min must be <= max.`);
      }
      break;
    }
    case 'float': {
      const min = cfg.min ?? 0;
      const max = cfg.max ?? 100;
      const fixed = cfg.fixed ?? 2;
      if (typeof min !== 'number' || typeof max !== 'number') {
        throw new Error(`${path}: float min/max must be numbers.`);
      }
      if (min > max) throw new Error(`${path}: float.min must be <= max.`);
      if (typeof fixed !== 'number' || fixed < 0 || !Number.isInteger(fixed)) {
        throw new Error(`${path}: float.fixed must be a non-negative integer.`);
      }
      break;
    }
    case 'text': {
      const words = cfg.words ?? 10;
      if (typeof words !== 'number' || words < 1 || !Number.isInteger(words)) {
        throw new Error(`${path}: text.words must be a positive integer.`);
      }
      break;
    }
    default:
      break;
  }
}

export function validateSchema(schema) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Schema must be a JSON object with string keys and field configs.');
  }

  const keys = Object.keys(schema);
  if (keys.length === 0) {
    throw new Error('Schema must define at least one field.');
  }

  for (const key of keys) {
    let cfg;
    try {
      cfg = normalizeFieldConfig(schema[key]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Field "${key}": ${msg}`);
    }
    validateFieldConfig(cfg, key);
  }
}

/**
 * @typedef {{ depth: number; lastFullNameForEmail: string | null }} GenCtx
 */

export const fakeGenerator = {
  name() {
    return `${getRandomElement(firstNames)} ${getRandomElement(lastNames)}`;
  },

  /** @param {string | undefined} fullName */
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
    return new Date(now - offsetMs).toISOString();
  },

  /** @param {Record<string, unknown>} [params] */
  number(params = {}) {
    const min = typeof params.min === 'number' ? params.min : 1;
    const max = typeof params.max === 'number' ? params.max : 1000;
    return randomIntInclusive(min, max);
  },

  /** @param {Record<string, unknown>} [params] */
  float(params = {}) {
    const min = typeof params.min === 'number' ? params.min : 0;
    const max = typeof params.max === 'number' ? params.max : 100;
    const fixed = typeof params.fixed === 'number' ? params.fixed : 2;
    const x = min + Math.random() * (max - min);
    return Number(x.toFixed(fixed));
  },

  boolean() {
    return Math.random() < 0.5;
  },

  /** @param {Record<string, unknown>} params */
  enum(params) {
    const values = params.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('enum.values must be a non-empty array.');
    }
    return getRandomElement(values);
  },

  phone() {
    const a = randomIntInclusive(100, 999);
    const b = randomIntInclusive(100, 999);
    const c = randomIntInclusive(1000, 9999);
    return `+${a}-${b}-${c}`;
  },

  /** @param {Record<string, unknown>} [params] */
  text(params = {}) {
    const n = typeof params.words === 'number' ? params.words : 10;
    const parts = [];
    for (let i = 0; i < n; i += 1) {
      parts.push(getRandomElement(loremWords));
    }
    return parts.join(' ');
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

/**
 * Resolve {{tags}} in template.format using generator leaf methods (no depth charge).
 * @param {Record<string, unknown>} cfg
 * @param {GenCtx} ctx
 */
function generateTemplate(cfg, ctx) {
  const format = /** @type {string} */ (cfg.format);
  const enumPool = cfg.enum_values ?? cfg.values;

  return format.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, rawTag) => {
    const tag = rawTag.toLowerCase();
    switch (tag) {
      case 'uuid':
        return fakeGenerator.uuid();
      case 'number':
        return String(fakeGenerator.number({}));
      case 'float':
        return String(fakeGenerator.float({}));
      case 'boolean':
        return String(fakeGenerator.boolean());
      case 'enum':
        if (!Array.isArray(enumPool) || enumPool.length === 0) {
          throw new Error('template {{enum}} requires enum_values or values array.');
        }
        return String(getRandomElement(enumPool));
      case 'phone':
        return fakeGenerator.phone();
      case 'text':
        return fakeGenerator.text({});
      case 'name':
        return fakeGenerator.name();
      case 'email':
        return fakeGenerator.email(ctx.lastFullNameForEmail ?? undefined);
      case 'date':
        return fakeGenerator.date();
      case 'address':
        return fakeGenerator.address();
      default:
        throw new Error(`Unsupported template placeholder {{${rawTag}}}.`);
    }
  });
}

/**
 * @param {Record<string, unknown>} cfg
 * @param {GenCtx} ctx
 */
function generateField(cfg, ctx) {
  const type = /** @type {string} */ (cfg.type);

  if (CONTAINER_TYPES.has(type)) {
    if (ctx.depth >= MAX_SCHEMA_DEPTH) {
      throw new Error(`Maximum nesting depth (${MAX_SCHEMA_DEPTH}) exceeded at type "${type}".`);
    }
  }

  switch (type) {
    case 'object': {
      const props = /** @type {Record<string, unknown>} */ (cfg.properties);
      return generateObjectProperties(props, {
        depth: ctx.depth + 1,
        lastFullNameForEmail: ctx.lastFullNameForEmail ?? null,
      });
    }
    case 'array': {
      const minItems = typeof cfg.minItems === 'number' ? cfg.minItems : 1;
      const maxItems = typeof cfg.maxItems === 'number' ? cfg.maxItems : 5;
      if (
        !Number.isInteger(minItems) ||
        !Number.isInteger(maxItems) ||
        minItems < 0 ||
        maxItems < minItems
      ) {
        throw new Error('array.minItems/maxItems must be integers with 0 <= minItems <= maxItems.');
      }
      const len = randomIntInclusive(minItems, maxItems);
      const itemsCfg = normalizeFieldConfig(cfg.items);
      /** @type {unknown[]} */
      const arr = [];
      for (let i = 0; i < len; i += 1) {
        arr.push(
          generateField(itemsCfg, {
            depth: ctx.depth + 1,
            lastFullNameForEmail: ctx.lastFullNameForEmail ?? null,
          })
        );
      }
      return arr;
    }
    case 'template':
      return generateTemplate(cfg, ctx);
    case 'name':
      return fakeGenerator.name();
    case 'email':
      return fakeGenerator.email(ctx.lastFullNameForEmail ?? undefined);
    case 'date':
      return fakeGenerator.date();
    case 'number':
      return fakeGenerator.number(cfg);
    case 'float':
      return fakeGenerator.float(cfg);
    case 'boolean':
      return fakeGenerator.boolean();
    case 'enum':
      return fakeGenerator.enum(cfg);
    case 'phone':
      return fakeGenerator.phone();
    case 'text':
      return fakeGenerator.text(cfg);
    case 'address':
      return fakeGenerator.address();
    case 'uuid':
      return fakeGenerator.uuid();
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

/**
 * @param {Record<string, unknown>} properties
 * @param {GenCtx} ctx
 */
function generateObjectProperties(properties, ctx) {
  /** @type {Record<string, unknown>} */
  const result = {};
  let lastName = ctx.lastFullNameForEmail ?? null;

  for (const key of Object.keys(properties)) {
    const nc = normalizeFieldConfig(properties[key]);
    const childCtx = { depth: ctx.depth, lastFullNameForEmail: lastName };
    result[key] = generateField(nc, childCtx);
    if (nc.type === 'name' && typeof result[key] === 'string') {
      lastName = /** @type {string} */ (result[key]);
    }
  }

  return result;
}

/**
 * @param {Record<string, unknown>} schemaRaw
 * @param {number} count
 * @returns {Array<Record<string, unknown>>}
 */
export function generateRecords(schemaRaw, count) {
  const normalizedTop = normalizeSchema(schemaRaw);
  const keys = Object.keys(normalizedTop);
  /** @type {Array<Record<string, unknown>>} */
  const records = [];

  for (let i = 0; i < count; i += 1) {
    /** @type {Record<string, unknown>} */
    const row = {};
    let lastFullName = null;

    for (const key of keys) {
      const cfg = normalizedTop[key];
      const ctx = /** @type {GenCtx} */ ({
        depth: 0,
        lastFullNameForEmail: lastFullName,
      });
      row[key] = generateField(cfg, ctx);
      if (cfg.type === 'name' && typeof row[key] === 'string') {
        lastFullName = /** @type {string} */ (row[key]);
      }
    }

    records.push(row);
  }

  return records;
}
