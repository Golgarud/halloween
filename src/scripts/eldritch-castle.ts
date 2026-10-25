// Paints "The Drowned Keep": a black gothic castle on a crag, backlit by a pale moon through torn
// clouds, strangled and split open by wet, slow tentacles. No outlines: shapes are silhouettes,
// lit only along the edges that face the moon, over painted noise (clouds, moon, fog, grime).
// The still parts are painted once per resize into offscreen layers; the tentacles, fog, lights,
// ash, grain and the rare lightning are painted every frame.

type P = [number, number];
type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];

const W = 1600;
const H = 1000;
const MOON = { x: 920, y: 285, r: 178 };

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

/** Value noise; with a period it tiles, for textures that repeat */
const noise = (x: number, y: number, period = 0) => {
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

const fbm = (x: number, y: number, octaves = 5, period = 0) => {
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
const warped = (x: number, y: number, period = 0) => {
	const qx = fbm(x, y, 4, period);
	const qy = fbm(x + 5.2, y + 1.3, 4, period);

	return fbm(x + 1.9 * qx, y + 1.9 * qy, 5, period);
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (edge0: number, edge1: number, value: number) => {
	const t = clamp((value - edge0) / (edge1 - edge0));

	return t * t * (3 - 2 * t);
};
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;

/** How much a point sees of the moon: 1 on it, falling off with distance */
const moonSight = (x: number, y: number, reach = 420) => Math.exp(-Math.max(0, Math.hypot(x - MOON.x, y - MOON.y) - MOON.r) / reach);

// ---------------------------------------------------------------- shapes

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

/** Subdivides a shape and shakes it with noise, so stone edges are never ruler-straight */
const rough = (points: P[], amount: number, step = 6, closed = true): P[] => {
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
				x + (noise(x * 0.09, y * 0.09) - 0.5) * 2 * amount,
				y + (noise(x * 0.09 + 31.7, y * 0.09 + 11.3) - 0.5) * 2 * amount,
			]);
		}
	}
	if (!closed) {
		out.push(points.at(-1)!);
	}
	return out;
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

const layer = (width: number, height: number) => {
	const canvas = document.createElement("canvas");

	canvas.width = width;
	canvas.height = height;
	return canvas;
};

const paintPixels = (width: number, height: number, pixel: (u: number, v: number) => [number, number, number, number]) => {
	const canvas = layer(width, height);
	const c = canvas.getContext("2d")!;
	const image = c.createImageData(width, height);

	for (let v = 0; v < height; v++) {
		for (let u = 0; u < width; u++) {
			const [r, g, b, a] = pixel(u, v);
			const i = (v * width + u) * 4;

			image.data[i] = r;
			image.data[i + 1] = g;
			image.data[i + 2] = b;
			image.data[i + 3] = a;
		}
	}
	c.putImageData(image, 0, 0);
	return canvas;
};

// ---------------------------------------------------------------- textures, painted once

/** Torn clouds over the whole sky, opening around the moon and silvered where they face it */
const paintClouds = () => {
	const cw = 560;
	const ch = 350;
	const density = new Float32Array(cw * ch);

	for (let v = 0; v < ch; v++) {
		for (let u = 0; u < cw; u++) {
			const x = (u / cw) * W;
			const y = (v / ch) * H;
			const swirl = warped(x * 0.0031, y * 0.0072);
			const hole = Math.exp(-((Math.hypot(x - MOON.x, (y - MOON.y) * 1.2) / (MOON.r * 2.1)) ** 2));
			const threshold = 0.4 + 0.2 * smooth(40, 560, y) - 0.14 * smooth(600, 780, y) + 0.26 * hole;

			density[v * cw + u] = smooth(threshold, threshold + 0.2, swirl);
		}
	}
	const at = (u: number, v: number) => density[clamp(Math.round(v), 0, ch - 1) * cw + clamp(Math.round(u), 0, cw - 1)];
	const dark: Rgb = [9, 10, 9];
	const mid: Rgb = [43, 43, 35];
	const silver: Rgb = [222, 216, 188];
	const glow: Rgb = [140, 138, 114];

	return paintPixels(cw, ch, (u, v) => {
		const d = at(u, v);

		if (d <= 0.001) {
			return [0, 0, 0, 0];
		}
		const x = (u / cw) * W;
		const y = (v / ch) * H;
		const dx = MOON.x - x;
		const dy = MOON.y - y;
		const len = Math.hypot(dx, dy) || 1;
		const lu = ((dx / len) * cw) / W;
		const lv = ((dy / len) * ch) / H;
		const edge = clamp((d - at(u + lu * 3, v + lv * 3)) * 2.4);
		const shadow = at(u + lu * 9, v + lv * 9);
		const sight = moonSight(x, y, 260);
		let color = mixRgb(dark, mid, (0.15 + 0.6 * sight) * (1 - shadow * 0.6));

		color = mixRgb(color, glow, (1 - d) * sight * 0.5);
		color = mixRgb(color, silver, clamp(edge * sight ** 0.7 * 1.1));
		return [color[0], color[1], color[2], 255 * clamp(d * 1.15)];
	});
};

/** The moon's face: seas, speckled craters and a darker limb */
const paintMoonFace = () => {
	const size = 256;
	const light: Rgb = [232, 226, 204];
	const sea: Rgb = [138, 134, 114];

	return paintPixels(size, size, (u, v) => {
		const x = (u - size / 2) / (size / 2);
		const y = (v - size / 2) / (size / 2);
		const r = Math.hypot(x, y);

		if (r > 1) {
			return [0, 0, 0, 0];
		}
		const seas = smooth(0.46, 0.62, fbm(u * 0.016 + 3, v * 0.016 + 7, 5));
		const pits = noise(u * 0.16, v * 0.16) * 0.5 + noise(u * 0.4, v * 0.4) * 0.5;
		const limb = 0.5 + 0.5 * Math.sqrt(1 - r * r) ** 0.6;
		let color = mixRgb(light, sea, seas * 0.75);

		color = mixRgb(color, sea, smooth(0.62, 0.9, pits) * 0.35);
		color = color.map((value) => value * limb) as Rgb;
		return [color[0], color[1], color[2], 255 * clamp((1 - r) * size * 0.5)];
	});
};

/** A strip of fog that tiles horizontally */
const paintFog = (seedValue: number) => {
	const fw = 512;
	const fh = 128;
	const period = 4;

	return paintPixels(fw, fh, (u, v) => {
		const value = warped((u / fw) * period + seedValue, (v / fh) * 1.4 + seedValue, period);
		const band = Math.sin((v / fh) * Math.PI) ** 1.6;

		return [150, 152, 134, 255 * smooth(0.36, 0.78, value) * band];
	});
};

/** Grime for stone and earth: pale specks and dark stains, tiling */
const paintGrime = () => {
	const size = 256;

	return paintPixels(size, size, (u, v) => {
		const stain = fbm(u / 32, v / 32, 4, 8);
		const speck = hash(u, v);

		if (speck > 0.93) {
			return [140, 136, 112, 30 + speck * 40];
		}
		return stain < 0.5 ? [0, 0, 0, (0.5 - stain) * 300] : [120, 118, 96, (stain - 0.5) * 70];
	});
};

/** Blotches that knock holes in the moonlit rims */
const paintBreakup = () => {
	const size = 256;

	return paintPixels(size, size, (u, v) => [0, 0, 0, 255 * smooth(0.48, 0.66, fbm(u / 20, v / 20, 4, 12.8))]);
};

const paintGrain = (seedValue: number) => {
	seed(seedValue);
	return paintPixels(192, 192, () => {
		const value = rand() < 0.5 ? 0 : 255;

		return [value, value, value, rand() * 26];
	});
};

// ---------------------------------------------------------------- the castle, as geometry

type Tower = { x: number; w: number; top: number; base: number; lean: number };
type Win = { x: number; y: number; w: number; h: number; lit: boolean };

const centerAt = (t: Tower, y: number) => t.x + (t.lean * (t.base - y)) / (t.base - t.top);

