// The first, storybook version of "The Drowned Keep", kept at /cartoon/: a gothic castle on a
// crag, under a sick moon, wrapped by tentacles.
// Everything is drawn from code on a 1600×1000 scene in an ink-and-hatching style: the still
// parts once per resize into offscreen layers, the tentacles, fog, lights and spores every frame.

type P = [number, number];
type Ctx = CanvasRenderingContext2D;

const W = 1600;
const H = 1000;
const INK = "#0b0908";
const MOON = { x: 960, y: 300, r: 190 };

// ---------------------------------------------------------------- randomness and noise

const createRandom = (seed: number) => {
	let state = seed;

	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);

		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

let rand = createRandom(1);
const seed = (value: number) => (rand = createRandom(value));
const between = (a: number, b: number) => a + rand() * (b - a);

const hash = (x: number, y: number) => {
	let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1013904223) | 0;

	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const noise = (x: number, y: number) => {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const u = (x - xi) ** 2 * (3 - 2 * (x - xi));
	const v = (y - yi) ** 2 * (3 - 2 * (y - yi));
	const a = hash(xi, yi);
	const b = hash(xi + 1, yi);
	const c = hash(xi, yi + 1);
	const d = hash(xi + 1, yi + 1);

	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const fbm = (x: number, y: number) => (noise(x, y) * 4 + noise(x * 2, y * 2) * 2 + noise(x * 4, y * 4)) / 7;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (edge0: number, edge1: number, value: number) => {
	const t = clamp((value - edge0) / (edge1 - edge0));

	return t * t * (3 - 2 * t);
};

const toRgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const mix = (from: string, to: string, amount: number) => {
	const a = toRgb(from);
	const b = toRgb(to);

	return `rgb(${a.map((value, i) => Math.round(value + (b[i] - value) * amount)).join(",")})`;
};

// ---------------------------------------------------------------- ink helpers

const trace = (c: Ctx, points: P[], close = true) => {
	c.beginPath();
	c.moveTo(points[0][0], points[0][1]);
	for (let i = 1; i < points.length; i++) {
		c.lineTo(points[i][0], points[i][1]);
	}
	if (close) {
		c.closePath();
	}
};

/** Subdivides a shape and shakes it with noise, so edges look drawn by hand */
const rough = (points: P[], amount: number, step = 7, closed = true): P[] => {
	const out: P[] = [];
	const count = closed ? points.length : points.length - 1;

	for (let i = 0; i < count; i++) {
		const [ax, ay] = points[i];
		const [bx, by] = points[(i + 1) % points.length];
		const parts = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));

		for (let j = 0; j < parts; j++) {
			const x = ax + ((bx - ax) * j) / parts;
			const y = ay + ((by - ay) * j) / parts;

			out.push([
				x + (noise(x * 0.07, y * 0.07) - 0.5) * 2 * amount,
				y + (noise(x * 0.07 + 31.7, y * 0.07 + 11.3) - 0.5) * 2 * amount,
			]);
		}
	}
	if (!closed) {
		out.push(points.at(-1)!);
	}
	return out;
};

const roughCircle = (cx: number, cy: number, r: number, amount: number, step = 6): P[] => {
	const count = Math.max(10, Math.ceil((Math.PI * 2 * r) / step));
	const offset = between(0, 100);

	return Array.from({ length: count }, (_, i) => {
		const a = (i / count) * Math.PI * 2;
		const radius = r + (noise(Math.cos(a) * 2 + offset, Math.sin(a) * 2 + offset) - 0.5) * 2 * amount;

		return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius] as P;
	});
};

const ink = (c: Ctx, points: P[], fill: string | CanvasGradient | null, width = 3, close = true) => {
	trace(c, points, close);
	if (fill) {
		c.fillStyle = fill;
		c.fill();
	}
	if (width > 0) {
		c.lineWidth = width;
		c.lineJoin = "round";
		c.lineCap = "round";
		c.strokeStyle = INK;
		c.stroke();
	}
};

const bounds = (points: P[]): [number, number, number, number] => {
	let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];

	for (const [x, y] of points) {
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	}
	return [x0, y0, x1, y1];
};

const inside = ([x, y]: P, polygon: P[]) => {
	let hit = false;

	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i];
		const [xj, yj] = polygon[j];

		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
			hit = !hit;
		}
	}
	return hit;
};

type Hatch = {
	angle: number;
	gap: number;
	width?: number;
	color?: string;
	alpha?: number;
	/** 0 → no stroke here, 1 → strokes everywhere */
	weight?: (x: number, y: number) => number;
	box?: [number, number, number, number];
};

/** Parallel pen strokes inside a shape, broken up where the weight is low */
const hatch = (c: Ctx, clip: P[] | null, options: Hatch) => {
	const [x0, y0, x1, y1] = options.box ?? bounds(clip!);
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	const reach = Math.hypot(x1 - x0, y1 - y0) / 2 + 4;
	const dx = Math.cos(options.angle);
	const dy = Math.sin(options.angle);
	const step = 5;

	c.save();
	if (clip) {
		trace(c, clip);
		c.clip();
	}
	c.beginPath();
	let line = 0;
	for (let d = -reach; d <= reach; d += options.gap * between(0.75, 1.25), line++) {
		let pen = false;

		for (let s = -reach; s <= reach; s += step) {
			const x = cx - dy * d + dx * s;
			const y = cy + dx * d + dy * s;
			const within = x >= x0 - step && x <= x1 + step && y >= y0 - step && y <= y1 + step;
			const weight = within ? (options.weight ? options.weight(x, y) : 1) : 0;

			if (weight > 0.12 + 0.76 * noise(line * 3.17 + 0.5, s * 0.035)) {
				const wobbleX = x + (rand() - 0.5) * 0.8;
				const wobbleY = y + (rand() - 0.5) * 0.8;

				if (pen) {
					c.lineTo(wobbleX, wobbleY);
				} else {
					c.moveTo(wobbleX, wobbleY);
					pen = true;
				}
			} else {
				pen = false;
			}
		}
	}
	c.lineWidth = options.width ?? 1;
	c.lineCap = "round";
	c.strokeStyle = options.color ?? INK;
	c.globalAlpha = options.alpha ?? 0.7;
	c.stroke();
	c.restore();
};

/** A light that falls off with the distance to the moon, for rims and lit faces */
const moonLight = (c: Ctx, near: string, far: string, reach = 3.2) => {
	const gradient = c.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.6, MOON.x, MOON.y, MOON.r * reach);

	gradient.addColorStop(0, near);
	gradient.addColorStop(1, far);
	return gradient;
};

// ---------------------------------------------------------------- sky, moon and clouds

const paintSky = (c: Ctx) => {
	seed(11);
	const sky = c.createLinearGradient(0, -100, 0, H);

	sky.addColorStop(0, "#040505");
	sky.addColorStop(0.3, "#0b1110");
	sky.addColorStop(0.62, "#18241f");
	sky.addColorStop(1, "#26352b");
	c.fillStyle = sky;
	c.fillRect(-400, -400, W + 800, H + 800);

	const glow = c.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.8, MOON.x, MOON.y, MOON.r * 4.5);

	glow.addColorStop(0, "rgba(176, 204, 140, 0.42)");
	glow.addColorStop(0.35, "rgba(90, 118, 84, 0.18)");
	glow.addColorStop(1, "rgba(40, 60, 45, 0)");
	c.fillStyle = glow;
	c.fillRect(-400, -400, W + 800, H + 800);

	for (let i = 0; i < 170; i++) {
		const x = between(-100, W + 100);
		const y = between(-100, 560);

		if (Math.hypot(x - MOON.x, y - MOON.y) < MOON.r * 1.9) {
			continue;
		}
		const size = rand() < 0.08 ? between(1.4, 2.2) : between(0.5, 1.2);

		c.globalAlpha = between(0.25, 0.8) * (1 - y / 700);
		c.fillStyle = "#d4dcc4";
		c.fillRect(x, y, size, size);
		if (size > 1.6) {
			c.fillRect(x - 3, y + size / 2 - 0.4, size + 6, 0.8);
			c.fillRect(x + size / 2 - 0.4, y - 3, 0.8, size + 6);
		}
	}
	c.globalAlpha = 1;

	// The thinnest, farthest streaks, behind the moon
	paintCloud(c, { x0: 380, x1: 1500, y: 205, thickness: 10, seed: 3, faint: true });
	paintMoon(c);
	for (const cloud of CLOUDS) {
		paintCloud(c, cloud);
	}
};

