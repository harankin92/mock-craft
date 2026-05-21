import { createHash, randomBytes } from 'node:crypto';

/**
 * Mulberry32-based PRNG (32-bit state). Deterministic when seeded from string via SHA-256.
 */

/**
 * @param {Buffer} digest min 4 bytes
 */
function uint32FromDigest(digest) {
  return digest.readUInt32BE(0);
}

/**
 * Hash arbitrary seed string to initial Mulberry32 state.
 * @param {string} seedString
 */
export function seedStringToState(seedString) {
  const h = createHash('sha256').update(String(seedString), 'utf8').digest();
  return uint32FromDigest(h);
}

/**
 * @returns {number} integer in [0, 2**32)
 */
function mulberry32Next(stateRef) {
  let a = stateRef.state | 0;
  a = (a + 0x6d2b79f5) | 0;
  stateRef.state = a;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/**
 * @param {string | undefined | null} seedString If omitted, uses random startup seed (non-deterministic).
 */
export function createPrng(seedString) {
  /** @type {{ state: number }} */
  const ref =
    seedString !== undefined && seedString !== null
      ? { state: seedStringToState(String(seedString)) }
      : { state: randomBytes(4).readUInt32BE(0) };

  return {
    /** @returns {number} in [0, 1) */
    random() {
      return mulberry32Next(ref) / 4294967296;
    },

    /** inclusive integers */
    randomIntInclusive(lo, hi) {
      const a = Math.ceil(Math.min(lo, hi));
      const b = Math.floor(Math.max(lo, hi));
      return Math.floor(this.random() * (b - a + 1)) + a;
    },

    /** @template T */
    /** @param {readonly T[]} arr */
    pick(arr) {
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error('PRNG.pick: non-empty array required.');
      }
      const i = Math.floor(this.random() * arr.length);
      return arr[i];
    },

    randomBool() {
      return this.random() < 0.5;
    },

    /** UUID v4-shaped string derived from PRNG (deterministic under seed). */
    uuidV4() {
      const bytes = new Uint8Array(16);
      for (let i = 0; i < 16; i += 1) {
        bytes[i] = Math.floor(this.random() * 256);
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
  };
}