const TOWERS = {
	front: { x: 530, w: 70, top: 420, base: 690, lean: -4 },
	needle: { x: 612, w: 46, top: 300, base: 620, lean: -3 },
	spire: { x: 790, w: 58, top: 214, base: 345, lean: 0 },
	broken: { x: 975, w: 86, top: 300, base: 650, lean: 0 },
	right: { x: 1085, w: 60, top: 432, base: 690, lean: 12 },
	small: { x: 1152, w: 34, top: 500, base: 680, lean: 4 },
} satisfies Record<string, Tower>;

const towerShape = (t: Tower): P[] => [
	[t.x - t.w / 2, t.base],
	[t.x + t.lean - t.w * 0.465, t.top],
	[t.x + t.lean + t.w * 0.465, t.top],
	[t.x + t.w / 2, t.base],
];

/** A roof that narrows into a needle, its sides hollowed, its tip drifting off true */
const coneShape = (cx: number, y: number, half: number, height: number, bend: number, flare = 7): P[] => {
	const tip: P = [cx + bend, y - height];
	const side = (from: P, control: P): P[] =>
		Array.from({ length: 16 }, (_, i) => {
			const t = i / 15;

			return [
				(1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t * t * tip[0],
				(1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t * t * tip[1],
			] as P;
		});
	const left = side([cx - half - flare, y + 4], [cx - half * 0.42 + bend * 0.15, y - height * 0.3]);
	const right = side([cx + half + flare, y + 4], [cx + half * 0.42 + bend * 0.15, y - height * 0.3]);

	return [...left, ...right.slice(0, -1).reverse()];
};

const merlons = (x0: number, x1: number, y: number, width = 11, gap = 8, height = 13): P[][] => {
	const out: P[][] = [];

	for (let x = x0; x < x1 - width * 0.5; x += width + gap) {
		out.push([
			[x, y + 2],
			[x, y - height],
			[Math.min(x + width, x1), y - height],
			[Math.min(x + width, x1), y + 2],
		]);
	}
	return out;
};

const pinnacle = (x: number, y: number, height: number, width: number): P[] => [
	[x - width / 2, y + 2],
	[x - width * 0.3, y - height * 0.35],
	[x, y - height],
	[x + width * 0.3, y - height * 0.35],
	[x + width / 2, y + 2],
];

const BROKEN_TOP: P[] = [
	[1018, 334],
	[1012, 304],
	[1001, 318],
	[992, 290],
	[984, 312],
	[972, 296],
	[962, 318],
	[951, 286],
	[943, 306],
	[932, 330],
];

/** The broken tower's walls, also painted again over the roots of what comes out of it */
const BROKEN_BODY = rough(
	[[TOWERS.broken.x - TOWERS.broken.w / 2, TOWERS.broken.base], ...[...BROKEN_TOP].reverse(), [TOWERS.broken.x + TOWERS.broken.w / 2, TOWERS.broken.base]],
	1.2,
	6,
);

type Castle = { shapes: P[][]; spikes: [P, P, number][]; faces: { shape: P[]; lit: number }[]; windows: Win[] };

const buildCastle = (): Castle => {
	seed(41);
	const shapes: P[][] = [];
	const spikes: [P, P, number][] = [];
	const faces: { shape: P[]; lit: number }[] = [];
	const windows: Win[] = [];
	const { front, needle, spire, broken, right, small } = TOWERS;
	/** The face of a tower that turns toward the moon */
	const litFace = (t: Tower) => {
		const toward = Math.sign(MOON.x - t.x) || 1;
		const near = t.x + toward * t.w * 0.12;
		const far = t.x + (toward * t.w) / 2;

		faces.push({
			shape: [
				[near, t.base],
				[near + t.lean, t.top - 2],
				[far + t.lean, t.top - 2],
				[far, t.base],
			],
			lit: moonSight(t.x, t.top),
		});
	};
	const addTower = (t: Tower, slits: [number, boolean][]) => {
		shapes.push(towerShape(t));
		litFace(t);
		for (const [at, lit] of slits) {
			const y = t.base - (t.base - t.top) * at;

			windows.push({ x: centerAt(t, y) + between(-3, 3), y, w: Math.max(5, t.w * 0.11), h: Math.max(14, t.w * 0.32), lit });
		}
	};
	const addCone = (cx: number, y: number, half: number, height: number, bend: number, flare = 7) => {
		const shape = coneShape(cx, y, half, height, bend, flare);
		const toward = Math.sign(MOON.x - cx) || 1;

		shapes.push(shape);
		faces.push({
			shape: shape.filter(([x]) => (x - cx) * toward > -half * 0.15 - Math.abs(bend)),
			lit: moonSight(cx, y - height / 2) * 0.8,
		});
		spikes.push([[cx + bend, y - height + 2], [cx + bend * 1.15, y - height - 26], 2]);
	};

	// Curtain wall, low and long, its crenels chipped
	shapes.push(rough([[492, 700], [492, 562], [1172, 562], [1172, 700]], 1));
	shapes.push(...merlons(492, 1172, 564).filter(() => rand() > 0.12));
	faces.push({ shape: [[492, 700], [492, 562], [1172, 562], [1172, 700]], lit: 0.25 });

	// Left: a squat front tower and a needle behind it, joined to the keep by a bridge
	addTower(needle, [[0.35, true], [0.7, false]]);
	addCone(needle.x + needle.lean, needle.top, needle.w * 0.47, 205, -14, 6);
	shapes.push(rough([[634, 418], [690, 418], [690, 444], [672, 446], [662, 456], [652, 446], [634, 444]], 0.5, 5));

	addTower(front, [[0.28, false], [0.6, true]]);
	const crown = centerAt(front, front.top);

	shapes.push([[crown - 44, front.top + 14], [crown - 44, front.top - 18], [crown + 44, front.top - 18], [crown + 44, front.top + 14]]);
	shapes.push(...merlons(crown - 44, crown + 44, front.top - 18, 10, 7, 12));
	addCone(crown, front.top - 30, 22, 120, -8, 4);
	spikes.push([[crown - 30, front.top - 28], [crown - 31, front.top - 92], 1.6]);

	// The keep: a steep hall with buttresses and a forest of pinnacles
	shapes.push(rough([[690, 640], [690, 345], [890, 345], [890, 640]], 0.8));
	faces.push({ shape: [[860, 640], [860, 345], [890, 345], [890, 640]], lit: 0.6 });
	shapes.push(rough([[680, 350], [790, 226], [900, 350]], 0.6));
	faces.push({ shape: [[790, 226], [900, 350], [830, 350]], lit: 0.75 });
	for (const [x, y, h] of [
		[690, 350, 70],
		[890, 350, 70],
		[736, 300, 40],
		[844, 300, 40],
		[760, 268, 26],
		[820, 268, 26],
	] as const) {
		shapes.push(pinnacle(x, y, h, x === 690 || x === 890 ? 14 : 9));
		spikes.push([[x, y - h], [x, y - h - 10], 1.2]);
	}
	for (const x of [690, 890]) {
		shapes.push([[x - 9, 640], [x - 7, 360], [x + 7, 360], [x + 9, 640]]);
	}
	for (const [x, lit] of [
		[728, true],
		[760, false],
		[820, false],
		[852, true],
	] as const) {
		windows.push({ x, y: 470, w: 9, h: 46, lit });
	}

	// The central spire, rising out of the roof and bending, slightly, wrong
	addTower(spire, [[0.5, true]]);
	addCone(spire.x, spire.top, spire.w * 0.47, 195, -22, 6);

	// Right: the broken tower, bridged to the keep, a bartizan clinging to its flank
	shapes.push(rough([[888, 408], [934, 408], [934, 434], [922, 436], [911, 450], [900, 436], [888, 434]], 0.5, 5));
	shapes.push(BROKEN_BODY);
	litFace({ ...broken, top: 330 });
	windows.push({ x: 975, y: 470, w: 9, h: 26, lit: false }, { x: 980, y: 560, w: 9, h: 26, lit: true });
	shapes.push([[922, 430], [940, 430], [940, 470], [931, 492], [922, 470]]);
	addCone(931, 430, 10, 46, -3, 4);

	addTower(right, [[0.4, true], [0.75, false]]);
	addCone(right.x + right.lean, right.top, right.w * 0.47, 140, 24, 8);
	addTower(small, [[0.5, false]]);
	addCone(small.x + small.lean, small.top, small.w * 0.47, 74, 8, 5);

	// Gate
	windows.push({ x: 800, y: 630, w: 36, h: 52, lit: false });
	return { shapes, spikes, faces, windows };
};

const CASTLE = buildCastle();

const HILL: P[] = [
	[300, 1120],
	[318, 1010],
	[346, 930],
	[372, 870],
	[384, 822],
	[414, 790],
	[428, 752],
	[452, 724],
	[470, 690],
	[492, 672],
	[560, 676],
	[640, 668],
	[720, 674],
	[800, 666],
	[880, 672],
	[960, 664],
	[1040, 672],
	[1120, 668],
	[1168, 676],
	[1192, 700],
	[1204, 736],
	[1232, 762],
	[1248, 806],
	[1272, 840],
	[1290, 900],
	[1318, 960],
	[1340, 1040],
	[1352, 1120],
]

// ---------------------------------------------------------------- silhouettes and their moonlit rims

const STONE = "#0b0b0c";

/**
 * Lights the edges of a silhouette that face the moon: the silhouette, minus itself shifted
 * toward the moon, leaves a sliver along those edges. Two directions, cross-faded either side of
 * the moon, and a falloff with distance from it.
 */
const rim = (
	target: Ctx,
	shape: HTMLCanvasElement,
	scene: () => void,
	passes: { width: number; color: string; alpha: number; blur: number }[],
	scale: number,
	breakup: HTMLCanvasElement,
) => {
	const scratch = layer(shape.width, shape.height);
	const s = scratch.getContext("2d")!;

	for (const side of [-1, 1]) {
		const [vx, vy] = [-side * 0.5, -0.87];

		for (const pass of passes) {
			s.setTransform(1, 0, 0, 1, 0, 0);
			s.globalCompositeOperation = "source-over";
			s.clearRect(0, 0, scratch.width, scratch.height);
			s.drawImage(shape, 0, 0);
			s.globalCompositeOperation = "source-in";
			s.fillStyle = pass.color;
			s.fillRect(0, 0, scratch.width, scratch.height);
			s.globalCompositeOperation = "destination-out";
			s.drawImage(shape, -vx * pass.width * scale, -vy * pass.width * scale);
			// Keep this side of the moon only, and fade with distance from it
			s.globalCompositeOperation = "destination-in";
			s.setTransform(target.getTransform());
			const across = s.createLinearGradient(MOON.x - 140, 0, MOON.x + 140, 0);

			across.addColorStop(0, side < 0 ? "#000" : "rgba(0,0,0,0)");
			across.addColorStop(1, side < 0 ? "rgba(0,0,0,0)" : "#000");
			s.fillStyle = across;
			s.fillRect(-400, -400, W + 800, H + 800);
			const fade = s.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.8, MOON.x, MOON.y, MOON.r * 5);

			fade.addColorStop(0, "#000");
			fade.addColorStop(1, "rgba(0,0,0,0.12)");
			s.fillStyle = fade;
			s.fillRect(-400, -400, W + 800, H + 800);
			// Light catches worn stone unevenly: break the sliver up
			s.setTransform(1, 0, 0, 1, 0, 0);
			s.globalCompositeOperation = "destination-out";
			s.fillStyle = s.createPattern(breakup, "repeat")!;
			s.fillRect(0, 0, scratch.width, scratch.height);

			target.save();
			target.setTransform(1, 0, 0, 1, 0, 0);
			target.globalCompositeOperation = "source-atop";
			target.globalAlpha = pass.alpha;
			target.filter = pass.blur ? `blur(${pass.blur * scale}px)` : "none";
			target.drawImage(scratch, 0, 0);
			target.restore();
		}
	}
	scene();
};

const grime = (target: Ctx, texture: HTMLCanvasElement, alpha: number) => {
	target.save();
	target.setTransform(1, 0, 0, 1, 0, 0);
	target.globalCompositeOperation = "source-atop";
	target.globalAlpha = alpha;
	target.fillStyle = target.createPattern(texture, "repeat")!;
	target.fillRect(0, 0, target.canvas.width, target.canvas.height);
	target.restore();
};

/** How much of a shape stands in front of the moon, and so is seen against the light, unlit */
const behind = (shape: P[]) => {
	const nearest = Math.min(...shape.map(([x, y]) => Math.hypot(x - MOON.x, y - MOON.y)));

	return clamp(1.6 - nearest / MOON.r);
};

const paintWorld = (c: Ctx, scene: () => void, scale: number, grimeTexture: HTMLCanvasElement, breakup: HTMLCanvasElement) => {
	// Silhouette
	c.fillStyle = STONE;
	for (const shape of CASTLE.shapes) {
		trace(c, shape);
		c.fill();
	}
	c.strokeStyle = STONE;
	c.lineCap = "round";
	for (const [[x0, y0], [x1, y1], width] of CASTLE.spikes) {
		c.lineWidth = width;
		c.beginPath();
		c.moveTo(x0, y0);
		c.lineTo(x1, y1);
		c.stroke();
		c.beginPath();
		c.arc(x0 + (x1 - x0) * 0.45, y0 + (y1 - y0) * 0.45, width * 1.4, 0, Math.PI * 2);
		c.fillStyle = STONE;
		c.fill();
	}
	c.save();
	c.globalCompositeOperation = "source-atop";
	// Faces that turn to the moon, barely: stone at night is nearly black
	for (const face of CASTLE.faces) {
		if (face.shape.length < 3) {
			continue;
		}
		const [, top] = face.shape.reduce((a, b) => (a[1] < b[1] ? a : b));
		const glow = c.createLinearGradient(0, top, 0, top + 300);

		glow.addColorStop(0, `rgba(66, 66, 56, ${0.16 * face.lit * (1 - behind(face.shape)) + 0.03})`);
		glow.addColorStop(1, `rgba(36, 36, 31, ${0.06 * face.lit * (1 - behind(face.shape))})`);
		c.fillStyle = glow;
		trace(c, face.shape);
		c.fill();
	}
	// Courses of stone, only where there is light to catch them
	seed(503);
	c.lineWidth = 0.9;
	for (const face of CASTLE.faces) {
		const xs = face.shape.map(([x]) => x);
		const ys = face.shape.map(([, y]) => y);
		const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

		c.save();
		trace(c, face.shape);
		c.clip();
		for (let y = y0 + 8; y < y1; y += between(9, 13)) {
			for (let x = x0 + between(-8, 0); x < x1; x += between(10, 22)) {
				if (rand() < 0.5) {
					continue;
				}
				c.strokeStyle = `rgba(0,0,0,${between(0.3, 0.6)})`;
				c.beginPath();
				c.moveTo(x, y);
				c.lineTo(x + between(5, 14), y + between(-0.5, 0.5));
				c.stroke();
				c.strokeStyle = `rgba(110,108,90,${0.18 * face.lit})`;
				c.beginPath();
				c.moveTo(x, y - 1.2);
				c.lineTo(x + between(4, 10), y - 1.2);
				c.stroke();
			}
		}
		c.restore();
	}
	c.restore();

	// Veins: something has grown over the walls
	seed(509);
	c.save();
	c.globalCompositeOperation = "source-atop";
	for (let i = 0; i < 46; i++) {
		let x = between(500, 1170);
		let y = between(520, 690);
		let angle = -Math.PI / 2 + between(-0.6, 0.6);
		const points: P[] = [[x, y]];

		for (let j = 0, steps = Math.floor(between(8, 22)); j < steps; j++) {
			angle += between(-0.45, 0.45);
			x += Math.cos(angle) * 6;
			y += Math.sin(angle) * 6;
			points.push([x, y]);
		}
		const lit = moonSight(x, y, 300);

		trace(c, points, false);
		c.strokeStyle = "rgba(0,0,0,0.9)";
		c.lineWidth = between(1.4, 3);
		c.stroke();
		c.save();
		c.translate(Math.sign(MOON.x - x) * 0.8, -0.8);
		trace(c, points, false);
		c.strokeStyle = `rgba(170, 160, 140, ${0.1 + 0.35 * lit})`;
		c.lineWidth = 0.7;
		c.stroke();
		c.restore();
	}
	c.restore();

	// Breaches where feelers have pushed through the stone
	c.fillStyle = "#020202";
	for (const f of FEELERS) {
		if (f.breach) {
			trace(c, breachShape(f.x, f.y, f.width * 1.25));
			c.fill();
		}
	}

	// The crag: strata of rock, nearer slabs over farther ones, each catching a little moon on
	// its upper lip and throwing a black line of shadow under it
	seed(501);
	const hill = rough(HILL, 3.5, 7);

	c.fillStyle = "#090908";
	trace(c, hill);
	c.fill();
	c.save();
	trace(c, hill);
	c.clip();
	// Barely any detail: ledges catching the moon near the top, crevices running down
	seed(507);
	for (let i = 0; i < 260; i++) {
		const x = between(300, 1360);
		const y = between(668, 900);

		if (!inside([x, y], hill)) {
			continue;
		}
		const sight = moonSight(x, y, 300) * smooth(900, 680, y);
		const length = between(10, 40);
		const tilt = between(-0.25, 0.25);

		c.strokeStyle = `rgba(150, 146, 120, ${0.03 + 0.3 * sight})`;
		c.lineWidth = 1;
		c.beginPath();
		c.moveTo(x, y);
		c.lineTo(x + length, y + tilt * length);
		c.stroke();
		c.strokeStyle = "rgba(0, 0, 0, 0.8)";
		c.lineWidth = 2;
		c.beginPath();
		c.moveTo(x + 1, y + 2.5);
		c.lineTo(x + length - 1, y + tilt * length + 2.5);
		c.stroke();
	}
	for (let i = 0; i < 40; i++) {
		let x = between(380, 1300);
		let y = between(690, 820);

		if (!inside([x, y], hill)) {
			continue;
		}
		c.strokeStyle = "rgba(0, 0, 0, 0.7)";
		c.lineWidth = between(1, 2.4);
		c.beginPath();
		c.moveTo(x, y);
		for (let j = 0; j < 8; j++) {
			x += between(-5, 5);
			y += between(8, 18);
			c.lineTo(x, y);
		}
		c.stroke();
	}
	// The fog below lights the foot of the crag
	const uplight = c.createLinearGradient(0, 780, 0, 960);

	uplight.addColorStop(0, "rgba(70, 74, 62, 0)");
	uplight.addColorStop(1, "rgba(70, 74, 62, 0.22)");
	c.fillStyle = uplight;
	c.fillRect(-100, 700, W + 200, 400);
	c.restore();

	rim(
		c,
		c.canvas,
		scene,
		[
			{ width: 7, color: "#8d8c74", alpha: 0.22, blur: 2.5 },
			{ width: 1.8, color: "#e2dec2", alpha: 0.7, blur: 0 },
		],
		scale,
		breakup,
	);
	grime(c, grimeTexture, 0.55);

	// Windows: a few lit, dim and leaded; the rest are holes
	for (const w of CASTLE.windows) {
		const shape: P[] = [[w.x - w.w / 2, w.y + w.h / 2]];

		for (let i = 0; i <= 8; i++) {
			const a = Math.PI + (i / 8) * Math.PI;

			shape.push([w.x + Math.cos(a) * (w.w / 2), w.y - w.h / 2 + w.w / 2 + Math.sin(a) * w.w * 0.8]);
		}
		shape.push([w.x + w.w / 2, w.y + w.h / 2]);
		if (!w.lit) {
			c.fillStyle = "#020202";
			trace(c, shape);
			c.fill();
			continue;
		}
		const light = c.createLinearGradient(0, w.y - w.h / 2, 0, w.y + w.h / 2);

		light.addColorStop(0, "#5c4a24");
		light.addColorStop(0.55, "#b39552");
		light.addColorStop(1, "#d9c27e");
		c.fillStyle = light;
		trace(c, shape);
		c.fill();
		c.save();
		trace(c, shape);
		c.clip();
		// Lead cames and a shadow across the glass, as if something stood inside
		c.strokeStyle = "rgba(8, 6, 4, 0.85)";
		c.lineWidth = 0.9;
		c.beginPath();
		c.moveTo(w.x, w.y - w.h);
		c.lineTo(w.x, w.y + w.h);
		for (let y = w.y - w.h / 2 + 4; y < w.y + w.h / 2; y += 6) {
			c.moveTo(w.x - w.w, y);
			c.lineTo(w.x + w.w, y + 1);
		}
		c.stroke();
		c.fillStyle = "rgba(10, 8, 5, 0.55)";
		c.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w * between(0.2, 0.5), w.h);
		c.restore();
	}
};