const paintMoon = (c: Ctx) => {
	seed(23);
	const halo = c.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.95, MOON.x, MOON.y, MOON.r * 1.75);

	halo.addColorStop(0, "rgba(224, 232, 186, 0.5)");
	halo.addColorStop(1, "rgba(224, 232, 186, 0)");
	c.fillStyle = halo;
	c.fillRect(MOON.x - MOON.r * 2, MOON.y - MOON.r * 2, MOON.r * 4, MOON.r * 4);

	const disk = roughCircle(MOON.x, MOON.y, MOON.r, 1.6);
	const face = c.createRadialGradient(
		MOON.x + MOON.r * 0.3,
		MOON.y - MOON.r * 0.35,
		0,
		MOON.x,
		MOON.y,
		MOON.r * 1.15,
	);

	face.addColorStop(0, "#f1ebc9");
	face.addColorStop(0.55, "#d5d0a5");
	face.addColorStop(1, "#9d9b74");
	ink(c, disk, face, 0);

	c.save();
	trace(c, disk);
	c.clip();
	for (let i = 0; i < 10; i++) {
		const a = between(0, Math.PI * 2);
		const d = Math.sqrt(rand()) * MOON.r * 0.8;
		const r = between(18, 72);

		c.globalAlpha = between(0.16, 0.3);
		ink(c, roughCircle(MOON.x + Math.cos(a) * d, MOON.y + Math.sin(a) * d, r, r * 0.3, 5), "#6f7255", 0);
	}
	for (let i = 0; i < 34; i++) {
		const a = between(0, Math.PI * 2);
		const d = Math.sqrt(rand()) * MOON.r * 0.92;
		const r = between(2.5, 13);
		const x = MOON.x + Math.cos(a) * d;
		const y = MOON.y + Math.sin(a) * d;

		c.globalAlpha = 0.28;
		ink(c, roughCircle(x, y, r, r * 0.15, 3), "#6a6c50", 0);
		c.globalAlpha = 0.45;
		c.beginPath();
		c.arc(x, y, r, Math.PI * 0.55, Math.PI * 1.45);
		c.strokeStyle = INK;
		c.lineWidth = 1;
		c.stroke();
		c.beginPath();
		c.arc(x + 0.8, y - 0.8, r, -Math.PI * 0.45, Math.PI * 0.45);
		c.strokeStyle = "#fffbe0";
		c.stroke();
	}
	c.globalAlpha = 1;
	c.restore();

	// Shadow on the side away from the light, in two layers of hatching
	const shade = (x: number, y: number) => -((x - MOON.x) * 0.62 + (y - MOON.y) * -0.78) / MOON.r;

	hatch(c, disk, { angle: -0.9, gap: 4.2, width: 1.1, color: "#3f3f2c", alpha: 0.75, weight: (x, y) => smooth(0.15, 0.95, shade(x, y)) });
	hatch(c, disk, { angle: 0.45, gap: 5, width: 1, color: "#3a3a28", alpha: 0.6, weight: (x, y) => smooth(0.6, 1.05, shade(x, y)) });
	ink(c, disk, null, 4.5);
};

type Cloud = { x0: number; x1: number; y: number; thickness: number; seed: number; faint?: boolean };

const CLOUDS: Cloud[] = [
	{ x0: 20, x1: 700, y: 330, thickness: 40, seed: 5 },
	{ x0: 1090, x1: 1700, y: 236, thickness: 34, seed: 7 },
	{ x0: 660, x1: 1240, y: 432, thickness: 28, seed: 9 },
	{ x0: 1150, x1: 1700, y: 486, thickness: 50, seed: 13 },
	{ x0: -80, x1: 560, y: 514, thickness: 46, seed: 17 },
	{ x0: -60, x1: 480, y: 152, thickness: 28, seed: 31 },
	{ x0: 1260, x1: 1700, y: 96, thickness: 26, seed: 29 },
];

const paintCloud = (c: Ctx, cloud: Cloud) => {
	seed(cloud.seed * 101);
	const top: P[] = [];
	const bottom: P[] = [];

	for (let x = cloud.x0; x <= cloud.x1; x += 9) {
		const u = (x - cloud.x0) / (cloud.x1 - cloud.x0);
		const envelope = Math.sin(Math.PI * u) ** 0.55;
		const bump = fbm(x * 0.011 + cloud.seed * 7, cloud.seed * 3.1);

		top.push([x, cloud.y - cloud.thickness * envelope * (0.25 + 1.6 * bump ** 1.4)]);
		bottom.push([x, cloud.y + cloud.thickness * envelope * (0.18 + 0.3 * noise(x * 0.02, cloud.seed))]);
	}
	const shape = [...top, ...bottom.reverse()];

	c.globalAlpha = cloud.faint ? 0.55 : 1;
	ink(c, shape, moonLight(c, "#3d4b3e", "#111816", 3.4), cloud.faint ? 0 : 1.6);
	// Lit edge, brightest by the moon
	trace(c, top, false);
	c.strokeStyle = moonLight(c, "#d4d9a8", "#26302a", 2.6);
	c.lineWidth = cloud.faint ? 1.4 : 2.4;
	c.stroke();
	// A few long wisps inside
	c.lineWidth = 1;
	c.strokeStyle = moonLight(c, "#7d8a68", "#1c2420", 2.8);
	for (let i = 0; i < 4; i++) {
		const from = between(cloud.x0, cloud.x1 - 120);
		const to = Math.min(cloud.x1, from + between(80, 300));
		const offset = between(-0.2, 0.7) * cloud.thickness * 0.5;

		c.beginPath();
		for (let x = from; x <= to; x += 12) {
			const y = cloud.y + offset - Math.sin(((x - from) / (to - from)) * Math.PI) * 3;

			if (x === from) {
				c.moveTo(x, y);
			} else {
				c.lineTo(x, y);
			}
		}
		c.stroke();
	}
	c.globalAlpha = 1;
};

// ---------------------------------------------------------------- far ranges

const range = (base: number, height: number, roughness: number, seedValue: number): P[] => {
	seed(seedValue);
	const points: P[] = [[-200, H + 60]];
	let up = true;

	for (let x = -200; x <= W + 200; x += between(18, 55)) {
		const level = height * (0.25 + 0.75 * fbm(x * 0.0035 + seedValue, seedValue));

		points.push([x, base - level + (up ? -roughness : roughness) * rand()]);
		up = !up;
	}
	points.push([W + 200, H + 60]);
	return points;
};

const paintFar = (c: Ctx) => {
	const back = rough(range(705, 150, 26, 41), 1.5);

	ink(c, back, moonLight(c, "#25302a", "#121816", 4), 2);
	c.save();
	trace(c, back);
	c.clip();
	trace(c, back.slice(1, -1), false);
	c.strokeStyle = moonLight(c, "#7c8868", "#2a332c", 3);
	c.lineWidth = 1.6;
	c.translate(0, 2);
	c.stroke();
	c.restore();
	hatch(c, back, { angle: 1.25, gap: 6, alpha: 0.35, weight: (x, y) => smooth(620, 780, y) });

	const mist = c.createLinearGradient(0, 600, 0, 820);

	mist.addColorStop(0, "rgba(70, 90, 72, 0)");
	mist.addColorStop(0.6, "rgba(70, 90, 72, 0.4)");
	mist.addColorStop(1, "rgba(50, 66, 54, 0.15)");
	c.fillStyle = mist;
	c.fillRect(-200, 560, W + 400, 300);

	const front = rough(range(790, 120, 30, 43), 1.5);

	ink(c, front, moonLight(c, "#1b2320", "#0d1110", 4), 2.2);
	c.save();
	trace(c, front);
	c.clip();
	trace(c, front.slice(1, -1), false);
	c.strokeStyle = moonLight(c, "#56614b", "#1d241f", 3);
	c.lineWidth = 1.4;
	c.translate(0, 2);
	c.stroke();
	c.restore();
	hatch(c, front, { angle: 1.1, gap: 5, alpha: 0.5, weight: (x, y) => smooth(700, 880, y) });
};

// ---------------------------------------------------------------- castle

const STONE = { base: "#20211e", lit: "#464a3c", dark: "#121211" };
const ROOF = { base: "#16181b", lit: "#3d4446" };

type Window = { x: number; y: number; w: number; h: number; lit: boolean; big?: boolean };
const windows: Window[] = [];

type Tower = {
	x: number;
	w: number;
	top: number;
	base: number;
	lean?: number;
	seed: number;
	windows?: [number, boolean][];
};

const centerAt = (t: Tower, y: number) => t.x + ((t.lean ?? 0) * (t.base - y)) / (t.base - t.top);

/** An arched slit, lit or dark; lit ones are also listed for the flicker */
const archWindow = (c: Ctx, x: number, y: number, w: number, h: number, lit: boolean) => {
	const shape: P[] = [[x - w / 2, y + h / 2]];

	for (let i = 0; i <= 8; i++) {
		const a = Math.PI + (i / 8) * Math.PI;

		shape.push([x + Math.cos(a) * (w / 2), y - h / 2 + w / 2 + Math.sin(a) * w * 0.75]);
	}
	shape.push([x + w / 2, y + h / 2]);
	if (lit) {
		const light = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);

		light.addColorStop(0, "#eefcc4");
		light.addColorStop(1, "#9ccc5a");
		ink(c, shape, light, 2.2);
		windows.push({ x, y, w, h, lit });
	} else {
		ink(c, shape, "#070706", 2);
	}
	// Sill
	c.fillStyle = INK;
	c.fillRect(x - w / 2 - 3, y + h / 2 - 1, w + 6, 3);
};

