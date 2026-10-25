// Renders the scene's textures (src/scripts/scene-textures.ts) once, into src/assets/scene/*.webp,
// so visitors load a few small images instead of computing a few million noise samples.
// Runs before every build (bun run build); after changing a texture, `bun run bake` and commit.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { TEXTURES } from "../src/scripts/scene-textures";

const out = join(dirname(fileURLToPath(import.meta.url)), "../src/assets/scene");
// Lossless by default: grime and grain are pure noise, which lossy coding only makes bigger. The
// clouds and the moon are soft and drawn larger than they are, where a little loss never shows.
const ENCODING: Record<string, sharp.WebpOptions> = {
	clouds: { nearLossless: true, quality: 60 },
	moon: { quality: 90, alphaQuality: 100 },
};

await mkdir(out, { recursive: true });
for (const [name, paint] of Object.entries(TEXTURES)) {
	const started = performance.now();
	const { width, height, data } = paint();
	const info = await sharp(Buffer.from(data.buffer), { raw: { width, height, channels: 4 } })
		.webp({ ...(ENCODING[name] ?? { lossless: true }), effort: 6 })
		.toFile(join(out, `${name}.webp`));

	console.log(`${name.padEnd(8)} ${width}×${height}  ${(info.size / 1024).toFixed(1).padStart(6)} KB  ${Math.round(performance.now() - started)} ms`);
}