// ---------------------------------------------------------------- sky

const paintSky = (c: Ctx, clouds: HTMLCanvasElement, face: HTMLCanvasElement) => {
	const sky = c.createLinearGradient(0, -100, 0, H);

	sky.addColorStop(0, "#030304");
	sky.addColorStop(0.35, "#0a0b0a");
	sky.addColorStop(0.7, "#191a14");
	sky.addColorStop(1, "#24241b");
	c.fillStyle = sky;
	c.fillRect(-400, -400, W + 800, H + 800);

	const wide = c.createRadialGradient(MOON.x, MOON.y, MOON.r, MOON.x, MOON.y, MOON.r * 5);

	wide.addColorStop(0, "rgba(170, 166, 138, 0.3)");
	wide.addColorStop(0.4, "rgba(80, 80, 64, 0.12)");
	wide.addColorStop(1, "rgba(40, 40, 32, 0)");
	c.fillStyle = wide;
	c.fillRect(-400, -400, W + 800, H + 800);

	// A few stars, mostly hidden by the clouds that come next
	seed(11);
	for (let i = 0; i < 160; i++) {
		const x = between(-100, W + 100);
		const y = between(-100, 600);

		c.globalAlpha = between(0.15, 0.6) * smooth(640, 100, y);
		c.fillStyle = "#cfd0c0";
		c.fillRect(x, y, 1.1, 1.1);
	}
	c.globalAlpha = 1;

	const halo = c.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.98, MOON.x, MOON.y, MOON.r * 1.9);

	halo.addColorStop(0, "rgba(236, 230, 204, 0.55)");
	halo.addColorStop(0.3, "rgba(200, 194, 166, 0.16)");
	halo.addColorStop(1, "rgba(200, 194, 166, 0)");
	c.fillStyle = halo;
	c.fillRect(MOON.x - MOON.r * 2, MOON.y - MOON.r * 2, MOON.r * 4, MOON.r * 4);
	// The faint, ill ring that comes before bad weather
	c.strokeStyle = "rgba(150, 110, 84, 0.07)";
	c.lineWidth = 18;
	c.beginPath();
	c.arc(MOON.x, MOON.y, MOON.r * 1.42, 0, Math.PI * 2);
	c.stroke();

	c.drawImage(face, MOON.x - MOON.r, MOON.y - MOON.r, MOON.r * 2, MOON.r * 2);
	c.imageSmoothingQuality = "high";
	c.drawImage(clouds, 0, 0, W, H);

	// Far hills, drowned in haze
	seed(23);
	for (const [base, height, tone] of [
		[770, 70, "#1c1d17"],
		[800, 50, "#16170f"],
	] as const) {
		const hills: P[] = [[-200, H + 50]];

		for (let x = -200; x <= W + 200; x += 14) {
			hills.push([x, base - height * fbm(x * 0.004 + base, base * 0.01, 4)]);
		}
		hills.push([W + 200, H + 50]);
		c.fillStyle = tone;
		trace(c, hills);
		c.fill();
	}
};