const masonry = (c: Ctx, shape: P[], litFrom: (x: number, y: number) => number) => {
	const [x0, y0, x1, y1] = bounds(shape);

	c.save();
	trace(c, shape);
	c.clip();
	c.lineCap = "round";
	for (let y = y0 + 6; y < y1; y += between(10, 14)) {
		for (let x = x0 + between(-10, 4); x < x1; x += between(14, 30)) {
			if (rand() < 0.45) {
				continue;
			}
			const length = between(6, 18);
			const lit = litFrom(x, y);

			c.globalAlpha = 0.5;
			c.strokeStyle = INK;
			c.lineWidth = 1.1;
			c.beginPath();
			c.moveTo(x, y);
			c.lineTo(x + length, y + between(-0.6, 0.6));
			c.moveTo(x + length, y);
			c.lineTo(x + length + between(-1, 1), y - between(5, 10));
			c.stroke();
			if (lit > 0.3) {
				c.globalAlpha = lit * 0.5;
				c.strokeStyle = "#8a8f74";
				c.beginPath();
				c.moveTo(x + 1, y - 1.5);
				c.lineTo(x + length - 1, y - 1.5);
				c.stroke();
			}
		}
	}
	c.globalAlpha = 1;
	c.restore();
};

const towerBody = (c: Ctx, t: Tower, topEdge?: P[]) => {
	seed(t.seed);
	const half = t.w / 2;
	const topHalf = half * 0.93;
	const lean = t.lean ?? 0;
	const shape = rough(
		topEdge
			? [[t.x - half, t.base], ...topEdge, [t.x + half, t.base]]
			: [
					[t.x - half, t.base],
					[t.x - topHalf + lean, t.top],
					[t.x + topHalf + lean, t.top],
					[t.x + half, t.base],
				],
		1.1,
		7,
	);
	const across = (x: number, y: number) => (x - (centerAt(t, y) - half)) / t.w;

	ink(c, shape, STONE.base, 0);
	c.save();
	trace(c, shape);
	c.clip();
	// Moonlit right face, with a hard edge as in a woodcut
	c.fillStyle = STONE.lit;
	c.beginPath();
	c.moveTo(t.x + half * 0.42, t.base + 10);
	c.lineTo(t.x + lean + half * 0.36, t.top - 60);
	c.lineTo(t.x + lean + half + 40, t.top - 60);
	c.lineTo(t.x + half + 40, t.base + 10);
	c.fill();
	c.restore();
	masonry(c, shape, (x, y) => smooth(0.6, 0.8, across(x, y)));
	hatch(c, shape, { angle: 1.2, gap: 3.6, alpha: 0.75, weight: (x, y) => smooth(0.62, 0.05, across(x, y)) });
	hatch(c, shape, { angle: -0.35, gap: 4.5, alpha: 0.55, weight: (x, y) => smooth(0.3, 0, across(x, y)) * 0.9 });
	// Base sinks into shadow
	hatch(c, shape, { angle: 0.9, gap: 4, alpha: 0.6, weight: (x, y) => smooth(t.base - 90, t.base, y) });
	ink(c, shape, null, 3.2);

	for (const [at, lit] of t.windows ?? []) {
		const y = t.base - (t.base - t.top) * at;

		archWindow(c, centerAt(t, y), y, Math.max(8, t.w * 0.16), Math.max(20, t.w * 0.42), lit);
	}
	return shape;
};

const sideAt = (side: P[], y: number) => {
	for (let i = 0; i < side.length - 1; i++) {
		const [ax, ay] = side[i];
		const [bx, by] = side[i + 1];

		if ((y - ay) * (y - by) <= 0 && ay !== by) {
			return ax + ((bx - ax) * (y - ay)) / (by - ay);
		}
	}
	return side[0][0];
};

/** A witch-hat roof: concave sides, flared eaves, shingles, a crooked finial */
const coneRoof = (c: Ctx, cx: number, y: number, half: number, height: number, lean = 0, flare = 8) => {
	const tip: P = [cx + lean, y - height];
	const curve = (from: P, control: P): P[] =>
		Array.from({ length: 13 }, (_, i) => {
			const t = i / 12;
			const a = (1 - t) ** 2;
			const b = 2 * (1 - t) * t;
			const d = t * t;

			return [from[0] * a + control[0] * b + tip[0] * d, from[1] * a + control[1] * b + tip[1] * d] as P;
		});
	const left = curve([cx - half - flare, y + 5], [cx - half * 0.5 + lean * 0.3, y - height * 0.32]);
	const right = curve([cx + half + flare, y + 5], [cx + half * 0.5 + lean * 0.3, y - height * 0.32]);
	const eave: P[] = Array.from({ length: 9 }, (_, i) => {
		const u = i / 8;

		return [cx + half + flare - u * 2 * (half + flare), y + 5 + Math.sin(u * Math.PI) * 4] as P;
	});
	const shape = rough([...left, ...right.slice(0, -1).reverse(), ...eave.slice(1, -1)], 0.8, 6);

	ink(c, shape, ROOF.base, 0);
	c.save();
	trace(c, shape);
	c.clip();
	c.fillStyle = ROOF.lit;
	c.beginPath();
	c.moveTo(tip[0], tip[1] - 4);
	c.lineTo(cx + half * 0.25, y + 12);
	c.lineTo(cx + half + flare + 10, y + 12);
	c.fill();
	// Shingles: sagging rows and staggered joints
	c.strokeStyle = INK;
	c.lineWidth = 1;
	let row = 0;
	for (let yy = y; yy > tip[1] + 10; yy -= 8 + (y - yy) * 0.012, row++) {
		const xl = sideAt(left, yy);
		const xr = sideAt(right, yy);

		c.globalAlpha = 0.55;
		c.beginPath();
		c.moveTo(xl, yy);
		c.quadraticCurveTo((xl + xr) / 2, yy + 3, xr, yy);
		c.stroke();
		c.globalAlpha = 0.3;
		c.beginPath();
		for (let x = xl + (row % 2) * 4 + 3; x < xr - 2; x += 8) {
			c.moveTo(x, yy + 1);
			c.lineTo(x + (x - cx) * 0.06, yy - 6);
		}
		c.stroke();
	}
	c.globalAlpha = 1;
	c.restore();
	hatch(c, shape, {
		angle: 1.1,
		gap: 3.4,
		alpha: 0.75,
		weight: (x, yy) => smooth(0.15, -0.9, (x - cx - lean * ((y - yy) / height)) / (half + flare)),
	});
	ink(c, shape, null, 3);
	// Eave shadow line and finial
	c.lineWidth = 4;
	c.beginPath();
	trace(c, eave, false);
	c.stroke();
	c.lineWidth = 2;
	c.beginPath();
	c.moveTo(tip[0], tip[1]);
	c.quadraticCurveTo(tip[0] + 3, tip[1] - 14, tip[0] + lean * 0.2 + 1, tip[1] - 26);
	c.stroke();
	c.beginPath();
	c.arc(tip[0] + 1.5, tip[1] - 12, 2.6, 0, Math.PI * 2);
	c.fillStyle = INK;
	c.fill();
	return shape;
};

const battlements = (c: Ctx, x0: number, x1: number, y: number, merlon = 13, gap = 9, height = 14) => {
	for (let x = x0; x < x1 - merlon * 0.6; x += merlon + gap) {
		const right = Math.min(x + merlon, x1);
		const shape = rough(
			[
				[x, y + 2],
				[x, y - height],
				[right, y - height + between(-1.5, 1.5)],
				[right, y + 2],
			],
			0.7,
			5,
		);

		ink(c, shape, mix(STONE.base, STONE.lit, smooth(500, 1100, x) * 0.7), 2.4);
	}
};

const flag = (c: Ctx, x: number, y: number) => {
	c.lineWidth = 2.2;
	c.strokeStyle = INK;
	c.beginPath();
	c.moveTo(x, y);
	c.lineTo(x - 1, y - 78);
	c.stroke();
	const cloth = rough(
		[
			[x - 1, y - 76],
			[x + 40, y - 70],
			[x + 30, y - 64],
			[x + 46, y - 58],
			[x + 24, y - 54],
			[x + 34, y - 46],
			[x - 1, y - 50],
		],
		1.2,
		6,
	);

	ink(c, cloth, "#5b1d22", 2);
	hatch(c, cloth, { angle: 1.4, gap: 3, alpha: 0.6, weight: (_, yy) => smooth(y - 64, y - 48, yy) });
};

