// Receives the form. Astro has already refused cross-site posts (security.checkOrigin); this checks
// the size, the fields, and every value (src/lib/rsvp.ts) before anything is written.
// The page's script asks for JSON; without JavaScript, the browser is sent back to the page.
// Errors go back as codes, which the page words in the visitor's language.
import type { APIRoute } from "astro";
import { FIELDS, TRAP, validate } from "../../lib/rsvp";
import { saveResponse } from "../../lib/store";

export const prerender = false;

const MAX_BYTES = 4096;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const recent = new Map<string, number[]>();

/** A few answers per address every ten minutes (a house of guests shares one); more is a script */
const tooMany = (address: string) => {
	const now = Date.now();
	const times = (recent.get(address) ?? []).filter((time) => now - time < WINDOW_MS);

	times.push(now);
	recent.set(address, times);
	return times.length > MAX_PER_WINDOW;
};

export const POST: APIRoute = async ({ request, clientAddress, redirect }) => {
	const wantsJson = request.headers.get("accept")?.includes("application/json");
	const reply = (status: number, body: Record<string, unknown>) =>
		wantsJson
			? Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
			: redirect(`/?rsvp=${status === 200 ? (body.present ? "yes" : "no") : "error"}#rsvp`, 303);

	if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
		return reply(413, { error: "tooLong" });
	}
	if (tooMany(clientAddress)) {
		return reply(429, { error: "tooMany" });
	}
	let form: FormData;

	try {
		// Read it all first: a body sent without a length is still held to the limit
		const body = await request.arrayBuffer();

		if (body.byteLength > MAX_BYTES) {
			return reply(413, { error: "tooLong" });
		}
		form = await new Response(body, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
	} catch {
		return reply(400, { error: "unreadable" });
	}
	const input: Record<string, unknown> = {};

	for (const [key, value] of form) {
		if (key === TRAP) {
			// A bot filled the hidden field: thank it, keep nothing
			if (value) {
				return reply(200, { present: true });
			}
			continue;
		}
		// Only the expected text fields, each once
		if (!(FIELDS as readonly string[]).includes(key) || typeof value !== "string" || key in input) {
			return reply(400, { error: "unexpected" });
		}
		input[key] = value;
	}
	const result = validate(input);

	if (!result.ok) {
		return reply(422, { errors: result.errors });
	}
	const { updated } = await saveResponse(result.rsvp);

	return reply(200, { present: result.rsvp.present, updated });
};