// ---------------------------------------------------------------- foreground

const twig = (c: Ctx, x: number, y: number, angle: number, length: number, width: number, depth: number) => {
	const steps = 5;
	let a = angle;

	c.beginPath();
	c.moveTo(x, y);
	for (let i = 1; i <= steps; i++) {
		a += between(-0.32, 0.32);
		// Thin wood droops
		a += (Math.PI / 2 - a) * (1 - width / 30) * 0.04;
		const nx = x + (Math.cos(a) * length) / steps;
		const ny = y + (Math.sin(a) * length) / steps;

		c.lineWidth = width * (1 - (i / steps) * 0.35);
		c.lineTo(nx, ny);
		c.stroke();
		c.beginPath();
		c.moveTo(nx, ny);
		x = nx;
		y = ny;
		if (depth > 1 && i < steps && rand() < 0.22) {
			twig(c, x, y, a + between(-1.1, 1.1), length * 0.5, width * 0.5, depth - 2);
		}
	}
	if (depth <= 0 || width < 0.8) {
		return;
	}
	const children = rand() < 0.25 ? 3 : 2;

	for (let i = 0; i < children; i++) {
		twig(c, x, y, a + (i - (children - 1) / 2) * between(0.4, 0.9) + between(-0.2, 0.2), length * between(0.62, 0.8), width * 0.66, depth - 1);
	}
};

