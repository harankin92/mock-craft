import {
  cities,
  domains,
  firstNames,
  lastNames,
  loremWords,
  streetNames,
  streetSuffixes,
} from './dictionaries.js';
import { createPrng } from './prng.js';

/** Fixed anchor for `date` so seeded output is identical across runs (no wall clock). */
const MOCK_REFERENCE_MS = Date.UTC(2024, 5, 15, 12, 0, 0);

/** Maximum nesting depth for object / array (root depth = 0). */
export const MAX_SCHEMA_DEPTH = 5;

const BASE_LEAF_TYPES = new Set([
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

/**
 * @param {boolean} allowRef
 */
function allTypesSet(allowRef) {
  const s = new Set([...BASE_LEAF_TYPES, ...CONTAINER_TYPES]);
  if (allowRef) s.add('ref');
  return s;
}

/**
 * @param {unknown} schema
 */
export function isCollectionsSchema(schema) {
  return (
    schema !== null &&
    typeof schema === 'object' &&
    !Array.isArray(schema) &&
    '_collections' in schema &&
    typeof /** @type {{ _collections?: unknown }} */ (schema)._collections === 'object' &&
    /** @type {{ _collections?: object }} */ (schema)._collections !== null &&
    !Array.isArray(/** @type {{ _collections?: object }} */ (schema)._collections)
  );
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
 * @param {{ types: Set<string>; collectionNames?: string[]; currentCollection?: string }} meta
 */
function validateFieldConfig(cfg, path, meta) {
  const type = cfg.type;
  if (typeof type !== 'string' || !meta.types.has(type)) {
    throw new Error(
      `${path}: unknown type ${JSON.stringify(type)}. Supported: ${[...meta.types].sort().join(', ')}`
    );
  }

  const nc = cfg.nullChance;
  if (nc !== undefined) {
    if (typeof nc !== 'number' || nc < 0 || nc > 1 || Number.isNaN(nc)) {
      throw new Error(`${path}: nullChance must be a number between 0 and 1.`);
    }
  }

  switch (type) {
    case 'ref': {
      const col = cfg.collection;
      const fld = cfg.field;
      if (typeof col !== 'string' || !col) {
        throw new Error(`${path}: ref requires non-empty "collection".`);
      }
      if (typeof fld !== 'string' || !fld) {
        throw new Error(`${path}: ref requires non-empty "field".`);
      }
      const names = meta.collectionNames;
      const cur = meta.currentCollection;
      if (!names || cur === undefined) {
        throw new Error(`${path}: ref is only allowed inside "_collections".`);
      }
      if (!names.includes(col)) {
        throw new Error(`${path}: ref references unknown collection "${col}".`);
      }
      const ixTarget = names.indexOf(col);
      const ixSelf = names.indexOf(cur);
      if (ixTarget >= ixSelf) {
        throw new Error(
          `${path}: ref target "${col}" must be declared earlier than "${cur}" in _collections order.`
        );
      }
      break;
    }
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
        validateFieldConfig(normalizeFieldConfig(/** @type {unknown} */ (props[k])), `${path}.${k}`, meta);
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
      validateFieldConfig(normalizeFieldConfig(cfg.items), `${path}[items]`, meta);
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

/**
 * @param {Record<string, unknown>} collections
 */
function validateCollectionsShape(collections) {
  const names = Object.keys(collections);
  if (names.length === 0) {
    throw new Error('_collections must define at least one collection.');
  }
  const types = allTypesSet(true);
  for (const name of names) {
    const inner = collections[name];
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
      throw new Error(`Collection "${name}" must be a plain object schema.`);
    }
    const keys = Object.keys(inner);
    if (keys.length === 0) {
      throw new Error(`Collection "${name}" must define at least one field.`);
    }
    const meta = { types, collectionNames: names, currentCollection: name };
    for (const k of keys) {
      try {
        validateFieldConfig(normalizeFieldConfig(inner[k]), `${name}.${k}`, meta);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(msg);
      }
    }
  }
}

export function validateSchema(schema) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Schema must be a JSON object.');
  }

  if (isCollectionsSchema(schema)) {
    const rootKeys = Object.keys(schema);
    if (rootKeys.length !== 1 || rootKeys[0] !== '_collections') {
      throw new Error('Multi-schema documents must contain only the "_collections" key at root.');
    }
    validateCollectionsShape(/** @type {{ _collections: Record<string, unknown> }} */ (schema)._collections);
    return;
  }

  const keys = Object.keys(schema);
  if (keys.length === 0) {
    throw new Error('Schema must define at least one field.');
  }

  const meta = { types: allTypesSet(false) };
  for (const key of keys) {
    try {
      validateFieldConfig(normalizeFieldConfig(schema[key]), key, meta);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Field "${key}": ${msg}`);
    }
  }
}

/**
 * @typedef {{
 *   depth: number;
 *   lastFullNameForEmail: string | null;
 *   rng: ReturnType<typeof createPrng>;
 *   collections: Record<string, Record<string, unknown>[]>;
 * }} GenCtx
 */

/**
 * @param {ReturnType<typeof createPrng>} rng
 */
function createFakeGenerators(rng) {
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

  return {
    name() {
      return `${rng.pick(firstNames)} ${rng.pick(lastNames)}`;
    },

    /** @param {string | undefined} fullName */
    email(fullName) {
      const sourceName =
        typeof fullName === 'string' && fullName.trim().length > 0 ? fullName : this.name();
      const local = buildEmailLocalPartFromFullName(sourceName);
      const num = rng.randomIntInclusive(1, 9999);
      const domain = rng.pick(domains);
      return `${local}${num}@${domain}`;
    },

    date() {
      const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;
      const minAgo = 1 * oneYearMs;
      const maxAgo = 5 * oneYearMs;
      const offsetMs = minAgo + rng.random() * (maxAgo - minAgo);
      return new Date(MOCK_REFERENCE_MS - offsetMs).toISOString();
    },

    /** @param {Record<string, unknown>} [params] */
    number(params = {}) {
      const min = typeof params.min === 'number' ? params.min : 1;
      const max = typeof params.max === 'number' ? params.max : 1000;
      return rng.randomIntInclusive(min, max);
    },

    /** @param {Record<string, unknown>} [params] */
    float(params = {}) {
      const min = typeof params.min === 'number' ? params.min : 0;
      const max = typeof params.max === 'number' ? params.max : 100;
      const fixed = typeof params.fixed === 'number' ? params.fixed : 2;
      const x = min + rng.random() * (max - min);
      return Number(x.toFixed(fixed));
    },

    boolean() {
      return rng.randomBool();
    },

    /** @param {Record<string, unknown>} params */
    enum(params) {
      const values = params.values;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error('enum.values must be a non-empty array.');
      }
      return rng.pick(values);
    },

    phone() {
      const a = rng.randomIntInclusive(100, 999);
      const b = rng.randomIntInclusive(100, 999);
      const c = rng.randomIntInclusive(1000, 9999);
      return `+${a}-${b}-${c}`;
    },

    /** @param {Record<string, unknown>} [params] */
    text(params = {}) {
      const n = typeof params.words === 'number' ? params.words : 10;
      const parts = [];
      for (let i = 0; i < n; i += 1) {
        parts.push(rng.pick(loremWords));
      }
      return parts.join(' ');
    },

    address() {
      const num = rng.randomIntInclusive(1, 999);
      const street = rng.pick(streetNames);
      const suffix = rng.pick(streetSuffixes);
      const city = rng.pick(cities);
      const zip = rng.randomIntInclusive(10000, 99999);
      return `${num} ${street} ${suffix}, ${city}, ${zip}`;
    },

    uuid() {
      return rng.uuidV4();
    },
  };
}

/**
 * @param {Record<string, unknown>} cfg
 * @param {GenCtx} ctx
 * @param {ReturnType<typeof createFakeGenerators>} gen
 */
function generateTemplate(cfg, ctx, gen) {
  const format = /** @type {string} */ (cfg.format);
  const enumPool = cfg.enum_values ?? cfg.values;

  return format.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, rawTag) => {
    const tag = rawTag.toLowerCase();
    switch (tag) {
      case 'uuid':
        return gen.uuid();
      case 'number':
        return String(gen.number({}));
      case 'float':
        return String(gen.float({}));
      case 'boolean':
        return String(gen.boolean());
      case 'enum':
        if (!Array.isArray(enumPool) || enumPool.length === 0) {
          throw new Error('template {{enum}} requires enum_values or values array.');
        }
        return String(ctx.rng.pick(enumPool));
      case 'phone':
        return gen.phone();
      case 'text':
        return gen.text({});
      case 'name':
        return gen.name();
      case 'email':
        return gen.email(ctx.lastFullNameForEmail ?? undefined);
      case 'date':
        return gen.date();
      case 'address':
        return gen.address();
      default:
        throw new Error(`Unsupported template placeholder {{${rawTag}}}.`);
    }
  });
}

/**
 * @param {Record<string, unknown>} cfg
 * @param {GenCtx} ctx
 * @param {ReturnType<typeof createFakeGenerators>} gen
 */
function generateField(cfg, ctx, gen) {
  const ncRaw = cfg.nullChance;
  if (typeof ncRaw === 'number' && ncRaw > 0 && ncRaw <= 1 && ctx.rng.random() < ncRaw) {
    return null;
  }

  const type = /** @type {string} */ (cfg.type);

  if (CONTAINER_TYPES.has(type)) {
    if (ctx.depth >= MAX_SCHEMA_DEPTH) {
      throw new Error(`Maximum nesting depth (${MAX_SCHEMA_DEPTH}) exceeded at type "${type}".`);
    }
  }

  switch (type) {
    case 'ref': {
      const col = /** @type {string} */ (cfg.collection);
      const fld = /** @type {string} */ (cfg.field);
      const rows = ctx.collections[col];
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(`ref: collection "${col}" has no rows yet or is missing.`);
      }
      const row = ctx.rng.pick(rows);
      return /** @type {Record<string, unknown>} */ (row)[fld];
    }
    case 'object': {
      const props = /** @type {Record<string, unknown>} */ (cfg.properties);
      return generateObjectProperties(props, {
        depth: ctx.depth + 1,
        lastFullNameForEmail: ctx.lastFullNameForEmail ?? null,
        rng: ctx.rng,
        collections: ctx.collections,
      }, gen);
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
      const len = ctx.rng.randomIntInclusive(minItems, maxItems);
      const itemsCfg = normalizeFieldConfig(cfg.items);
      /** @type {unknown[]} */
      const arr = [];
      for (let i = 0; i < len; i += 1) {
        arr.push(
          generateField(itemsCfg, {
            depth: ctx.depth + 1,
            lastFullNameForEmail: ctx.lastFullNameForEmail ?? null,
            rng: ctx.rng,
            collections: ctx.collections,
          }, gen)
        );
      }
      return arr;
    }
    case 'template':
      return generateTemplate(cfg, ctx, gen);
    case 'name':
      return gen.name();
    case 'email':
      return gen.email(ctx.lastFullNameForEmail ?? undefined);
    case 'date':
      return gen.date();
    case 'number':
      return gen.number(cfg);
    case 'float':
      return gen.float(cfg);
    case 'boolean':
      return gen.boolean();
    case 'enum':
      return gen.enum(cfg);
    case 'phone':
      return gen.phone();
    case 'text':
      return gen.text(cfg);
    case 'address':
      return gen.address();
    case 'uuid':
      return gen.uuid();
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

/**
 * @param {Record<string, unknown>} properties
 * @param {GenCtx} ctx
 * @param {ReturnType<typeof createFakeGenerators>} gen
 */
function generateObjectProperties(properties, ctx, gen) {
  /** @type {Record<string, unknown>} */
  const result = {};
  let lastName = ctx.lastFullNameForEmail ?? null;

  for (const key of Object.keys(properties)) {
    const nc = normalizeFieldConfig(properties[key]);
    const childCtx = {
      depth: ctx.depth,
      lastFullNameForEmail: lastName,
      rng: ctx.rng,
      collections: ctx.collections,
    };
    result[key] = generateField(nc, childCtx, gen);
    if (nc.type === 'name' && typeof result[key] === 'string') {
      lastName = /** @type {string} */ (result[key]);
    }
  }

  return result;
}

/**
 * @typedef {{ seed?: string }} GenOpts
 */

/**
 * Flat table schema → array of rows.
 * @param {Record<string, unknown>} schemaRaw
 * @param {number} count
 * @param {GenOpts} [opts]
 */
export function generateRecords(schemaRaw, count, opts = {}) {
  if (isCollectionsSchema(schemaRaw)) {
    throw new Error('Use generateCollectionsBundle() for schemas with "_collections".');
  }

  const rng = createPrng(opts.seed);
  const gen = createFakeGenerators(rng);
  const normalizedTop = normalizeSchema(schemaRaw);
  const keys = Object.keys(normalizedTop);
  /** @type {Record<string, Record<string, unknown>[]>} */
  const emptyCollections = {};
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
        rng,
        collections: emptyCollections,
      });
      row[key] = generateField(cfg, ctx, gen);
      if (cfg.type === 'name' && typeof row[key] === 'string') {
        lastFullName = /** @type {string} */ (row[key]);
      }
    }

    records.push(row);
  }

  return records;
}

/**
 * @param {{ _collections: Record<string, Record<string, unknown>> }} schemaRoot
 * @param {number} count
 * @param {GenOpts} [opts]
 * @returns {Record<string, Record<string, unknown>[]>}
 */
export function generateCollectionsBundle(schemaRoot, count, opts = {}) {
  if (!isCollectionsSchema(schemaRoot)) {
    throw new Error('Schema must contain "_collections" object.');
  }

  const rng = createPrng(opts.seed);
  const gen = createFakeGenerators(rng);
  const cols = schemaRoot._collections;
  const names = Object.keys(cols);

  /** @type {Record<string, Record<string, unknown>[]>} */
  const bundle = {};
  /** @type {Record<string, Record<string, unknown>[]>} */
  const ctxCollections = {};

  for (const name of names) {
    const normalizedTop = normalizeSchema(cols[name]);
    const keys = Object.keys(normalizedTop);
    /** @type {Record<string, unknown>[]} */
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
          rng,
          collections: ctxCollections,
        });
        row[key] = generateField(cfg, ctx, gen);
        if (cfg.type === 'name' && typeof row[key] === 'string') {
          lastFullName = /** @type {string} */ (row[key]);
        }
      }

      records.push(row);
    }

    bundle[name] = records;
    ctxCollections[name] = records;
  }

  return bundle;
}
