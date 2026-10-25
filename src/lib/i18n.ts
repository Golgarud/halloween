// The form's words, in French (the default) and English. The titles stay in English in both, on
// purpose: they are part of the poster, like the castle.
import { LIMITS, type ErrorCode } from "./rsvp";

export const LANGS = ["fr", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "fr";

/** What comes back from the server when the answer is refused before the fields are even read */
export type FailureCode = "tooLong" | "tooMany" | "unreadable" | "unexpected" | "generic" | "network" | "noScript";

type Text = {
	lede: string;
	name: string;
	present: string;
	yes: string;
	no: string;
	drink: string;
	food: string;
	films: string;
	filmsHint: string;
	film1: string;
	film2: string;
	film3: string;
	filmLabel: (n: number) => string;
	submit: string;
	sending: string;
	trap: string;
	doneYes: string;
	doneNo: string;
	again: string;
	switchLabel: string;
	errors: Record<ErrorCode | FailureCode, string>;
};

export const TEXT: Record<Lang, Text> = {
	fr: {
		lede: "Petite soirée Halloween, le 31/10/26 à 19h. La soirée sera chill : movie night, un ou deux films d'horreur.",
		name: "Nom complet",
		present: "Seras-tu des nôtres ?",
		yes: "Oui, je viendrai",
		no: "Non, je ne peux pas",
		drink: "J'apporte un truc à boire",
		food: "J'apporte un truc à manger",
		films: "Trois idées de films (on votera sur place)",
		filmsHint: "Facultatif. Ce qui devrait hanter l'écran.",
		film1: "Première idée",
		film2: "Deuxième idée",
		film3: "Troisième idée",
		filmLabel: (n) => `Idée de film ${n}`,
		submit: "Signer le registre",
		sending: "Scellement…",
		trap: "Laisser vide",
		doneYes: "Ton nom est inscrit au registre. Viens quand la lune sera levée.",
		doneNo: "Soit. Le donjon se souviendra de toi. Tu peux encore changer d'avis.",
		again: "Modifier ma réponse",
		switchLabel: "Langue",
		errors: {
			nameLength: `Ton nom complet, de ${LIMITS.name.min} à ${LIMITS.name.max} caractères.`,
			nameChars: "Uniquement des lettres, espaces, tirets ou apostrophes.",
			nameFull: "Ton nom complet : prénom et nom.",
			present: "Dis-nous si tu viens.",
			bring: "Coche la case, ou laisse-la vide.",
			movieLength: `${LIMITS.movie.max} caractères au maximum.`,
			movieChars: "Lettres, chiffres et ponctuation simple uniquement.",
			tooLong: "Ta réponse est trop longue.",
			tooMany: "Trop de réponses d'un coup. Réessaie dans quelques minutes.",
			unreadable: "Le formulaire n'a pas pu être lu. Réessaie.",
			unexpected: "Le formulaire a été modifié. Recharge la page.",
			generic: "Un problème est survenu. Réessaie.",
			network: "Le donjon est injoignable. Réessaie.",
			noScript: "Ta réponse n'a pas pu être enregistrée. Vérifie le formulaire et réessaie.",
		},
	},
	en: {
		lede: "A small Halloween party, on 31/10/26 at 7 pm. A chill evening: movie night, one or two horror films.",
		name: "Full name",
		present: "Will you be there?",
		yes: "Yes, I will come",
		no: "No, I cannot",
		drink: "I'll bring something to drink",
		food: "I'll bring something to eat",
		films: "Three film ideas (we'll vote on the night)",
		filmsHint: "Optional. Whatever should haunt the screen.",
		film1: "First idea",
		film2: "Second idea",
		film3: "Third idea",
		filmLabel: (n) => `Film idea ${n}`,
		submit: "Sign the register",
		sending: "Sealing…",
		trap: "Leave this empty",
		doneYes: "Your name is in the register. Come when the moon is up.",
		doneNo: "So be it. The keep will remember you. You can still change your mind.",
		again: "Change my answer",
		switchLabel: "Language",
		errors: {
			nameLength: `Your full name, ${LIMITS.name.min} to ${LIMITS.name.max} characters.`,
			nameChars: "Letters only, with spaces, hyphens or apostrophes.",
			nameFull: "Your full name: first and last.",
			present: "Tell us if you will come.",
			bring: "Tick the box, or leave it empty.",
			movieLength: `At most ${LIMITS.movie.max} characters.`,
			movieChars: "Letters, digits and simple punctuation only.",
			tooLong: "Your answer is too long.",
			tooMany: "Too many answers at once. Try again in a few minutes.",
			unreadable: "The form could not be read. Try again.",
			unexpected: "The form was changed. Reload the page.",
			generic: "Something went wrong. Try again.",
			network: "The keep could not be reached. Try again.",
			noScript: "Your answer could not be kept. Check the form and try again.",
		},
	},
};

/** Titles, the same in both languages */
export const TITLES = {
	kicker: "All Hallows' Eve",
	heading: "You are summoned",
	doneKicker: "Your answer is kept",
	doneYes: "The keep will be waiting",
	doneNo: "So be it",
};

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);