const paintFore = (c: Ctx, scene: () => void, scale: number, grimeTexture: HTMLCanvasElement, breakup: HTMLCanvasElement) => {
	const black = "#060606";

	seed(701);
	const ground: P[] = [[-80, 1120]];

	for (let x = -80; x <= W + 80; x += 12) {
		ground.push([x, 958 - Math.sin((x / W) * Math.PI) * 18 + (fbm(x * 0.008, 3, 4) - 0.5) * 40]);
	}
	ground.push([W + 80, 1120]);
	c.fillStyle = black;
	trace(c, ground);
	c.fill();

	// Grass and thorns along the rise
	c.strokeStyle = black;
	c.lineCap = "round";
	for (let i = 1; i < ground.length - 1; i++) {
		const [gx, gy] = ground[i];

		for (let j = 0; j < 3; j++) {
			const x = gx + between(-6, 6);
			const height = between(6, 34) * (rand() < 0.1 ? 1.8 : 1);
			const lean = between(-0.5, 0.5);

			c.lineWidth = between(0.8, 1.8);
			c.beginPath();
			c.moveTo(x, gy + 4);
			c.quadraticCurveTo(x + lean * height * 0.3, gy - height * 0.6, x + lean * height, gy - height);
			c.stroke();
		}
	}

	// A graveyard fence, rusted, bent, some bars gone
	c.lineWidth = 2.4;
	for (let x = 600; x < 1290; x += 24) {
		const baseY = 958 - Math.sin((x / W) * Math.PI) * 18 + (fbm(x * 0.008, 3, 4) - 0.5) * 40 + 4;

		if (rand() < 0.15) {
			continue;
		}
		const height = rand() < 0.15 ? between(20, 40) : between(64, 76);
		const lean = between(-0.08, 0.08) + (rand() < 0.12 ? between(-0.4, 0.4) : 0);
		const tx = x + Math.sin(lean) * height;
		const ty = baseY - Math.cos(lean) * height;

		c.beginPath();
		c.moveTo(x, baseY);
		c.lineTo(tx, ty);
		c.stroke();
		if (height > 50) {
			c.fillStyle = black;
			c.beginPath();
			c.moveTo(tx - 4, ty + 2);
			c.lineTo(tx, ty - 9);
			c.lineTo(tx + 4, ty + 2);
			c.lineTo(tx, ty + 5);
			c.fill();
		}
	}
	c.lineWidth = 3;
	for (const level of [20, 52]) {
		c.beginPath();
		for (let x = 596; x < 1294; x += 8) {
			const y = 958 - Math.sin((x / W) * Math.PI) * 18 + (fbm(x * 0.008, 3, 4) - 0.5) * 40 - level + Math.sin(x * 0.01) * 3;

			if (x === 596) {
				c.moveTo(x, y);
			} else {
				c.lineTo(x, y);
			}
		}
		c.stroke();
	}

	// The dead tree, reaching over the left of the scene
	seed(733);
	c.strokeStyle = black;
	twig(c, 150, 1020, -1.48, 210, 30, 7);
	twig(c, 166, 930, -0.62, 150, 13, 6);
	twig(c, 140, 900, -2.3, 120, 10, 5);

	rim(
		c,
		c.canvas,
		scene,
		[
			{ width: 6, color: "#7f7f6a", alpha: 0.18, blur: 2 },
			{ width: 1.3, color: "#c8c4aa", alpha: 0.6, blur: 0 },
		],
		scale,
		breakup,
	);
	grime(c, grimeTexture, 0.4);
};

// ---------------------------------------------------------------- tentacles

type Point = { x: number; y: number; d: number };
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

type Coil = { from: P; tower: Tower; radius: number; low: number; high: number; turns: number; tail: number; tailChain: Chain };

/**
 * An arm that climbs the far side of the crag (its root below the frame, the rest hidden behind
 * rock and wall), winds around a tower and lets its tip search the air
 */
const coil = (o: Coil, t: number) => {
	const points: Point[] = [];
	const start = o.turns > 0 ? Math.PI : 0;
	const startX = centerAt(o.tower, o.low) + Math.cos(start) * o.radius;

	for (let i = 0; i <= 24; i++) {
		const u = i / 24;
		const control: P = [o.from[0] + (startX - o.from[0]) * 0.2, o.low + 6];

		points.push({
			x: (1 - u) ** 2 * o.from[0] + 2 * (1 - u) * u * control[0] + u * u * startX + Math.sin(t * 0.4 + u * 3) * 2 * u,
			y: (1 - u) ** 2 * o.from[1] + 2 * (1 - u) * u * control[1] + u * u * o.low,
			d: -1,
		});
	}
	const steps = Math.ceil(Math.abs(o.turns) * 90);

	for (let i = 1; i <= steps; i++) {
		const u = i / steps;
		const theta = start + o.turns * Math.PI * 2 * u + Math.sin(t * 0.3) * 0.05 * u;
		const y = o.low + (o.high - o.low) * u;
		// It squeezes
		const radius = o.radius * (1 + 0.05 * Math.sin(t * 0.7 + u * 7));
		const depth = Math.sin(theta);

		points.push({ x: centerAt(o.tower, y) + Math.cos(theta) * radius, y: y - radius * 0.22 * depth, d: depth });
	}
	const [a, b] = points.slice(-2);

	return chain(b.x, b.y, Math.atan2(b.y - a.y, b.x - a.x), o.tail, 34, t, o.tailChain, points);
};

type Arm = {
	id: number;
	layer: "horror" | "giant" | "castle" | "fore";
	base: number;
	/** 0 → as lit as the scene allows, 1 → lost in darkness and fog */
	murk: number;
	belly: 1 | -1;
	spine: (t: number) => Point[];
};