/** The tower a tentacle has burst out of: a jagged, cracked top */
const BROKEN: Tower = {
	x: 950,
	w: 88,
	top: 315,
	base: 640,
	seed: 307,
	windows: [
		[0.3, true],
		[0.58, false],
	],
};
const brokenTop = (): P[] => {
	const { x, top } = BROKEN;

	return [
		[x - 41, top + 30],
		[x - 36, top + 4],
		[x - 26, top + 16],
		[x - 18, top - 10],
		[x - 9, top + 12],
		[x + 2, top - 4],
		[x + 9, top + 18],
		[x + 20, top - 16],
		[x + 30, top + 8],
		[x + 41, top + 26],
	];
};

const paintBrokenTower = (c: Ctx) => {
	const shape = towerBody(c, BROKEN, brokenTop());

	seed(311);
	// Cracks running down from the wound
	c.strokeStyle = INK;
	for (let i = 0; i < 6; i++) {
		let x = BROKEN.x + between(-34, 34);
		let y = BROKEN.top + between(0, 20);

		c.lineWidth = 1.8;
		c.beginPath();
		c.moveTo(x, y);
		for (let j = 0; j < 7; j++) {
			x += between(-7, 7);
			y += between(6, 16);
			c.lineTo(x, y);
		}
		c.stroke();
	}
	return shape;
};

/** The gate, its portcullis raised just enough for something to come out */
const paintGate = (c: Ctx) => {
	const gate: P[] = [[766, 672]];

	for (let i = 0; i <= 10; i++) {
		const a = Math.PI + (i / 10) * Math.PI;

		gate.push([790 + Math.cos(a) * 24, 628 + Math.sin(a) * 30]);
	}
	gate.push([814, 672]);
	const gateLight = c.createLinearGradient(0, 598, 0, 672);

	gateLight.addColorStop(0, "#0a0c09");
	gateLight.addColorStop(1, "#5c8a3c");
	ink(c, gate, gateLight, 3.4);
	c.strokeStyle = INK;
	c.lineWidth = 2;
	c.beginPath();
	for (let x = 772; x <= 808; x += 9) {
		c.moveTo(x, 600);
		c.lineTo(x, 640);
	}
	for (let y = 610; y <= 640; y += 10) {
		c.moveTo(767, y);
		c.lineTo(813, y);
	}
	c.stroke();
	// The portcullis teeth
	for (let x = 772; x <= 808; x += 9) {
		ink(
			c,
			[
				[x - 2.5, 640],
				[x + 2.5, 640],
				[x, 650],
			],
			INK,
			0,
		);
	}
};

const paintCastle = (c: Ctx) => {
	windows.length = 0;

	// Left inner tower, behind the keep
	const inner: Tower = { x: 652, w: 54, top: 340, base: 615, lean: -6, seed: 101, windows: [[0.25, true], [0.62, true]] };

	towerBody(c, inner);
	coneRoof(c, inner.x + (inner.lean ?? 0), inner.top, inner.w / 2 * 0.93, 160, -10, 9);

	// Central spire, rising out of the keep's roof
	const spire: Tower = { x: 790, w: 54, top: 232, base: 385, seed: 103, windows: [[0.45, true]] };

	towerBody(c, spire);
	coneRoof(c, spire.x, spire.top, spire.w / 2 * 0.93, 182, 3, 7);

	// The keep: a gothic hall with buttresses and a rose window
	seed(105);
	const hall = rough(
		[
			[700, 600],
			[700, 382],
			[880, 382],
			[880, 600],
		],
		1,
	);
	const across = (x: number) => (x - 700) / 180;

	ink(c, hall, STONE.base, 0);
	c.save();
	trace(c, hall);
	c.clip();
	c.fillStyle = STONE.lit;
	c.fillRect(848, 370, 50, 240);
	c.restore();
	masonry(c, hall, (x) => smooth(0.78, 0.85, across(x)));
	hatch(c, hall, { angle: 1.2, gap: 3.6, alpha: 0.7, weight: (x) => smooth(0.7, 0.1, across(x)) });
	hatch(c, hall, { angle: -0.3, gap: 4.6, alpha: 0.5, weight: (x) => smooth(0.3, 0, across(x)) });
	ink(c, hall, null, 3.2);

	const gable = rough(
		[
			[688, 388],
			[790, 262],
			[892, 388],
		],
		0.8,
		6,
	);

	ink(c, gable, ROOF.base, 0);
	c.save();
	trace(c, gable);
	c.clip();
	c.fillStyle = ROOF.lit;
	c.beginPath();
	c.moveTo(790, 255);
	c.lineTo(830, 395);
	c.lineTo(900, 395);
	c.fill();
	c.restore();
	hatch(c, gable, { angle: 1.15, gap: 3.4, alpha: 0.75, weight: (x) => smooth(800, 690, x) });
	hatch(c, gable, { angle: -0.6, gap: 6, alpha: 0.35 });
	ink(c, gable, null, 3);

	// Rose window and two lancets
	const rose = { x: 790, y: 448, r: 30 };
	const glass = c.createRadialGradient(rose.x, rose.y, 2, rose.x, rose.y, rose.r);

	glass.addColorStop(0, "#f4ffd2");
	glass.addColorStop(1, "#8fc456");
	ink(c, roughCircle(rose.x, rose.y, rose.r, 0.8), glass, 3);
	c.lineWidth = 2.2;
	c.beginPath();
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;

		c.moveTo(rose.x + Math.cos(a) * 8, rose.y + Math.sin(a) * 8);
		c.lineTo(rose.x + Math.cos(a) * rose.r, rose.y + Math.sin(a) * rose.r);
	}
	c.stroke();
	c.beginPath();
	c.arc(rose.x, rose.y, 8, 0, Math.PI * 2);
	c.stroke();
	c.beginPath();
	c.arc(rose.x, rose.y, rose.r + 6, 0, Math.PI * 2);
	c.lineWidth = 3;
	c.stroke();
	windows.push({ x: rose.x, y: rose.y, w: rose.r * 2, h: rose.r * 2, lit: true, big: true });
	archWindow(c, 735, 500, 13, 58, true);
	archWindow(c, 845, 500, 13, 58, false);

	// Buttresses with pinnacles
	for (const x of [700, 880]) {
		const pillar = rough(
			[
				[x - 9, 600],
				[x - 7, 372],
				[x, 336],
				[x + 7, 372],
				[x + 9, 600],
			],
			0.8,
			6,
		);

		ink(c, pillar, x > 800 ? STONE.lit : STONE.dark, 2.6);
		hatch(c, pillar, { angle: 1.2, gap: 3, alpha: 0.6, weight: () => (x > 800 ? 0.25 : 0.9) });
		ink(c, pillar, null, 2.6);
	}

	// The broken tower on the right of the keep, with a bartizan clinging to it
	paintBrokenTower(c);
	seed(331);
	const bartizan: Tower = { x: 896, w: 24, top: 430, base: 470, seed: 333 };

	towerBody(c, bartizan);
	ink(
		c,
		rough(
			[
				[884, 470],
				[908, 470],
				[898, 498],
			],
			0.6,
			5,
		),
		STONE.dark,
		2.4,
	);
	coneRoof(c, bartizan.x, bartizan.top, 12, 42, -2, 5);

	// Curtain wall, battlements and gate
	seed(201);
	const wall = rough(
		[
			[598, 672],
			[598, 582],
			[1052, 582],
			[1052, 676],
		],
		1.2,
	);

	ink(c, wall, STONE.base, 0);
	masonry(c, wall, (x) => smooth(900, 1050, x) * 0.6);
	hatch(c, wall, { angle: 1.25, gap: 3.6, alpha: 0.65, weight: (x, y) => smooth(940, 600, x) * 0.7 + smooth(600, 660, y) * 0.5 });
	ink(c, wall, null, 3.2);
	battlements(c, 600, 1050, 584);
	for (const x of [655, 712, 870, 1010]) {
		c.fillStyle = INK;
		c.fillRect(x - 2.5, 604, 5, 22);
	}

	paintGate(c);
	windows.push({ x: 790, y: 660, w: 48, h: 24, lit: true, big: true });

	// Front left tower: battlements on a corbelled crown, and a tattered banner
	const left: Tower = { x: 585, w: 76, top: 440, base: 672, lean: -3, seed: 109, windows: [[0.3, false], [0.62, true]] };

	towerBody(c, left);
	const crownX = centerAt(left, left.top);
	const crown = rough(
		[
			[crownX - 46, left.top + 2],
			[crownX - 46, left.top - 22],
			[crownX + 46, left.top - 22],
			[crownX + 46, left.top + 2],
		],
		0.9,
		6,
	);

	ink(c, crown, STONE.base, 0);
	c.save();
	trace(c, crown);
	c.clip();
	c.fillStyle = STONE.lit;
	c.fillRect(crownX + 14, left.top - 30, 40, 40);
	c.restore();
	hatch(c, crown, { angle: 1.2, gap: 3.4, alpha: 0.7, weight: (x) => smooth(crownX + 10, crownX - 40, x) });
	ink(c, crown, null, 3);
	for (let x = crownX - 42; x < crownX + 42; x += 11) {
		ink(
			c,
			[
				[x, left.top + 2],
				[x + 8, left.top + 2],
				[x + 4, left.top + 13],
			],
			STONE.dark,
			1.8,
		);
	}
	battlements(c, crownX - 46, crownX + 46, left.top - 22, 12, 8, 14);
	flag(c, crownX + 2, left.top - 34);

	// Front right tower: crooked and leaning away
	const right: Tower = { x: 1055, w: 64, top: 455, base: 676, lean: 10, seed: 111, windows: [[0.35, true], [0.7, false]] };

	towerBody(c, right);
	coneRoof(c, right.x + 10, right.top, right.w / 2 * 0.93, 124, 22, 9);

	CASTLE.left = left;
	CASTLE.right = right;
};

