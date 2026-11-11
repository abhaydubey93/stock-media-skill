# Pixabay Media

Search, download, and license royalty-free stock photos, illustrations, vectors,
and stock footage from Pixabay — as a Claude Code plugin.

Three skills cover the whole workflow:

| Skill | Use it for |
|---|---|
| `pixabay-search` | Finding images and videos; query strategy and filters |
| `pixabay-images` | Picking a rendition, downloading, avoiding hotlink violations |
| `pixabay-videos` | Picking a video rendition, downloading, embedding |
| `pixabay-licensing` | Commercial use, attribution, prohibited uses, API terms |

An MCP server (`pixabay`) exposes the same operations as tools:
`search_images`, `search_videos`, `get_image`, `get_video`, `download_image`,
`download_video`. Every download also writes a `.json` sidecar recording the
author, source page, licence link, and tags.

## Setup

You need a free Pixabay API key from <https://pixabay.com/api/docs/>.

Set it one of two ways:

1. Run `/config` in Claude Code and fill in **"Pixabay API key"**. The value is
   stored in secure credential storage, never in `settings.json`. This is what
   the MCP server reads.
2. Export `PIXABAY_API_KEY` in your shell, or write
   `~/.pixabay/config.json` containing `{ "api_key": "<your key>" }`.

The plugin then works in every session where it is enabled.

## Image renditions, and two surprises

Pixabay's documentation describes rendition URLs in a way that does not match
the live CDN. Both were verified against the live API and CDN on 2026-11-11,
and the plugin handles the real behaviour rather than the documented one:

- **Two URL families.** `previewURL` is a direct CDN link whose size is a
  filename segment, so other sizes can be derived from it. `webformatURL`,
  `largeImageURL`, `fullHDURL`, and `imageURL` are `pixabay.com/get/<token>`
  proxy links whose token is bound to one size — substituting the suffix on
  those returns 404.
- **`_180` and `_340` do not exist.** The docs say you can substitute them;
  the CDN returns 403, the same as a nonsense filename. The 960px file is
  `_960_720`, not `_960`. The download therefore resolves `web_180` to 150px
  and `web_340` to 640px, and reports the `resolved_url` it used.

Measurements and the full field list are in
`references/cdn-renditions.md`.

### Install

```
/plugin install pixabay-media --marketplace abhaydubey93/stock-media-skill
```

From a local checkout, add the marketplace and install from it:

```bash
git clone https://github.com/abhaydubey93/stock-media-skill.git
cd stock-media-skill
claude plugin marketplace add .
claude plugin install pixabay-media@stock-media
```

Or load the plugin directory directly for development:

```bash
claude --plugin-dir ./pixabay-media
```

## Requirements

Node.js 18+ (for the built-in `fetch`). No `npm install`, no Python, no
dependencies of any kind — the server and CLI are plain `.mjs` files.

## Using it directly

Ask Claude in plain language — "find me a horizontal stock photo of a mountain
lake at sunrise" — or call the MCP tools directly:

```
search_images  { "query": "mountain lake sunrise", "orientation": "horizontal", "min_width": 1920 }
download_image { "id": 195893, "size": "large", "destination": "./assets" }
```

The same functionality is available from the CLI without the MCP server:

```bash
node scripts/pixabay.mjs search-images "mountain lake" --orientation horizontal
node scripts/pixabay.mjs download-image 195893 --dest ./assets --size large
node scripts/pixabay.mjs --help
```

## Notes on Pixabay's terms

The server caches every response for 24 hours, as Pixabay's API documentation
requires. The default rate limit is 100 requests per 60 seconds per API key.

Permanent hotlinking of **images** is not permitted — download them to your own
server or disk. Videos may be embedded directly, though self-hosting is
recommended. Attribution is optional under the Pixabay Content License, but
appreciated; the author is recorded in every download sidecar.

Licensing details live in the `pixabay-licensing` skill and in
`skills/pixabay-search/references/api.md`.

## Licence

MIT for the plugin code. The media itself is covered by the
[Pixabay Content License](https://pixabay.com/service/license-summary/).
