// The scene's shared ground: its size, its moon, seeded randomness, noise and colour helpers. Used
// by the painter in the browser and by the texture baker at build time (scripts/bake-scene.ts),
// so both draw exactly the same thing.

export type Rgb = [number, number, number];

export const W = 1600;
export const H = 1000;
export const MOON = { x: 920, y: 285, r: 178 };

// ---------------------------------------------------------------- randomness and noise

export const createRandom = (seed: number) => {
	let state = seed;

	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);

		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

let current = createRandom(1);
/** The next number from the sequence last started with seed() */
export const rand = () => current();
export const seed = (value: number) => (current = createRandom(value));
export const between = (a: number, b: number) => a + rand() * (b - a);

export const hash = (x: number, y: number) => {
	let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1013904223) | 0;

	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Value noise; with a period it tiles, for textures that repeat */
export const noise = (x: number, y: number, period = 0) => {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const u = (x - xi) ** 2 * (3 - 2 * (x - xi));
	const v = (y - yi) ** 2 * (3 - 2 * (y - yi));
	const wrap = (n: number) => (period ? ((n % period) + period) % period : n);
	const a = hash(wrap(xi), wrap(yi));
	const b = hash(wrap(xi + 1), wrap(yi));
	const c = hash(wrap(xi), wrap(yi + 1));
	const d = hash(wrap(xi + 1), wrap(yi + 1));

	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

export const fbm = (x: number, y: number, octaves = 5, period = 0) => {
	let sum = 0;
	let weight = 0.5;
	let total = 0;

	for (let i = 0; i < octaves; i++) {
		const scale = 2 ** i;

		sum += noise(x * scale, y * scale, period * scale) * weight;
		total += weight;
		weight *= 0.5;
	}
	return sum / total;
};

/** Noise pushed around by noise: the swirled, smoky look of the clouds and fog */
export const warped = (x: number, y: number, period = 0) => {
	const qx = fbm(x, y, 4, period);
	const qy = fbm(x + 5.2, y + 1.3, 4, period);

	return fbm(x + 1.9 * qx, y + 1.9 * qy, 5, period);
};

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const smooth = (edge0: number, edge1: number, value: number) => {
	const t = clamp((value - edge0) / (edge1 - edge0));

	return t * t * (3 - 2 * t);
};
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;

/** How much a point sees of the moon: 1 on it, falling off with distance */
export const moonSight = (x: number, y: number, reach = 420) => Math.exp(-Math.max(0, Math.hypot(x - MOON.x, y - MOON.y) - MOON.r) / reach);