const ARMS: Arm[] = [
	// Glimpsed in the clouds only when the lightning flashes
	{ id: 1, layer: "horror", base: 150, murk: 0.6, belly: 1, spine: (t) => chain(240, -80, 1.38, 520, 50, t, { curl: 1.3, sway: 0.08, speed: 0.1, phase: 0, wave: 3 }) },
	{ id: 2, layer: "horror", base: 120, murk: 0.6, belly: -1, spine: (t) => chain(600, -90, 1.62, 340, 44, t, { curl: -1.7, sway: 0.08, speed: 0.12, phase: 2, wave: 3 }) },
	{ id: 3, layer: "horror", base: 170, murk: 0.6, belly: -1, spine: (t) => chain(1400, -80, 1.8, 560, 50, t, { curl: -1.2, sway: 0.08, speed: 0.09, phase: 4, wave: 3 }) },
	// Giants behind the crag, half drowned in haze
	{ id: 4, layer: "giant", base: 96, murk: 0.72, belly: 1, spine: (t) => chain(300, 1080, -1.36, 830, 80, t, { curl: 1.7, sway: 0.12, speed: 0.12, phase: 0, wave: 3 }) },
	{ id: 5, layer: "giant", base: 110, murk: 0.7, belly: -1, spine: (t) => chain(1350, 1100, -1.8, 990, 80, t, { curl: -1.4, sway: 0.1, speed: 0.1, phase: 2, wave: 3 }) },
	// Out of the broken tower, across the moon
	{ id: 6, layer: "castle", base: 68, murk: 0, belly: -1, spine: (t) => chain(975, 410, -1.52, 480, 76, t, { curl: -2.4, sway: 0.2, speed: 0.26, phase: 1, wave: 4 }) },
	// Strangling the two front towers
	{
		id: 8,
		layer: "castle",
		base: 38,
		murk: 0.05,
		belly: -1,
		spine: (t) =>
			coil({ from: [380, 1070], tower: TOWERS.front, radius: 54, low: 650, high: 474, turns: 1.6, tail: 220, tailChain: { curl: -1.9, sway: 0.34, speed: 0.36, phase: 0.5, wave: 4 } }, t),
	},
	{
		id: 9,
		layer: "castle",
		base: 36,
		murk: 0.05,
		belly: 1,
		spine: (t) =>
			coil({ from: [1312, 1070], tower: TOWERS.right, radius: 48, low: 662, high: 522, turns: -1.6, tail: 240, tailChain: { curl: 1.8, sway: 0.32, speed: 0.31, phase: 3, wave: 4 } }, t),
	},
	// In the foreground, nearly black
	{ id: 10, layer: "fore", base: 132, murk: 0.35, belly: -1, spine: (t) => chain(1640, 1130, -1.95, 780, 80, t, { curl: -1.5, sway: 0.13, speed: 0.17, phase: 2.5, wave: 3.4 }) },
	{ id: 11, layer: "fore", base: 70, murk: 0.35, belly: 1, spine: (t) => chain(430, 1110, -1.22, 390, 60, t, { curl: 1.8, sway: 0.2, speed: 0.24, phase: 5, wave: 3.6 }) },
];

/**
 * Thin feelers: out of breaches in the walls (a black hole swallows their root), or squirming out
 * of the wound beside the big arm (rooted inside the broken tower, whose walls are drawn over them)
 */
const FEELERS: { x: number; y: number; angle: number; length: number; width: number; curl: number; speed: number; breach: boolean }[] = [
	{ x: 582, y: 600, angle: 1.6, length: 90, width: 8, curl: 0.8, speed: 0.5, breach: true },
	{ x: 668, y: 596, angle: 1.5, length: 120, width: 10, curl: -0.6, speed: 0.4, breach: true },
	{ x: 905, y: 604, angle: 1.62, length: 64, width: 7, curl: 1, speed: 0.6, breach: true },
	{ x: 1036, y: 598, angle: 1.55, length: 100, width: 9, curl: -0.9, speed: 0.45, breach: true },
	{ x: 1146, y: 606, angle: 1.7, length: 72, width: 7, curl: 0.7, speed: 0.55, breach: true },
	{ x: 911, y: 447, angle: 1.58, length: 86, width: 6, curl: 0.5, speed: 0.5, breach: true },
	{ x: 662, y: 451, angle: 1.52, length: 60, width: 5, curl: -0.5, speed: 0.6, breach: true },
	{ x: 952, y: 350, angle: -2.0, length: 130, width: 13, curl: -1.4, speed: 0.9, breach: false },
	{ x: 1002, y: 346, angle: -1.25, length: 150, width: 14, curl: 1.6, speed: 0.75, breach: false },
	{ x: 1010, y: 362, angle: -0.8, length: 110, width: 10, curl: 1.8, speed: 1.1, breach: false },
];

/** A ragged black breach in the stone */
const breachShape = (x: number, y: number, r: number): P[] =>
	Array.from({ length: 14 }, (_, i) => {
		const a = (i / 14) * Math.PI * 2;
		const radius = r * (0.75 + 0.5 * hash(Math.round(x) + i, Math.round(y)));

		return [x + Math.cos(a) * radius * 1.15, y + Math.sin(a) * radius * 0.85] as P;
	});

const FLESH = {
	body: [28, 23, 23] as Rgb,
	lit: [70, 60, 57] as Rgb,
	dark: [8, 6, 6] as Rgb,
	belly: [44, 34, 32] as Rgb,
	rim: [226, 220, 196] as Rgb,
	murk: [26, 27, 22] as Rgb,
};

type Edge = { x: number; y: number; nx: number; ny: number; w: number };

const edgesOf = (spine: Point[], base: number) =>
	spine.map((p, i): Edge => {
		const a = spine[Math.max(0, i - 1)];
		const b = spine[Math.min(spine.length - 1, i + 1)];
		const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		const u = i / (spine.length - 1);

		return { x: p.x, y: p.y, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len, w: base * (1 - u) ** 0.85 + 1 };
	});

/** How squarely the side of an arm, at one point, faces the moon: -1 to 1 */
const facingAt = (e: Edge) => (e.nx * (MOON.x - e.x) + e.ny * (MOON.y - e.y)) / (Math.hypot(MOON.x - e.x, MOON.y - e.y) || 1);

/**
 * Paints part of an arm as a wet cylinder: a gradient across each segment from the side that
 * faces the moon (a hard rim, then flesh) to the side away from it (black, rimmed again when the
 * arm crosses the moon); a broken wet highlight; mottling; small pale suckers underneath.
 */
const paintFlesh = (c: Ctx, arm: Arm, edges: Edge[], from: number, to: number, murk: number, side: number, flash = 0) => {
	const tone = (color: Rgb) => mixRgb(color, FLESH.murk, murk);
	const body = tone(FLESH.body);
	const dark = tone(FLESH.dark);

	for (let i = from; i < to; i++) {
		const a = edges[i];
		const b = edges[Math.min(i + 2, to)];
		const lx = MOON.x - a.x;
		const ly = MOON.y - a.y;
		const facing = facingAt(a) * side;
		const strength = clamp(facing) ** 0.6;
		const far = clamp(-facing) ** 0.6;
		const sight = moonSight(a.x, a.y, 260) * (1 - murk * 0.7) + flash;
		// In front of the moon the arm is lit from behind: its face goes dark, both edges glow
		const back = clamp(1 - (Math.hypot(lx, ly) - MOON.r) / 60) * (1 - murk);
		const lit = sight * (1 - back * 0.75);
		const half = a.w / 2;
		const gradient = c.createLinearGradient(a.x + a.nx * half * side, a.y + a.ny * half * side, a.x - a.nx * half * side, a.y - a.ny * half * side);

		gradient.addColorStop(0, css(mixRgb(body, FLESH.rim, clamp((0.2 + 0.8 * strength) * Math.max(lit, back * 0.8)))));
		gradient.addColorStop(0.07, css(mixRgb(body, tone(FLESH.lit), strength * clamp(lit * 1.4))));
		gradient.addColorStop(0.42, css(mixRgb(body, dark, back * 0.6)));
		gradient.addColorStop(0.86, css(dark));
		gradient.addColorStop(1, css(mixRgb(dark, FLESH.rim, Math.max(back * 0.7, far * lit * 0.8))));
		c.fillStyle = gradient;
		c.beginPath();
		c.moveTo(a.x + a.nx * half, a.y + a.ny * half);
		c.lineTo(b.x + b.nx * (b.w / 2), b.y + b.ny * (b.w / 2));
		c.lineTo(b.x - b.nx * (b.w / 2), b.y - b.ny * (b.w / 2));
		c.lineTo(a.x - a.nx * half, a.y - a.ny * half);
		c.fill();
	}

	// Mottled skin
	for (let i = from; i < to; i += 2) {
		const e = edges[i];

		if (e.w < 6) {
			continue;
		}
		const h = hash(i, arm.id);

		if (h < 0.55) {
			continue;
		}
		const across = (hash(arm.id, i) - 0.5) * e.w * 0.7;

		c.fillStyle = h > 0.85 ? `rgba(110, 96, 88, ${0.12 * (1 - murk)})` : "rgba(0, 0, 0, 0.35)";
		c.beginPath();
		c.ellipse(e.x + e.nx * across, e.y + e.ny * across, e.w * 0.09 + 0.6, e.w * 0.05 + 0.4, Math.atan2(e.ny, e.nx), 0, Math.PI * 2);
		c.fill();
	}

	// Faint rings of wrinkles across the arm
	c.lineWidth = 0.7;
	for (let i = from + 1; i < to; i += 2) {
		const e = edges[i];
		const p = edges[i - 1];

		if (e.w < 8 || murk > 0.5 || hash(i, arm.id * 5) < 0.4) {
			continue;
		}
		const bow = 0.25 + hash(i, arm.id * 3) * 0.3;

		c.strokeStyle = "rgba(0, 0, 0, 0.2)";
		c.beginPath();
		c.moveTo(e.x + e.nx * e.w * 0.42, e.y + e.ny * e.w * 0.42);
		c.quadraticCurveTo(e.x + (e.x - p.x) * bow * 2, e.y + (e.y - p.y) * bow * 2, e.x - e.nx * e.w * 0.42, e.y - e.ny * e.w * 0.42);
		c.stroke();
	}

	// Suckers along the belly
	if (murk < 0.5) {
		let travelled = 0;

		for (let i = from + 1; i <= to; i++) {
			const e = edges[i];
			const p = edges[i - 1];
			const r = e.w * (0.12 + 0.06 * hash(i, arm.id + 9));

			travelled += Math.hypot(e.x - p.x, e.y - p.y);
			if (r < 1.3 || travelled < r * 2.8) {
				continue;
			}
			travelled = 0;
			const offset = (e.w / 2) * 0.86 * arm.belly;
			const x = e.x + e.nx * offset;
			const y = e.y + e.ny * offset;
			const angle = Math.atan2(e.ny, e.nx) + Math.PI / 2;
			const sight = moonSight(x, y, 260);

			c.fillStyle = css(mixRgb(mixRgb(body, tone(FLESH.belly), 0.6), FLESH.rim, 0.1 * sight));
			c.beginPath();
			c.ellipse(x, y, r, r * 0.68, angle, 0, Math.PI * 2);
			c.fill();
			c.fillStyle = "rgba(4, 3, 3, 0.55)";
			c.beginPath();
			c.ellipse(x + e.nx * r * 0.12 * arm.belly, y + e.ny * r * 0.12 * arm.belly, r * 0.48, r * 0.3, angle, 0, Math.PI * 2);
			c.fill();
		}
	}

	// Wet highlight, broken: the flesh glistens in long patches
	c.lineCap = "round";
	c.lineJoin = "round";
	let patch: P[] = [];
	let strength = 0;
	const flush = () => {
		if (patch.length > 2) {
			trace(c, patch, false);
			c.strokeStyle = `rgba(236, 232, 210, ${(strength / patch.length) * (1 - murk)})`;
			c.stroke();
		}
		patch = [];
		strength = 0;
	};

	for (let i = from; i <= to; i++) {
		const e = edges[i];
		const shine = noise(i * 0.11, arm.id * 7.7) * 0.7 + noise(i * 0.5, arm.id * 3.1) * 0.3;
		if (shine < 0.5 || e.w < 3) {
			flush();
			continue;
		}
		if (!patch.length) {
			c.lineWidth = Math.max(0.6, e.w * 0.045);
		}
		patch.push([e.x + e.nx * e.w * 0.3 * side, e.y + e.ny * e.w * 0.3 * side]);
		strength += clamp((shine - 0.5) * 3) * 0.5 * (0.35 + moonSight(e.x, e.y, 300));
	}
	flush();
};