const CASTLE: { left?: Tower; right?: Tower } = {};

// ---------------------------------------------------------------- the crag

const HILL_TOP: P[] = [
	[-60, 1010],
	[50, 930],
	[160, 868],
	[250, 826],
	[330, 776],
	[398, 742],
	[452, 704],
	[500, 676],
	[540, 656],
	[572, 648],
	[640, 652],
	[700, 646],
	[780, 652],
	[860, 645],
	[940, 652],
	[1010, 656],
	[1070, 660],
	[1104, 674],
	[1126, 706],
	[1140, 744],
	[1176, 772],
	[1226, 800],
	[1300, 842],
	[1380, 884],
	[1470, 934],
	[1560, 990],
	[1660, 1040],
];

const paintHill = (c: Ctx) => {
	seed(501);
	const edge = rough(HILL_TOP, 4, 9, false);
	const shape: P[] = [...edge, [1660, 1120], [-60, 1120]];

	ink(c, shape, "#171614", 0);
	c.save();
	trace(c, shape);
	c.clip();
	// Upright prisms of rock, so the crag reads as cliffs rather than rubble; nearer (lower) ones
	// overlap farther ones, and each has a lit face toward the moon and a hatched one away from it
	const rocks: P[] = [];

	for (let i = 0; i < 260; i++) {
		const point: P = [between(-40, 1640), between(650, 1000)];

		if (inside(point, shape)) {
			rocks.push(point);
		}
	}
	rocks.sort((a, b) => a[1] - b[1]);
	for (const [x, y] of rocks) {
		const size = between(20, 46) * (1 + (y - 640) / 450);
		const a = between(-0.22, 0.22);
		const ridge = between(-0.05, 0.2);
		const at = ([u, v]: P): P => [x + (u * Math.cos(a) - v * Math.sin(a)) * size, y + (u * Math.sin(a) + v * Math.cos(a)) * size];
		const outlineShape = (
			[
				[-between(0.6, 0.8), between(0.7, 1)],
				[-between(0.65, 0.85), -between(0.2, 0.45)],
				[ridge - between(0.1, 0.3), -between(0.6, 0.8)],
				[between(0.5, 0.8), -between(0.35, 0.6)],
				[between(0.6, 0.8), between(0.7, 1)],
			] as P[]
		).map(at);
		const face = [outlineShape[2], outlineShape[3], outlineShape[4], at([ridge + 0.15, 1]), at([ridge + 0.05, -0.3])];
		const light = clamp(1 - (y - 650) / 260) * (0.3 + 0.7 * clamp(1 - Math.abs(x - 980) / 650)) * between(0.5, 1);
		const rock = rough(outlineShape, 1, 7);

		ink(c, rock, "#131210", 0);
		ink(c, rough(face, 0.8, 7), mix("#22221d", "#5b5d4b", light), 0);
		hatch(c, rock, { angle: 1.15, gap: 3, alpha: 0.75, weight: (hx) => (hx < at([ridge, 0])[0] ? 0.95 : 0.15) });
		c.strokeStyle = INK;
		c.lineWidth = 1.8;
		trace(c, rock);
		c.stroke();
		c.lineWidth = 1.3;
		trace(c, [face[0], face[4], face[3]], false);
		c.stroke();
		c.strokeStyle = `rgba(170, 176, 136, ${light * 0.7})`;
		c.beginPath();
		c.moveTo(face[0][0] + 1, face[0][1] + 2);
		c.lineTo(face[1][0] - 1, face[1][1] + 2);
		c.stroke();
	}
	// Cracks
	c.strokeStyle = INK;
	for (let i = 0; i < 26; i++) {
		let x = between(150, 1450);
		let y = between(660, 900);
		let angle = between(1.1, 2);

		c.lineWidth = between(1.2, 2.4);
		c.beginPath();
		c.moveTo(x, y);
		for (let j = 0, steps = Math.floor(between(4, 11)); j < steps; j++) {
			angle += between(-0.5, 0.5);
			x += Math.cos(angle) * between(8, 18);
			y += Math.sin(angle) * between(8, 18);
			c.lineTo(x, y);
		}
		c.stroke();
	}
	// A few cracks lit from below, by whatever lives under the crag
	c.lineCap = "round";
	for (let i = 0; i < 5; i++) {
		let x = between(430, 1180);
		let y = between(690, 860);
		const crack: P[] = [[x, y]];

		for (let j = 0; j < 8; j++) {
			x += between(-9, 9);
			y += between(6, 13);
			crack.push([x, y]);
		}
		for (const [width, color] of [
			[9, "rgba(140, 210, 90, 0.1)"],
			[4.5, "rgba(160, 225, 100, 0.3)"],
			[1.6, "#d8f7a4"],
		] as const) {
			trace(c, crack, false);
			c.strokeStyle = color;
			c.lineWidth = width;
			c.stroke();
		}
	}
	c.restore();

	hatch(c, shape, {
		angle: 1.05,
		gap: 3.8,
		alpha: 0.7,
		weight: (x, y) => smooth(660, 960, y) * (x < 980 ? 1 : 0.75) + smooth(400, 100, x) * 0.4,
	});
	hatch(c, shape, { angle: -0.45, gap: 4.4, alpha: 0.6, weight: (x, y) => smooth(800, 1000, y) + smooth(300, 0, x) * 0.5 });

	const depth = c.createLinearGradient(0, 700, 0, 1000);

	depth.addColorStop(0, "rgba(6, 6, 5, 0)");
	depth.addColorStop(1, "rgba(6, 6, 5, 0.7)");
	c.fillStyle = depth;
	trace(c, shape);
	c.fill();

	c.save();
	trace(c, shape);
	c.clip();
	trace(c, edge, false);
	c.strokeStyle = moonLight(c, "#a1a782", "#353a2f", 3.5);
	c.lineWidth = 2.4;
	c.translate(0, 3);
	c.stroke();
	c.restore();
	ink(c, edge, null, 4, false);
};

/** Rocks that close over where a tentacle comes out of the ground */
const lip = (c: Ctx, x: number, y: number, width: number, seedValue: number) => {
	seed(seedValue);
	for (let i = 0; i < 4; i++) {
		const cx = x + between(-0.5, 0.5) * width;
		const cy = y + between(4, 16);
		const size = between(0.25, 0.42) * width;
		const rock = rough(
			[
				[cx - size, cy + size * 0.5],
				[cx - size * 0.7, cy - size * 0.3],
				[cx - size * 0.1, cy - size * 0.55],
				[cx + size * 0.8, cy - size * 0.2],
				[cx + size, cy + size * 0.6],
			],
			1.1,
			6,
		);

		ink(c, rock, mix("#24221d", "#4a4a3d", between(0.2, 0.7)), 2.6);
		hatch(c, rock, { angle: 1.1, gap: 3.2, alpha: 0.7, weight: (xx, yy) => smooth(cy - size * 0.2, cy + size * 0.6, yy) + smooth(cx, cx - size, xx) * 0.5 });
		ink(c, rock, null, 2.6);
	}
};

// ---------------------------------------------------------------- foreground

