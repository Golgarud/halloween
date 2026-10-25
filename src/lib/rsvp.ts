// The form's rules, shared by the browser (instant feedback) and the server (the one that counts).
// Inputs are allow-listed rather than "cleaned": a name is letters and a few joiners, a film title
// is letters, digits and ordinary punctuation. Anything else, markup and control or invisible
// characters included, is refused, so nothing stored can ever be read as HTML or script.

export const FIELDS = ["name", "present", "movie1", "movie2", "movie3"] as const;
/** Hidden from people, filled by bots */
export const TRAP = "website";

export type Field = (typeof FIELDS)[number];
export type Rsvp = { name: string; present: boolean; movies: string[] };
export type Errors = Partial<Record<Field, string>>;

export const LIMITS = { name: { min: 2, max: 80 }, movie: { max: 100 } };

// Letters (any script) and their accents, joined by spaces, apostrophes, hyphens and dots
const NAME = /^\p{L}[\p{L}\p{M} '’.-]*$/u;
// Letters, digits and the punctuation film titles actually use; no < > " ` { } \ =
const MOVIE = /^[\p{L}\p{M}\p{N} '’.,:;!?&()/#+*-]*$/u;

/** Unicode-normalised, trimmed, with runs of spaces folded into one */
export const tidy = (value: unknown) => (typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "");

export const validate = (input: Record<string, unknown>): { ok: true; rsvp: Rsvp } | { ok: false; errors: Errors } => {
	const errors: Errors = {};
	const name = tidy(input.name);
	const present = input.present;
	const movies = (["movie1", "movie2", "movie3"] as const).map((field) => [field, tidy(input[field])] as const);

	if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) {
		errors.name = `Your full name, ${LIMITS.name.min} to ${LIMITS.name.max} characters.`;
	} else if (!NAME.test(name)) {
		errors.name = "Letters only, with spaces, hyphens or apostrophes.";
	} else if (!name.includes(" ")) {
		errors.name = "Your full name: first and last.";
	}
	if (present !== "yes" && present !== "no") {
		errors.present = "Tell us if you will come.";
	}
	for (const [field, title] of movies) {
		if (title.length > LIMITS.movie.max) {
			errors[field] = `At most ${LIMITS.movie.max} characters.`;
		} else if (!MOVIE.test(title)) {
			errors[field] = "Letters, digits and simple punctuation only.";
		}
	}

	if (Object.keys(errors).length) {
		return { ok: false, errors };
	}
	return {
		ok: true,
		rsvp: { name, present: present === "yes", movies: movies.map(([, title]) => title).filter(Boolean) },
	};
};