const paintArm = (c: Ctx, arm: Arm, t: number, pass: "behind" | "front", flash = 0) => {
	const spine = arm.spine(t);
	const edges = edgesOf(spine, arm.base);
	// One lit side for the whole arm, so the shading never flips, even where it turns behind a tower
	const side = edges.reduce((sum, e) => sum + facingAt(e) * e.w, 0) >= 0 ? 1 : -1;
	let start = 0;

	// Runs of segments in front of, or behind, what they wind around
	for (let i = 1; i < spine.length; i++) {
		const front = spine[i - 1].d + spine[i].d >= 0;
		const nextFront = i + 1 < spine.length ? spine[i].d + spine[i + 1].d >= 0 : !front;

		if (front !== nextFront || i === spine.length - 1) {
			if (front === (pass === "front")) {
				// Same shading on both sides, so the arm reads as one piece where it turns behind
				paintFlesh(c, arm, edges, start, i, arm.murk, side, flash);
			}
			start = i;
		}
	}
};

const paintFeeler = (c: Ctx, f: (typeof FEELERS)[number], index: number, t: number) => {
	const spine = chain(f.x, f.y, f.angle, f.length, 18, t, { curl: f.curl, sway: 0.5, speed: f.speed, phase: index * 1.7, wave: 3 });
	const edges = edgesOf(spine, f.width);
	const left: P[] = edges.map((e) => [e.x + e.nx * (e.w / 2), e.y + e.ny * (e.w / 2)]);
	const right: P[] = edges.map((e) => [e.x - e.nx * (e.w / 2), e.y - e.ny * (e.w / 2)]);

	c.fillStyle = "#120d0d";
	trace(c, [...left, ...right.reverse()]);
	c.fill();
	const toward = Math.sign(MOON.x - f.x) || 1;

	c.strokeStyle = `rgba(220, 214, 190, ${0.25 + 0.4 * moonSight(f.x, f.y, 260)})`;
	c.lineWidth = 0.8;
	trace(
		c,
		edges.map((e) => [e.x + e.nx * e.w * 0.3 * toward, e.y + e.ny * e.w * 0.3 * toward - 0.5] as P),
		false,
	);
	c.stroke();

	if (f.breach) {
		// The dark of the breach closes over the root
		const shadow = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.width * 1.5);

		shadow.addColorStop(0, "rgba(2, 2, 2, 1)");
		shadow.addColorStop(0.55, "rgba(2, 2, 2, 0.95)");
		shadow.addColorStop(1, "rgba(2, 2, 2, 0)");
		c.fillStyle = shadow;
		c.fillRect(f.x - f.width * 1.5, f.y - f.width * 1.5, f.width * 3, f.width * 3);
	}
};

// ---------------------------------------------------------------- mounting

type Ash = { x: number; y: number; vx: number; vy: number; size: number; born: number; life: number };

const spawnAsh = (t: number): Ash => ({
	x: Math.random() * W,
	y: Math.random() * H * 0.9,
	vx: 4 + Math.random() * 8,
	vy: 3 + Math.random() * 7,
	size: 0.6 + Math.random() * 1.4,
	born: t,
	life: 8 + Math.random() * 10,
});

const FOG_BANDS = [
	{ y: 820, h: 140, speed: 5, alpha: 0.28, scale: 1.4, texture: 0 },
	{ y: 900, h: 200, speed: -3.5, alpha: 0.38, scale: 2, texture: 1 },
	{ y: 970, h: 200, speed: 7, alpha: 0.32, scale: 2.4, texture: 0 },
];