const branch = (c: Ctx, x: number, y: number, angle: number, length: number, width: number, depth: number) => {
	const bend = between(-0.35, 0.35);
	const mx = x + Math.cos(angle + bend) * length * 0.5;
	const my = y + Math.sin(angle + bend) * length * 0.5;
	const ex = x + Math.cos(angle) * length;
	const ey = y + Math.sin(angle) * length;
	const nx = -Math.sin(angle);
	const ny = Math.cos(angle);
	const end = width * 0.62;
	const shape: P[] = [
		[x + (nx * width) / 2, y + (ny * width) / 2],
		[mx + (nx * (width + end)) / 4, my + (ny * (width + end)) / 4],
		[ex + (nx * end) / 2, ey + (ny * end) / 2],
		[ex - (nx * end) / 2, ey - (ny * end) / 2],
		[mx - (nx * (width + end)) / 4, my - (ny * (width + end)) / 4],
		[x - (nx * width) / 2, y - (ny * width) / 2],
	];

	ink(c, shape, "#0d0c0b", Math.max(1, Math.min(2.4, width * 0.3)));
	if (width > 6) {
		c.strokeStyle = "rgba(120, 132, 104, 0.4)";
		c.lineWidth = 1.2;
		c.beginPath();
		c.moveTo(shape[3][0] + 1, shape[3][1]);
		c.lineTo(shape[4][0] + 1, shape[4][1]);
		c.lineTo(shape[5][0] + 1, shape[5][1]);
		c.stroke();
	}
	if (depth <= 0 || width < 1.2) {
		return;
	}
	const children = depth > 4 ? 2 : Math.floor(between(2, 4));

	for (let i = 0; i < children; i++) {
		branch(
			c,
			ex,
			ey,
			angle + between(-0.9, 0.9) + (i - (children - 1) / 2) * 0.35,
			length * between(0.6, 0.82),
			end * between(0.7, 0.95),
			depth - 1,
		);
	}
};

const gravestone = (c: Ctx, x: number, y: number, w: number, h: number, tilt: number, cross: boolean) => {
	const cos = Math.cos(tilt);
	const sin = Math.sin(tilt);
	const at = (u: number, v: number): P => [x + u * cos - v * sin, y + u * sin + v * cos];
	let shape: P[];

	if (cross) {
		const t = w * 0.18;

		shape = [
			at(-t, 0),
			at(-t, -h * 0.62),
			at(-w / 2, -h * 0.62),
			at(-w / 2, -h * 0.62 - t * 2),
			at(-t, -h * 0.62 - t * 2),
			at(-t, -h),
			at(t, -h),
			at(t, -h * 0.62 - t * 2),
			at(w / 2, -h * 0.62 - t * 2),
			at(w / 2, -h * 0.62),
			at(t, -h * 0.62),
			at(t, 0),
		];
	} else {
		shape = [at(-w / 2, 0), at(-w / 2, -h + w / 2)];
		for (let i = 1; i < 8; i++) {
			const a = Math.PI + (i / 8) * Math.PI;

			shape.push(at(Math.cos(a) * (w / 2), -h + w / 2 + Math.sin(a) * (w / 2)));
		}
		shape.push(at(w / 2, -h + w / 2), at(w / 2, 0));
	}
	shape = rough(shape, 1, 5);
	ink(c, shape, "#24251f", 2.6);
	hatch(c, shape, { angle: 1.2, gap: 3, alpha: 0.8, weight: (xx) => smooth(x + w * 0.2, x - w * 0.5, xx) + 0.25 });
	ink(c, shape, null, 2.6);
};

const paintFore = (c: Ctx) => {
	// The broken tower's jagged mouth, again, in front of the tentacle that comes out of it
	c.save();
	c.beginPath();
	c.rect(BROKEN.x - 70, BROKEN.top - 40, 140, 88);
	c.clip();
	const known = windows.length;

	paintBrokenTower(c);
	windows.length = known;
	c.restore();
	// The portcullis, over the tentacle that slides out under it
	c.save();
	c.beginPath();
	c.rect(760, 590, 60, 61);
	c.clip();
	paintGate(c);
	c.restore();
	lip(c, 512, 690, 70, 621);
	lip(c, 1150, 726, 74, 623);

	seed(701);
	const mound: P[] = [[-80, 1100]];

	for (let x = -80; x <= W + 80; x += 24) {
		mound.push([x, 966 - Math.sin((x / W) * Math.PI) * 20 + (fbm(x * 0.01, 3) - 0.5) * 30]);
	}
	mound.push([W + 80, 1100]);
	const ground = rough(mound, 2, 8);

	ink(c, ground, "#0f0e0c", 0);
	hatch(c, ground, { angle: 1.1, gap: 3.4, alpha: 0.8 });
	trace(c, ground.slice(1, -1), false);
	c.strokeStyle = "rgba(110, 124, 96, 0.5)";
	c.lineWidth = 2;
	c.stroke();
	ink(c, ground.slice(1, -1), null, 3.4, false);

	seed(709);
	gravestone(c, 1035, 942, 34, 62, 0.12, false);
	gravestone(c, 1100, 950, 30, 74, -0.16, true);
	gravestone(c, 1168, 946, 28, 48, 0.24, false);
	gravestone(c, 348, 950, 26, 40, -0.2, false);

	seed(733);
	branch(c, 150, 1010, -1.45, 190, 34, 6);
	branch(c, 168, 960, -0.55, 120, 16, 4);
};

// ---------------------------------------------------------------- tentacles

type Point = { x: number; y: number; d: number };
type Style = { body: string; belly: string; sucker: string; hole: string; rim: string; ink: number; suckers: boolean };

const FLESH: Style = { body: "#3f1b28", belly: "#6e4040", sucker: "#bd9784", hole: "#341620", rim: "#a0646a", ink: 3, suckers: true };
const NEAR: Style = { body: "#211017", belly: "#3e2427", sucker: "#7a5e54", hole: "#1d0b10", rim: "#64403f", ink: 3.6, suckers: true };
const GIANT: Style = { body: "#191417", belly: "#211a1c", sucker: "#3d3532", hole: "#120d0f", rim: "#56664f", ink: 3, suckers: true };
const BEHIND: Style = { body: "#301722", belly: "#4f3133", sucker: "#000", hole: "#000", rim: "#6e4448", ink: 3, suckers: false };

type Chain = { curl: number; sway: number; speed: number; phase: number; wave: number };

/** A free arm: each segment turns a bit more than the last, so the tip rolls into a curl */
const chain = (x: number, y: number, angle: number, length: number, count: number, t: number, o: Chain, from: Point[] = []) => {
	const points = from.length ? from : [{ x, y, d: 1 }];
	let a = angle;

	for (let i = 1; i <= count; i++) {
		const u = i / count;

		a += ((o.curl * u ** 2.2 + o.sway * Math.sin(t * o.speed + o.phase - u * o.wave) * (0.25 + u)) * 6) / count;
		const step = (length / count) * (1.3 - 0.75 * u);

		x += Math.cos(a) * step;
		y += Math.sin(a) * step;
		points.push({ x, y, d: 1 });
	}
	return points;
};

type Coil = {
	from: P;
	tower: Tower;
	radius: number;
	low: number;
	high: number;
	turns: number;
	tail: number;
	tailChain: Chain;
};

/** An arm that comes out of the rock, winds around a tower and lets its tip wave free */
const coil = (o: Coil, t: number) => {
	const points: Point[] = [];
	const start = o.turns > 0 ? Math.PI : 0;
	const startX = centerAt(o.tower, o.low) + Math.cos(start) * o.radius;

	for (let i = 0; i <= 14; i++) {
		const u = i / 14;
		const control: P = [o.from[0] + (startX - o.from[0]) * 0.2, o.low + 6];
		const x = (1 - u) ** 2 * o.from[0] + 2 * (1 - u) * u * control[0] + u * u * startX;
		const y = (1 - u) ** 2 * o.from[1] + 2 * (1 - u) * u * control[1] + u * u * o.low;

		points.push({ x: x + Math.sin(t * 0.7 + u * 3) * 2 * u, y, d: 1 });
	}
	const steps = Math.ceil(Math.abs(o.turns) * 34);

	for (let i = 1; i <= steps; i++) {
		const u = i / steps;
		const theta = start + o.turns * Math.PI * 2 * u + Math.sin(t * 0.6) * 0.06 * u;
		const y = o.low + (o.high - o.low) * u;
		const radius = o.radius * (1 + 0.05 * Math.sin(t * 1.3 + u * 7));
		const depth = Math.sin(theta);

		points.push({ x: centerAt(o.tower, y) + Math.cos(theta) * radius, y: y - radius * 0.22 * depth, d: depth });
	}
	const [a, b] = points.slice(-2);
	const tail = chain(b.x, b.y, Math.atan2(b.y - a.y, b.x - a.x), o.tail, 34, t, o.tailChain, points);

	return tail;
};

type Arm = {
	id: number;
	layer: "giant" | "castle" | "fore";
	style: Style;
	base: number;
	tip?: number;
	belly: 1 | -1;
	spine: (t: number) => Point[];
};

