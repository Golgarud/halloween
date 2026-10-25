// The raw responses, at /<HALLOWEEN_SECRET>/responses.json, once signed in on the register page
import type { APIRoute } from "astro";
import { isSecret, isSignedIn, notFound, PRIVATE_HEADERS } from "../../lib/secret";
import { readResponses } from "../../lib/store";

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies }) => {
	if (!isSecret(params.secret)) {
		return notFound();
	}
	if (!isSignedIn(cookies)) {
		return new Response("Sign in on the register first", { status: 401, headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
	}
	return new Response(JSON.stringify(await readResponses(), null, "\t"), {
		headers: { ...PRIVATE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
	});
};
