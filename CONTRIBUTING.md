# Contributing

Thanks for helping improve this plugin.

## Getting set up

```bash
git clone https://github.com/<owner>/stock-media-skill.git
cd stock-media-skill
claude --plugin-dir ./pixabay-media
```

The plugin loads in place, so your edits are live on the next session start or
`/reload-plugins`.

## Before you open a pull request

```bash
claude plugin validate pixabay-media --strict
node --check pixabay-media/scripts/pixabay-core.mjs
node --check pixabay-media/scripts/pixabay-mcp.mjs
node --check pixabay-media/scripts/pixabay.mjs
```

## Testing without an API key

A mock Pixabay API ships with the plugin:

```bash
node pixabay-media/scripts/mock-pixabay.mjs 8731
```

Point the client at it with `PIXABAY_API_BASE`:

```bash
PIXABAY_API_BASE=http://127.0.0.1:8731 PIXABAY_API_KEY=TESTKEY \
  node pixabay-media/scripts/pixabay.mjs search-images "blossom" --json
```

## Things worth knowing before you change the URL handling

Pixabay returns two URL families and they behave differently:

- `previewURL` is a direct CDN link whose size is a filename segment, so other
  sizes can be derived from it.
- `webformatURL`, `largeImageURL`, `fullHDURL`, and `imageURL` are
  `pixabay.com/get/<token>` proxy links bound to a single size. Substituting
  the suffix on these returns 404.

The size tokens that exist are `_150`, `_640`, `_960_720`, and `_1280`.
`_180`, `_340`, `_960`, and `_1920` do not — they return 403, the same as a
nonsense filename.

If you touch `imageUrlCandidates` or `cdnSizeVariant`, re-verify against the
live CDN. The measurements are recorded in
[`pixabay-media/references/cdn-renditions.md`](pixabay-media/references/cdn-renditions.md).

**Never hand a derived URL to a user as if it were verified.** Keep the ordered
candidate list and confirm at download time.

## Style

- The code runs on Node 18+ with no dependencies. Do not add one.
- Keep the MCP server and the CLI sharing `pixabay-core.mjs` rather than
  duplicating logic — they are two front ends over one client.
- Skills are Markdown. Keep each under 500 lines and push detail into
  `references/`.
- Comment the *why*, especially where the upstream API or docs behave
  strangely.

## Adding a skill

Create `pixabay-media/skills/<name>/SKILL.md` with YAML frontmatter:

```yaml
---
name: <name>
description: <what it does and when to use it — this is the trigger>
---
```

The description is the only thing Claude sees when deciding whether to load
it, so lead with the concrete triggers and include the phrasings a user would
actually type.