export const mountEldritchCastle = (canvas: HTMLCanvasElement) => {
	const c = canvas.getContext("2d")!;
	const still = window.matchMedia("(prefers-reduced-motion: reduce)");
	const clouds = paintClouds();
	const moonFace = paintMoonFace();
	const fogs = [paintFog(3), paintFog(11)];
	const grimeTexture = paintGrime();
	const breakup = paintBreakup();
	const grains = [paintGrain(1), paintGrain(2), paintGrain(3)].map((grain) => c.createPattern(grain, "repeat")!);
	const ash: Ash[] = [];
	let layers: Record<"sky" | "world" | "fore" | "post", HTMLCanvasElement> | null = null;
	let scale = 1;
	let offsetX = 0;
	let offsetY = 0;
	let frame = 0;
	let last = 0;
	let nextFlash = 5 + Math.random() * 5;

	const resize = () => {
		const box = canvas.getBoundingClientRect();
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.round(box.width * ratio));
		const height = Math.max(1, Math.round(box.height * ratio));

		// Repainting costs a moment: skip it when the size has not really changed
		if (layers && width === canvas.width && height === canvas.height) {
			return;
		}
		canvas.width = width;
		canvas.height = height;
		// Cover the screen, cropping around the castle and the moon rather than the middle
		scale = Math.max(width / W, height / H);
		offsetX = clamp(width / 2 - 850 * scale, width - W * scale, 0);
		offsetY = clamp(height / 2 - 330 * scale, height - H * scale, 0);
		// Where the moon is on the page, for whatever wants to fly to it (src/scripts/bats.ts)
		canvas.dataset.moonX = String(Math.round((offsetX + MOON.x * scale) / ratio + box.left));
		canvas.dataset.moonY = String(Math.round((offsetY + MOON.y * scale) / ratio + box.top));

		const paint = (painter: (lc: Ctx, scene: () => void) => void) => {
			const canvas = layer(width, height);
			const lc = canvas.getContext("2d")!;
			const scene = () => lc.setTransform(scale, 0, 0, scale, offsetX, offsetY);

			scene();
			painter(lc, scene);
			return canvas;
		};

		layers = {
			sky: paint((lc) => paintSky(lc, clouds, moonFace)),
			world: paint((lc, scene) => paintWorld(lc, scene, scale, grimeTexture, breakup)),
			fore: paint((lc, scene) => paintFore(lc, scene, scale, grimeTexture, breakup)),
			post: paint((lc) => {
				lc.setTransform(1, 0, 0, 1, 0, 0);
				const vignette = lc.createRadialGradient(width / 2, height * 0.42, Math.min(width, height) * 0.2, width / 2, height * 0.5, Math.hypot(width, height) * 0.6);

				vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
				vignette.addColorStop(0.55, "rgba(2, 2, 2, 0.4)");
				vignette.addColorStop(1, "rgba(2, 2, 2, 0.95)");
				lc.fillStyle = vignette;
				lc.fillRect(0, 0, width, height);
				// Old print: a few scratches and dust
				seed(901);
				for (let i = 0; i < 14; i++) {
					const x = between(0, width);

					lc.strokeStyle = `rgba(200, 196, 170, ${between(0.02, 0.06)})`;
					lc.lineWidth = between(0.5, 1.2) * ratio;
					lc.beginPath();
					lc.moveTo(x, between(0, height * 0.3));
					lc.lineTo(x + between(-6, 6), between(height * 0.5, height));
					lc.stroke();
				}
				for (let i = 0; i < 160; i++) {
					lc.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.5)" : "rgba(200,196,170,0.08)";
					lc.beginPath();
					lc.arc(between(0, width), between(0, height), between(0.4, 1.6) * ratio, 0, Math.PI * 2);
					lc.fill();
				}
			}),
		};
	};

	const draw = (t: number) => {
		if (!layers) {
			return;
		}
		const scene = () => c.setTransform(scale, 0, 0, scale, offsetX, offsetY);
		const screen = () => c.setTransform(1, 0, 0, 1, 0, 0);
		const moving = !still.matches;

		screen();
		c.globalCompositeOperation = "source-over";
		c.globalAlpha = 1;
		c.drawImage(layers.sky, 0, 0);

		// Lightning, now and then, deep in the clouds: two pulses, and for a moment you see what is up there
		let flash = 0;

		if (moving) {
			if (t > nextFlash + 1.2) {
				nextFlash = t + 14 + Math.random() * 16;
			}
			const since = t - nextFlash;

			if (since > 0 && since < 1.2) {
				flash = Math.max(0, 1 - Math.abs(since - 0.06) * 12) + 0.8 * Math.max(0, 1 - Math.abs(since - 0.34) * 5);
			}
		}
		scene();
		if (flash > 0) {
			c.globalAlpha = clamp(flash * 1.4);
			for (const arm of ARMS) {
				if (arm.layer === "horror") {
					paintArm(c, arm, t, "front", flash * 0.4);
				}
			}
			// The lit clouds drift over them, so they are never quite seen whole
			c.globalCompositeOperation = "lighter";
			c.globalAlpha = flash * 0.55;
			c.drawImage(clouds, 0, 0, W, H);
			c.globalAlpha = 1;
			c.globalCompositeOperation = "source-over";
		}

		for (const arm of ARMS) {
			if (arm.layer === "giant") {
				paintArm(c, arm, t, "front", flash * 0.3);
			}
		}
		const haze = c.createLinearGradient(0, 640, 0, 900);

		haze.addColorStop(0, "rgba(52, 53, 43, 0)");
		haze.addColorStop(0.5, "rgba(52, 53, 43, 0.8)");
		haze.addColorStop(1, "rgba(40, 41, 33, 0.95)");
		c.fillStyle = haze;
		c.fillRect(-400, 600, W + 800, 500);

		for (const arm of ARMS) {
			if (arm.layer === "castle") {
				paintArm(c, arm, t, "behind");
			}
		}
		screen();
		c.drawImage(layers.world, 0, 0);
		scene();

		FEELERS.forEach((f, i) => paintFeeler(c, f, i, t));
		for (const arm of ARMS) {
			if (arm.layer === "castle") {
				paintArm(c, arm, t, "front", flash * 0.25);
			}
		}
		// The broken tower's walls again, over the roots of what comes out of it
		c.save();
		trace(c, BROKEN_BODY);
		c.clip();
		screen();
		c.drawImage(layers.world, 0, 0);
		c.restore();

		// The wound in the broken tower glows from inside; the lit windows waver
		c.globalCompositeOperation = "lighter";
		const pulse = 0.75 + 0.25 * Math.sin(t * 0.9) * Math.sin(t * 2.3 + 1);
		const wound = c.createRadialGradient(975, 318, 0, 975, 318, 90);

		wound.addColorStop(0, `rgba(150, 170, 90, ${0.32 * pulse})`);
		wound.addColorStop(1, "rgba(150, 170, 90, 0)");
		c.fillStyle = wound;
		c.fillRect(885, 228, 180, 180);
		CASTLE.windows.forEach((w, i) => {
			if (!w.lit) {
				return;
			}
			const flicker = 0.65 + 0.2 * Math.sin(t * 1.7 + i * 2.1) + 0.15 * Math.sin(t * 9.3 + i * 5.3) * Math.sin(t * 0.7 + i);
			const glow = c.createRadialGradient(w.x, w.y, 0, w.x, w.y, 30);

			glow.addColorStop(0, `rgba(210, 180, 100, ${0.28 * flicker})`);
			glow.addColorStop(1, "rgba(210, 180, 100, 0)");
			c.fillStyle = glow;
			c.fillRect(w.x - 30, w.y - 30, 60, 60);
		});
		c.globalCompositeOperation = "source-over";

		for (const band of FOG_BANDS) {
			const texture = fogs[band.texture];
			const width = texture.width * band.scale * 1.6;
			const shift = (((t * band.speed) % width) + width) % width;

			c.globalAlpha = band.alpha;
			for (let x = -shift - width; x < W + width; x += width) {
				c.drawImage(texture, x, band.y - band.h / 2, width + 1, band.h);
			}
		}
		c.globalAlpha = 1;

		screen();
		c.drawImage(layers.fore, 0, 0);
		scene();
		for (const arm of ARMS) {
			if (arm.layer === "fore") {
				paintArm(c, arm, t, "front", flash * 0.2);
			}
		}

		// Ash, drifting down
		if (moving) {
			while (ash.length < 90) {
				ash.push(spawnAsh(t - Math.random() * 12));
			}
			ash.forEach((a, i) => {
				const age = t - a.born;

				if (age > a.life) {
					ash[i] = spawnAsh(t);
					return;
				}
				c.fillStyle = `rgba(190, 186, 166, ${0.4 * Math.sin((age / a.life) * Math.PI)})`;
				c.beginPath();
				c.arc(a.x + a.vx * age + Math.sin(age * 0.8 + i) * 10, a.y + a.vy * age, a.size, 0, Math.PI * 2);
				c.fill();
			});
		}

		screen();
		if (flash > 0) {
			c.globalCompositeOperation = "lighter";
			c.fillStyle = `rgba(150, 156, 146, ${flash * 0.08})`;
			c.fillRect(0, 0, canvas.width, canvas.height);
			c.globalCompositeOperation = "source-over";
		}
		c.drawImage(layers.post, 0, 0);
		// Film grain, moving
		c.fillStyle = grains[Math.floor(t * 24) % grains.length];
		c.setTransform(1, 0, 0, 1, (t * 997) % 192, (t * 613) % 192);
		c.fillRect(-192, -192, canvas.width + 192, canvas.height + 192);
		screen();
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