const ARMS: Arm[] = [
	// Giants behind the hills, silhouetted against the sky
	{
		id: 1,
		layer: "giant",
		style: GIANT,
		base: 92,
		belly: 1,
		spine: (t) => chain(250, 880, -1.3, 560, 70, t, { curl: 2.1, sway: 0.18, speed: 0.22, phase: 0, wave: 3 }),
	},
	{
		id: 2,
		layer: "giant",
		style: GIANT,
		base: 104,
		belly: -1,
		spine: (t) => chain(1380, 900, -1.78, 840, 70, t, { curl: -1.35, sway: 0.16, speed: 0.19, phase: 2, wave: 3 }),
	},
	// Bursting from the broken tower, right across the moon
	{
		id: 3,
		layer: "castle",
		style: FLESH,
		base: 58,
		belly: -1,
		spine: (t) => chain(BROKEN.x - 2, BROKEN.top + 34, -1.5, 360, 64, t, { curl: -3.1, sway: 0.3, speed: 0.55, phase: 1, wave: 4 }),
	},
	// Out of the gate and down the crag
	{
		id: 4,
		layer: "castle",
		style: FLESH,
		base: 34,
		belly: 1,
		spine: (t) => chain(790, 636, 1.75, 270, 40, t, { curl: 2.2, sway: 0.4, speed: 0.8, phase: 4, wave: 4.5 }),
	},
	// Wound around the two front towers
	{
		id: 5,
		layer: "castle",
		style: FLESH,
		base: 36,
		belly: -1,
		spine: (t) =>
			coil(
				{
					from: [512, 700],
					tower: CASTLE.left!,
					radius: 57,
					low: 640,
					high: 488,
					turns: 1.75,
					tail: 230,
					tailChain: { curl: -1.9, sway: 0.42, speed: 0.7, phase: 0.5, wave: 4 },
				},
				t,
			),
	},
	{
		id: 6,
		layer: "castle",
		style: FLESH,
		base: 34,
		belly: 1,
		spine: (t) =>
			coil(
				{
					from: [1150, 728],
					tower: CASTLE.right!,
					radius: 50,
					low: 652,
					high: 520,
					turns: -1.75,
					tail: 250,
					tailChain: { curl: 1.8, sway: 0.4, speed: 0.62, phase: 3, wave: 4 },
				},
				t,
			),
	},
	// In the foreground, framing it all
	{
		id: 7,
		layer: "fore",
		style: NEAR,
		base: 120,
		belly: -1,
		spine: (t) => chain(1600, 1110, -1.95, 720, 72, t, { curl: -1.6, sway: 0.2, speed: 0.33, phase: 2.5, wave: 3.4 }),
	},
	{
		id: 8,
		layer: "fore",
		style: NEAR,
		base: 72,
		belly: 1,
		spine: (t) => chain(440, 1090, -1.2, 400, 54, t, { curl: 1.7, sway: 0.28, speed: 0.45, phase: 5, wave: 3.6 }),
	},
];

type Edge = { x: number; y: number; nx: number; ny: number; w: number };

const outline = (edges: Edge[], from: number, to: number, grow: number, sideA = 1, sideB = -1): P[] => {
	const a: P[] = [];
	const b: P[] = [];

	for (let i = from; i <= to; i++) {
		const e = edges[i];
		const half = e.w / 2 + grow;

		a.push([e.x + e.nx * half * sideA, e.y + e.ny * half * sideA]);
		b.push([e.x + e.nx * half * sideB, e.y + e.ny * half * sideB]);
	}
	return [...a, ...b.reverse()];
};

const paintRun = (c: Ctx, arm: Arm, edges: Edge[], from: number, to: number, style: Style, tip: boolean) => {
	const belly = arm.belly;
	const black = outline(edges, from, to, style.ink * 0.5 + 0.6);

	if (tip) {
		const e = edges[to];
		const p = edges[to - 1];
		const len = Math.hypot(e.x - p.x, e.y - p.y) || 1;

		black.splice(to - from + 1, 0, [e.x + ((e.x - p.x) / len) * style.ink, e.y + ((e.y - p.y) / len) * style.ink]);
	}
	trace(c, black);
	c.fillStyle = INK;
	c.fill();
	trace(c, outline(edges, from, to, 0));
	c.fillStyle = style.body;
	c.fill();
	// Paler belly along the sucker side
	trace(c, outline(edges, from, to, -0.3, belly * 0.05, belly));
	c.fillStyle = style.belly;
	c.fill();

	// Hatching from the back edge, then wrinkles across
	c.beginPath();
	for (let i = from; i <= to; i++) {
		const e = edges[i];

		if (e.w < 4) {
			continue;
		}
		const half = e.w / 2;
		const length = e.w * (0.18 + 0.28 * hash(i, arm.id));

		c.moveTo(e.x - e.nx * half * belly, e.y - e.ny * half * belly);
		c.lineTo(e.x - e.nx * (half - length) * belly, e.y - e.ny * (half - length) * belly);
	}
	c.strokeStyle = INK;
	c.globalAlpha = 0.6;
	c.lineWidth = 1.1;
	c.stroke();
	c.beginPath();
	for (let i = from + 1; i <= to; i += 3) {
		const e = edges[i];

		if (e.w < 8) {
			continue;
		}
		const half = e.w / 2;
		const back = edges[Math.max(0, i - 1)];

		c.moveTo(e.x - e.nx * half * belly, e.y - e.ny * half * belly);
		c.quadraticCurveTo(
			(e.x + back.x) / 2 - e.nx * half * 0.2 * belly,
			(e.y + back.y) / 2 - e.ny * half * 0.2 * belly,
			e.x + e.nx * half * 0.4 * belly,
			e.y + e.ny * half * 0.4 * belly,
		);
	}
	c.globalAlpha = 0.35;
	c.stroke();
	// Moonlit ridge
	c.beginPath();
	for (let i = from; i <= to; i++) {
		const e = edges[i];
		const at = (e.w / 2) * 0.62;
		const x = e.x - e.nx * at * belly;
		const y = e.y - e.ny * at * belly;

		if (i === from) {
			c.moveTo(x, y);
		} else {
			c.lineTo(x, y);
		}
	}
	c.strokeStyle = style.rim;
	c.globalAlpha = 0.75;
	c.lineWidth = 1.8;
	c.stroke();
	c.globalAlpha = 1;

	if (!style.suckers) {
		return;
	}
	let travelled = 0;
	for (let i = from + 1; i <= to; i++) {
		const e = edges[i];
		const p = edges[i - 1];

		travelled += Math.hypot(e.x - p.x, e.y - p.y);
		const rx = e.w * 0.2;

		if (rx < 1.2 || travelled < rx * 2.5) {
			continue;
		}
		travelled = 0;
		const x = e.x + e.nx * (e.w / 2) * 0.82 * belly;
		const y = e.y + e.ny * (e.w / 2) * 0.82 * belly;
		const angle = Math.atan2(e.ny, e.nx) + Math.PI / 2;

		c.beginPath();
		c.ellipse(x, y, rx, rx * 0.7, angle, 0, Math.PI * 2);
		c.fillStyle = style.sucker;
		c.fill();
		c.lineWidth = Math.min(1.6, rx * 0.35);
		c.strokeStyle = INK;
		c.stroke();
		c.beginPath();
		c.ellipse(x + e.nx * rx * 0.15 * belly, y + e.ny * rx * 0.15 * belly, rx * 0.45, rx * 0.3, angle, 0, Math.PI * 2);
		c.fillStyle = style.hole;
		c.fill();
	}
};

const paintArm = (c: Ctx, arm: Arm, t: number, pass: "behind" | "front") => {
	const spine = arm.spine(t);
	const count = spine.length;
	const edges: Edge[] = spine.map((p, i) => {
		const a = spine[Math.max(0, i - 1)];
		const b = spine[Math.min(count - 1, i + 1)];
		const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		const u = i / (count - 1);

		return { x: p.x, y: p.y, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len, w: arm.base * (1 - u) ** 0.8 + 1.4 };
	});

	// Runs of segments in front of, or behind, what they wind around
	let start = 0;
	for (let i = 1; i < count; i++) {
		const front = spine[i - 1].d + spine[i].d >= 0;
		const nextFront = i + 1 < count ? spine[i].d + spine[i + 1].d >= 0 : !front;

		if (front !== nextFront || i === count - 1) {
			if (front === (pass === "front")) {
				paintRun(c, arm, edges, start, i, front ? arm.style : BEHIND, i === count - 1);
			}
			start = i;
		}
	}
};

// ---------------------------------------------------------------- fog, glows and spores

