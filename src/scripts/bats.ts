// A cloud of bats bursting out of an area of the page (the form, once signed) and flying off toward
// the moon, smaller and fainter as they go. Painted on a canvas laid over everything for a few
// seconds, then removed.

type Bat = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	delay: number;
	flap: number;
	rate: number;
	seed: number;
	/** Where this one heads: the moon, give or take */
	tx: number;
	ty: number;
};

const LIFE = 2.9;

const smooth = (edge0: number, edge1: number, value: number) => {
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

	return t * t * (3 - 2 * t);
};

/** A bat seen from below: body, ears, and two scalloped wings at some point of their beat */
const drawBat = (c: CanvasRenderingContext2D, beat: number) => {
	const lift = Math.sin(beat);

	c.beginPath();
	for (const side of [-1, 1]) {
		const wrist = -2 - lift * 6;
		const tip = 2 - lift * 10;

		c.moveTo(side * 1.4, -2.5);
		c.quadraticCurveTo(side * 5, wrist - 2, side * 9, wrist);
		c.lineTo(side * 18, tip);
		c.quadraticCurveTo(side * 15.5, tip + 2.5, side * 14, tip * 0.55 + 5.5);
		c.quadraticCurveTo(side * 11.5, wrist * 0.5 + 3.5, side * 9, wrist + 6.5);
		c.quadraticCurveTo(side * 6, wrist * 0.25 + 4.5, side * 4, 4);
		c.quadraticCurveTo(side * 2.5, 2.5, side * 1.2, 3.8);
		c.closePath();
	}
	c.ellipse(0, 0.5, 2.1, 4.4, 0, 0, Math.PI * 2);
	c.moveTo(-1.6, -3.4);
	c.lineTo(-1.2, -6.6);
	c.lineTo(-0.3, -3.9);
	c.moveTo(1.6, -3.4);
	c.lineTo(1.2, -6.6);
	c.lineTo(0.3, -3.9);
};

/** Where the illustration says its moon is, in page pixels; otherwise high and to the right */
const moonOnScreen = () => {
	const scene = document.getElementById("eldritch-castle");
	const x = Number(scene?.dataset.moonX);
	const y = Number(scene?.dataset.moonY);

	return Number.isFinite(x) && Number.isFinite(y) && x > 0 ? { x, y } : { x: innerWidth * 0.6, y: innerHeight * 0.2 };
};

/**
 * Bursts bats out of `area` (page pixels, as from getBoundingClientRect). `onClear` runs once most
 * of them have left it, so whatever replaces the area can come in; the promise settles when the
 * last one is gone.
 */
export const releaseBats = (area: DOMRect, onClear?: () => void) =>
	new Promise<void>((resolve) => {
		const canvas = document.createElement("canvas");
		const c = canvas.getContext("2d")!;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const moon = moonOnScreen();
		const cx = area.left + area.width / 2;
		const cy = area.top + area.height / 2;
		const count = Math.round(Math.min(220, Math.max(90, (area.width * area.height) / 1100)));
		const bats: Bat[] = Array.from({ length: count }, () => {
			const x = area.left + Math.random() * area.width;
			const y = area.top + Math.random() * area.height;

			return {
				x,
				y,
				// A first scatter out from the middle of the form, then they wheel toward the moon
				vx: (x - cx) * (1.2 + Math.random()) + (Math.random() - 0.5) * 120,
				vy: (y - cy) * (0.8 + Math.random()) - 60 - Math.random() * 120,
				size: 11 + Math.random() * 15,
				delay: Math.random() * 0.5,
				flap: Math.random() * Math.PI * 2,
				rate: (9 + Math.random() * 5) * Math.PI * 2,
				seed: Math.random() * 100,
				tx: moon.x + (Math.random() - 0.5) * 260,
				ty: moon.y + (Math.random() - 0.5) * 160,
			};
		});

		Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "5" });
		canvas.setAttribute("aria-hidden", "true");
		canvas.width = Math.round(innerWidth * ratio);
		canvas.height = Math.round(innerHeight * ratio);
		document.body.append(canvas);

		let start = 0;
		let last = 0;
		let cleared = false;
		const frame = (now: number) => {
			start ||= now;
			const t = (now - start) / 1000;
			const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);

			last = now;
			c.setTransform(ratio, 0, 0, ratio, 0, 0);
			c.clearRect(0, 0, innerWidth, innerHeight);
			for (const bat of bats) {
				const age = t - bat.delay;

				if (age < 0 || age > LIFE) {
					continue;
				}
				const dx = bat.tx - bat.x;
				const dy = bat.ty - bat.y;
				const distance = Math.hypot(dx, dy) || 1;
				const pull = 900 * smooth(0.15, 0.9, age);

				// Toward the moon, with the jinking, broken flight bats have
				bat.vx += ((dx / distance) * pull + Math.sin(t * 9 + bat.seed) * 520) * dt;
				bat.vy += ((dy / distance) * pull + Math.cos(t * 7 + bat.seed * 1.3) * 420) * dt;
				bat.vx *= 0.975;
				bat.vy *= 0.975;
				bat.x += bat.vx * dt;
				bat.y += bat.vy * dt;
				bat.flap += bat.rate * dt;

				// Farther away, smaller and fainter; born out of the form, so pale for an instant
				const scale = (0.55 + 0.45 * smooth(0, 0.18, age)) * (1 - 0.82 * smooth(0.35, LIFE, age));
				const alpha = 1 - smooth(LIFE * 0.6, LIFE, age);
				const pale = 1 - smooth(0, 0.25, age);

				c.save();
				c.translate(bat.x, bat.y);
				c.rotate(Math.max(-0.6, Math.min(0.6, bat.vx / 700)));
				c.scale((bat.size / 18) * scale, (bat.size / 18) * scale);
				drawBat(c, bat.flap);
				c.globalAlpha = alpha;
				c.fillStyle = `rgb(${8 + 70 * pale}, ${7 + 64 * pale}, ${6 + 52 * pale})`;
				c.fill();
				c.lineWidth = 0.9;
				c.strokeStyle = `rgba(222, 214, 186, ${0.28 * (1 - smooth(0.4, LIFE, age)) + 0.1})`;
				c.stroke();
				c.restore();
			}

			if (!cleared && t > 1.1) {
				cleared = true;
				onClear?.();
			}
			if (t < LIFE + 0.55) {
				requestAnimationFrame(frame);
			} else {
				canvas.remove();
				resolve();
			}
		};

		requestAnimationFrame(frame);
	});
