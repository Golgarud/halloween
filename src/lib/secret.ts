// The responses live behind /<HALLOWEEN_SECRET>/, and behind HALLOWEEN_PASSWORD on top of that.
// A wrong address is a plain 404, the same as any missing page, so it cannot be found by probing;
// without both settings (the secret 16+ characters) it stays closed. Signing in sets a signed,
// HttpOnly cookie for that path only, good for a week; changing the password ends every session.
import type { AstroCookies } from "astro";
import { HALLOWEEN_PASSWORD, HALLOWEEN_SECRET } from "astro:env/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MIN_LENGTH = 16;
const SESSION_DAYS = 7;
const COOKIE = "register";
const digest = (value: string) => createHash("sha256").update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** Compared in constant time; a missing or short secret, or no password, keeps the page closed */
export const isSecret = (value: string | undefined) =>
	!!HALLOWEEN_SECRET && HALLOWEEN_SECRET.length >= MIN_LENGTH && !!HALLOWEEN_PASSWORD && !!value && same(value, HALLOWEEN_SECRET);

export const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** Never cached, never indexed, never leaked through a Referer */
export const PRIVATE_HEADERS = {
	"Cache-Control": "no-store",
	"X-Robots-Tag": "noindex, nofollow",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
};

// ---------------------------------------------------------------- password and session

const sign = (expires: string) => createHmac("sha256", `${HALLOWEEN_SECRET}\0${HALLOWEEN_PASSWORD}`).update(expires).digest("base64url");

export const isSignedIn = (cookies: AstroCookies) => {
	const [expires, signature] = cookies.get(COOKIE)?.value.split(".") ?? [];

	return !!expires && !!signature && Number(expires) > Date.now() && same(signature, sign(expires));
};

const cookieOptions = (secret: string) => ({
	path: `/${secret}/`,
	httpOnly: true,
	sameSite: "strict" as const,
	secure: import.meta.env.PROD,
});

export const signIn = (cookies: AstroCookies, secret: string) => {
	const expires = String(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

	cookies.set(COOKIE, `${expires}.${sign(expires)}`, { ...cookieOptions(secret), maxAge: SESSION_DAYS * 24 * 60 * 60 });
};

export const signOut = (cookies: AstroCookies, secret: string) => cookies.delete(COOKIE, cookieOptions(secret));

// A handful of wrong passwords per address every quarter of an hour, then nothing is even checked
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

const recentFailures = (address: string) => (failures.get(address) ?? []).filter((time) => Date.now() - time < WINDOW_MS);

export const isLockedOut = (address: string) => recentFailures(address).length >= MAX_FAILURES;

export const checkPassword = (address: string, value: unknown) => {
	const ok = typeof value === "string" && value.length <= 200 && !!HALLOWEEN_PASSWORD && same(value, HALLOWEEN_PASSWORD);

	if (!ok) {
		failures.set(address, [...recentFailures(address), Date.now()]);
	}
	return ok;
};
