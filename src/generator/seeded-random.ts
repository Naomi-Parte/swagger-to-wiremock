/**
 * @file Seeded pseudo-random number generator
 * @description Small deterministic PRNG used to make json-schema-faker's internal
 *              random decisions (property/array selection) reproducible per seed
 */

/**
 * Create a deterministic pseudo-random number generator function.
 * Uses the mulberry32 algorithm: fast, deterministic, and produces
 * a uniform [0, 1) float per call, matching the `Math.random()` contract
 * expected by consumers such as json-schema-faker's `random` option.
 * @param seed - Numeric seed
 * @returns A function that returns a deterministic pseudo-random number in [0, 1) on each call
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return function seededRandom(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
