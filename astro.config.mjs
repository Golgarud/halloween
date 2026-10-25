// @ts-check
import node from "@astrojs/node";
import { defineConfig, envField } from "astro/config";

// The pages are static; only the form's endpoint and the hidden responses page run on the server
// (`export const prerender = false`), on Node: `bun run build`, then `node dist/server/entry.mjs`.
export default defineConfig({
	adapter: node({ mode: "standalone" }),
	env: {
		schema: {
			// The hidden address of the responses: /<HALLOWEEN_SECRET>/ (no secret, no page)
			HALLOWEEN_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
			// And the password asked there (no password, no page either)
			HALLOWEEN_PASSWORD: envField.string({ context: "server", access: "secret", optional: true }),
			// Where the responses are kept, outside anything that is served
			HALLOWEEN_DATA: envField.string({ context: "server", access: "secret", default: "data/responses.json" }),
		},
	},
	vite: {
		server: {
			// The dev server serves project files by path: keep the responses out, as .env is
			fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/data/**"] },
		},
	},
});
