// The responses, kept in one JSON file outside anything the site serves (HALLOWEEN_DATA). Writes go
// one at a time, to a temporary file then renamed over the old one, so a crash or two people
// answering at once never leave it half written.
import { HALLOWEEN_DATA } from "astro:env/server";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Rsvp } from "./rsvp";

export type Response = Rsvp & { id: string; createdAt: string; updatedAt: string };

const file = resolve(HALLOWEEN_DATA);
let queue: Promise<unknown> = Promise.resolve();

export const readResponses = async (): Promise<Response[]> => {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
};

/** The same full name answering again replaces their earlier answer */
const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

export const saveResponse = (rsvp: Rsvp) => {
	const write = queue.then(async () => {
		const responses = await readResponses();
		const now = new Date().toISOString();
		const index = responses.findIndex((response) => sameName(response.name, rsvp.name));
		const response: Response =
			index >= 0
				? { ...responses[index], ...rsvp, updatedAt: now }
				: { id: randomUUID(), ...rsvp, createdAt: now, updatedAt: now };

		if (index >= 0) {
			responses[index] = response;
		} else {
			responses.push(response);
		}
		await mkdir(dirname(file), { recursive: true });
		await writeFile(`${file}.tmp`, JSON.stringify(responses, null, "\t"));
		await rename(`${file}.tmp`, file);
		return { response, updated: index >= 0 };
	});

	queue = write.catch(() => undefined);
	return write;
};
