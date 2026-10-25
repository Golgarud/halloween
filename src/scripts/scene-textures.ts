// The scene's textures: clouds, the moon's face, fog, grime, the blotches that break up the rims
// and film grain. They are pure functions of seeded noise, so they never change: rather than
// computing them in every visitor's browser, scripts/bake-scene.ts renders them once into
// src/assets/scene/*.webp, which the page simply loads.
import { clamp, fbm, H, hash, MOON, mixRgb, moonSight, noise, rand, type Rgb, seed, smooth, W, warped } from "./scene-noise";

export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

const paintPixels = (width: number, height: number, pixel: (u: number, v: number) => [number, number, number, number]): Pixels => {
	const data = new Uint8ClampedArray(width * height * 4);

	for (let v = 0; v < height; v++) {
		for (let u = 0; u < width; u++) {
			const [r, g, b, a] = pixel(u, v);
			const i = (v * width + u) * 4;

			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = a;
		}
	}
	return { width, height, data };
};

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

/** Every texture, by the name of its file */
export const TEXTURES = {
	clouds: paintClouds,
	moon: paintMoonFace,
	"fog-a": () => paintFog(3),
	"fog-b": () => paintFog(1.5),
	grime: paintGrime,
	breakup: paintBreakup,
	"grain-a": () => paintGrain(1),
	"grain-b": () => paintGrain(2),
	"grain-c": () => paintGrain(3),
} satisfies Record<string, () => Pixels>;

export type TextureName = keyof typeof TEXTURES;
