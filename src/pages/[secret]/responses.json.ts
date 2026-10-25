// The raw responses, at /<HALLOWEEN_SECRET>/responses.json
import type { APIRoute } from "astro";
import { isSecret, notFound, PRIVATE_HEADERS } from "../../lib/secret";
import { readResponses } from "../../lib/store";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
	if (!isSecret(params.secret)) {
		return notFound();
	}
	return new Response(JSON.stringify(await readResponses(), null, "\t"), {
		headers: { ...PRIVATE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
	});
};