const makeFog = () => {
	const fog = document.createElement("canvas");
	const w = 640;
	const h = 120;

	fog.width = w;
	fog.height = h;
	const c = fog.getContext("2d")!;
	const image = c.createImageData(w, h);
	const field = (x: number, y: number) => fbm(x * 0.012, y * 0.04) * 0.7 + noise(x * 0.05, y * 0.12) * 0.3;

	for (let y = 0; y < h; y++) {
		const band = Math.sin((y / h) * Math.PI) ** 1.5;

		for (let x = 0; x < w; x++) {
			// Blend with a copy shifted by the width, so the strip tiles without a seam
			const value = (field(x, y) * (w - x) + field(x - w, y) * x) / w;
			const alpha = smooth(0.3, 0.85, value) * band;
			const index = (y * w + x) * 4;

			image.data[index] = 150;
			image.data[index + 1] = 172;
			image.data[index + 2] = 142;
			image.data[index + 3] = alpha * 255;
		}
	}
	c.putImageData(image, 0, 0);
	// Soften it; where filters are not supported the fog is just a little crisper
	const soft = layer(w, h);
	const sc = soft.getContext("2d")!;

	sc.filter = "blur(3px)";
	sc.drawImage(fog, 0, 0);
	sc.drawImage(fog, -w, 0);
	sc.drawImage(fog, w, 0);
	return soft;
};

const FOG_BANDS = [
	{ y: 650, h: 110, speed: 9, alpha: 0.26, scale: 1.2 },
	{ y: 780, h: 190, speed: -6, alpha: 0.3, scale: 1.7 },
	{ y: 900, h: 200, speed: 13, alpha: 0.26, scale: 2.1 },
];

type Spore = { x: number; y: number; vx: number; vy: number; size: number; born: number; life: number };

const spawnSpore = (t: number): Spore => ({
	x: 380 + Math.random() * 900,
	y: 640 + Math.random() * 320,
	vx: (Math.random() - 0.5) * 6,
	vy: -6 - Math.random() * 12,
	size: 0.8 + Math.random() * 1.8,
	born: t,
	life: 6 + Math.random() * 8,
});

// ---------------------------------------------------------------- mounting

const layer = (width: number, height: number) => {
	const canvas = document.createElement("canvas");

	canvas.width = width;
	canvas.height = height;
	return canvas;
};

export const mountCartoonCastle = (canvas: HTMLCanvasElement) => {
	const c = canvas.getContext("2d")!;
	const still = window.matchMedia("(prefers-reduced-motion: reduce)");
	const fog = makeFog();
	const spores: Spore[] = [];
	let layers: Record<"sky" | "far" | "world" | "fore" | "post", HTMLCanvasElement> | null = null;
	let scale = 1;
	let offsetX = 0;
	let offsetY = 0;
	let frame = 0;
	let last = 0;
	let nextFlash = 6 + Math.random() * 6;

	const paint = (width: number, height: number, painter: (c: Ctx) => void, scene = true) => {
		const canvas = layer(width, height);
		const lc = canvas.getContext("2d")!;

		if (scene) {
			lc.setTransform(scale, 0, 0, scale, offsetX, offsetY);
		}
		painter(lc);
		return canvas;
	};

	const resize = () => {
		const box = canvas.getBoundingClientRect();
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.round(box.width * ratio));
		const height = Math.max(1, Math.round(box.height * ratio));

		canvas.width = width;
		canvas.height = height;
		// Cover the screen, cropping around the castle and the moon rather than the middle
		scale = Math.max(width / W, height / H);
		offsetX = clamp(width / 2 - 850 * scale, width - W * scale, 0);
		offsetY = clamp(height / 2 - 400 * scale, height - H * scale, 0);

		const post = (lc: Ctx) => {
			const vignette = lc.createRadialGradient(width / 2, height * 0.42, Math.min(width, height) * 0.25, width / 2, height * 0.5, Math.hypot(width, height) * 0.62);

			vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
			vignette.addColorStop(0.6, "rgba(4, 3, 3, 0.45)");
			vignette.addColorStop(1, "rgba(4, 3, 3, 0.92)");
			lc.fillStyle = vignette;
			lc.fillRect(0, 0, width, height);
			// Paper grain
			const grain = layer(256, 256);
			const gc = grain.getContext("2d")!;
			const image = gc.createImageData(256, 256);

			for (let i = 0; i < image.data.length; i += 4) {
				const value = Math.random() < 0.5 ? 0 : 255;

				image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
				image.data[i + 3] = Math.random() * 22;
			}
			gc.putImageData(image, 0, 0);
			lc.fillStyle = lc.createPattern(grain, "repeat")!;
			lc.fillRect(0, 0, width, height);
		};

		layers = {
			sky: paint(width, height, paintSky),
			far: paint(width, height, paintFar),
			world: paint(width, height, (lc) => {
				paintCastle(lc);
				paintHill(lc);
			}),
			fore: paint(width, height, paintFore),
			post: paint(width, height, post, false),
		};
	};

	const draw = (t: number) => {
		if (!layers) {
			return;
		}
		const scene = () => c.setTransform(scale, 0, 0, scale, offsetX, offsetY);
		const screen = () => c.setTransform(1, 0, 0, 1, 0, 0);

		screen();
		c.drawImage(layers.sky, 0, 0);

		// Lightning: two quick pulses now and then, lighting the sky from within
		if (!still.matches) {
			if (t > nextFlash + 1) {
				nextFlash = t + 9 + Math.random() * 14;
			}
			const since = t - nextFlash;

			if (since > 0 && since < 1) {
				const pulse = Math.max(0, 1 - Math.abs(since - 0.08) * 14) + 0.7 * Math.max(0, 1 - Math.abs(since - 0.32) * 8);

				c.globalCompositeOperation = "lighter";
				c.fillStyle = `rgba(120, 150, 120, ${pulse * 0.18})`;
				c.fillRect(0, 0, canvas.width, canvas.height);
				c.globalCompositeOperation = "source-over";
			}
		}

		scene();
		for (const arm of ARMS) {
			if (arm.layer === "giant") {
				paintArm(c, arm, t, "front");
			}
		}
		screen();
		c.drawImage(layers.far, 0, 0);
		scene();
		for (const arm of ARMS) {
			if (arm.layer === "castle") {
				paintArm(c, arm, t, "behind");
			}
		}
		screen();
		c.drawImage(layers.world, 0, 0);
		scene();

		// Window glow, breathing and flickering
		c.globalCompositeOperation = "lighter";
		windows.forEach((w, i) => {
			const flicker = 0.7 + 0.2 * Math.sin(t * 1.3 + i * 2.1) + 0.1 * Math.sin(t * 7.7 + i * 5.3);
			const radius = w.big ? 70 : 34;
			const glow = c.createRadialGradient(w.x, w.y, 0, w.x, w.y, radius);

			glow.addColorStop(0, `rgba(170, 230, 110, ${0.32 * flicker})`);
			glow.addColorStop(1, "rgba(170, 230, 110, 0)");
			c.fillStyle = glow;
			c.fillRect(w.x - radius, w.y - radius, radius * 2, radius * 2);
		});
		c.globalCompositeOperation = "source-over";

		for (const arm of ARMS) {
			if (arm.layer === "castle") {
				paintArm(c, arm, t, "front");
			}
		}

		for (const band of FOG_BANDS) {
			const width = fog.width * band.scale * 2;
			const shift = (((t * band.speed) % width) + width) % width;

			c.globalAlpha = band.alpha;
			for (let x = -shift - width; x < W + width; x += width) {
				c.drawImage(fog, x, band.y - band.h / 2, width, band.h);
			}
		}
		c.globalAlpha = 1;

		screen();
		c.drawImage(layers.fore, 0, 0);
		scene();
		for (const arm of ARMS) {
			if (arm.layer === "fore") {
				paintArm(c, arm, t, "front");
			}
		}

		// Spores drifting up from the crag
		if (!still.matches) {
			while (spores.length < 70) {
				spores.push(spawnSpore(t - Math.random() * 10));
			}
			c.globalCompositeOperation = "lighter";
			spores.forEach((s, i) => {
				const age = t - s.born;

				if (age > s.life) {
					spores[i] = spawnSpore(t);
					return;
				}
				const fade = Math.sin((age / s.life) * Math.PI);
				const x = s.x + s.vx * age + Math.sin(age * 0.9 + i) * 8;
				const y = s.y + s.vy * age;

				c.fillStyle = `rgba(190, 240, 140, ${0.55 * fade})`;
				c.beginPath();
				c.arc(x, y, s.size, 0, Math.PI * 2);
				c.fill();
			});
			c.globalCompositeOperation = "source-over";
		}

		screen();
		c.drawImage(layers.post, 0, 0);
	};

	const loop = (now: number) => {
		frame = requestAnimationFrame(loop);
		// 30 frames a second is plenty for something this slow
		if (now - last < 32) {
			return;
		}
		last = now;
		draw(now / 1000);
	};

	let pending = 0;
	const onResize = () => {
		clearTimeout(pending);
		pending = window.setTimeout(() => {
			resize();
			if (still.matches) {
				draw(4);
			}
		}, 120);
	};

	const start = () => {
		cancelAnimationFrame(frame);
		if (still.matches) {
			draw(4);
		} else {
			frame = requestAnimationFrame(loop);
		}
	};

	resize();
	start();
	window.addEventListener("resize", onResize);
	still.addEventListener("change", start);
};
