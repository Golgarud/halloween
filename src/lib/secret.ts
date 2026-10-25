// The responses live behind /<HALLOWEEN_SECRET>/: anything else there is a plain 404, the same as
// any missing page, so the address cannot be guessed by probing.
import { HALLOWEEN_SECRET } from "astro:env/server";
import { createHash, timingSafeEqual } from "node:crypto";

const MIN_LENGTH = 16;
const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compared in constant time; a missing or short secret keeps the page closed */
export const isSecret = (value: string | undefined) =>
	!!HALLOWEEN_SECRET && HALLOWEEN_SECRET.length >= MIN_LENGTH && !!value && timingSafeEqual(digest(value), digest(HALLOWEEN_SECRET));

export const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** Never cached, never indexed, never leaked through a Referer */
export const PRIVATE_HEADERS = {
	"Cache-Control": "no-store",
	"X-Robots-Tag": "noindex, nofollow",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
};
