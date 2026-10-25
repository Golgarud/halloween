# The Drowned Keep

A Halloween invitation: a painted, animated Lovecraftian castle with a form to answer it (full name,
coming or not, three films). The first, storybook take on the illustration is kept at `/cartoon/`.

## Running it

```sh
bun install
cp .env.example .env   # then set HALLOWEEN_SECRET to something long and random
bun run dev            # http://localhost:4321
```

In production: `bun run build`, then `bun run start` (Node, which loads `.env`). Put it behind a
reverse proxy that forwards the `Host` header; `PORT` and `HOST` set where it listens.

## The answers

- Stored in `data/responses.json` (or `HALLOWEEN_DATA`), which is never served and not in git.
- Readable only at `/<HALLOWEEN_SECRET>/` (a table) and `/<HALLOWEEN_SECRET>/responses.json` (raw).
  Any other address there is a plain 404; without a secret of 16+ characters the page stays closed.
- Answering again with the same full name replaces the earlier answer.

Every value is checked against an allow-list, in the browser and again on the server
(`src/lib/rsvp.ts`): markup, control and invisible characters are refused. Astro escapes everything
the register shows, and that page sends a strict Content-Security-Policy. The endpoint also refuses
cross-site posts, bodies over 4 KB, unexpected fields, filled bot traps, and more than 20 answers per
address in ten minutes.

## Where things are

| Path | What |
| --- | --- |
| `src/scripts/eldritch-castle.ts` | The illustration, painted on a canvas |
| `src/scripts/cartoon-castle.ts` | The storybook version (`/cartoon/`) |
| `src/components/RsvpForm.astro` | The form |
| `src/lib/rsvp.ts` | Validation, shared by the form and the server |
| `src/lib/store.ts` | Reading and writing the answers |
| `src/pages/api/rsvp.ts` | Where the form posts |
| `src/pages/[secret]/` | The hidden register |
