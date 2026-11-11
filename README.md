# Pixabay Media

A Claude Code plugin for sourcing royalty-free stock photos, illustrations,
vectors, and stock footage from [Pixabay](https://pixabay.com/).

It ships four skills and a stdio MCP server. Ask for stock media in plain
language and it searches, filters, downloads, and keeps the licensing
metadata attached.

```
"I need a horizontal stock photo of a mountain lake for a 1440px hero banner"
"Find a light looping video of autumn leaves for mobile"
"Can I use this Pixabay photo in a paid course without crediting the author?"
```

## Why this exists

Pixabay's official API documentation describes image rendition URLs in a way
that does not match the live CDN. Implementing from the docs alone produces
404s and misleading file sizes. This plugin is built against **measured**
behaviour, and documents the difference.

Verified against the live API and CDN across 25+ images:

| The docs say | What actually happens |
|---|---|
| Replace `_640` with `_180` or `_340` in `webformatURL` | Both return 403 — those files do not exist |
| Replace `_640` with `_960` | Returns 403 — the real file is `_960_720` |
| `webformatURL` is a CDN URL | It is a `pixabay.com/get/<token>` proxy URL whose token is bound to one size |

A 403 from the CDN means the file is missing, not that hotlinking is blocked:
a nonsense filename returns the identical 403, `Referer` headers change
nothing, and `?w=` query parameters are ignored.

The plugin derives other sizes from `previewURL` — the one field that is a
direct CDN link — verifies each candidate URL at download time, and falls back
in order. It also reports the `resolved_url` it actually used, so you always
know which file landed.

Full measurements: [`pixabay-media/references/cdn-renditions.md`](pixabay-media/references/cdn-renditions.md).

## Install

### From a marketplace

```
/plugin install pixabay-media --marketplace abhaydubey93/stock-media-skill
```

### From a clone

```bash
git clone https://github.com/abhaydubey93/stock-media-skill.git
cd stock-media-skill
claude plugin marketplace add .
claude plugin install pixabay-media@stock-media
```

### For development

```bash
claude --plugin-dir ./pixabay-media
```

The plugin loads in place, so edits take effect on the next session start or
`/reload-plugins`.

## Setup

You need a free API key from <https://pixabay.com/api/docs/>.

Set it either way:

1. Run `/config` in Claude Code and fill in **"Pixabay API key"**. The value is
   stored in secure credential storage, never in `settings.json`.
2. Export `PIXABAY_API_KEY` in your shell, or write
   `~/.pixabay/config.json` containing `{ "api_key": "<your key>" }`.

## The skills

| Skill | What it does |
|---|---|
| `pixabay-search` | Query strategy, every filter, how to narrow a search that missed |
| `pixabay-images` | Choosing a rendition, downloading, hotlink rules, expiring URLs |
| `pixabay-videos` | Rendition ladder, embedding vs self-hosting, trimming with ffmpeg |
| `pixabay-licensing` | Commercial use, attribution, prohibited uses, API terms |

## MCP tools

| Tool | Purpose |
|---|---|
| `search_images` | Search images with every documented filter |
| `search_videos` | Search stock footage, with duration and renditions |
| `get_image` | Fetch one image by id with full metadata |
| `get_video` | Fetch one video by id with full metadata |
| `download_image` | Save an image at a chosen rendition, plus a `.json` sidecar |
| `download_video` | Save a video at a chosen rendition, plus a `.json` sidecar |

Every download writes a sibling `<file>.json` recording the Pixabay id, author,
author profile, source page, licence link, and tags — so the asset stays
attributable after the filename stops saying anything useful.

## Using it directly

The same functionality is available from a CLI, without the MCP server:

```bash
node pixabay-media/scripts/pixabay.mjs search-images "mountain lake" \
  --orientation horizontal --min-width 1920

node pixabay-media/scripts/pixabay.mjs search-videos "city timelapse" \
  --video-type film --per-page 10 --json

node pixabay-media/scripts/pixabay.mjs download-image 2297204 \
  --dest ./assets --size web_960

node pixabay-media/scripts/pixabay.mjs download-video 14385 \
  --dest ./assets --size medium

node pixabay-media/scripts/pixabay.mjs --help
```

## Requirements

Node.js 18 or newer, for the built-in `fetch`. Nothing else — no `npm install`,
no Python, no dependencies. The server and CLI are plain `.mjs` files.

## Image renditions

| Rendition | Size | Notes |
|---|---|---|
| `preview` | 150px | Thumbnails, previews |
| `web_180` | 180px | Resolves to 150px — no 180px file exists |
| `web_340` | 340px | Resolves to 640px — no 340px file exists |
| `web_640` | 640px | Exact |
| `web_960` | 960×720 | Exact, served as `_960_720` |
| `large` | 1280px | Exact — the default for web use |
| `fullHD` | 1920px | Needs an account approved for full API access |
| `original` | Native | Needs full API access |
| `vector` | SVG | Needs full API access |

## Metadata the API returns but the docs omit

`noAiTraining`, `isAiGenerated`, `isGRated`, `isLowQuality`, `collections`,
`userURL`, `name`, `heading`, and `description`.

`noAiTraining` is the per-asset answer to "may this be used for AI/ML
training?" — the licence summary is silent, but this flag is not, and it
varies between assets.

## Rate limits and caching

Pixabay allows 100 requests per 60 seconds per API key and requires
responses to be cached for 24 hours. The MCP server and CLI cache every
response for 24 hours automatically; pass `--no-cache` to bypass it.

## Licensing

Attribution is optional under the Pixabay Content License, but appreciated.
Permanent hotlinking of **images** is not permitted — download them to your own
server or disk. Videos may be embedded directly, though self-hosting is
recommended. Standalone redistribution of unmodified assets is prohibited.

See the `pixabay-licensing` skill and
[the Pixabay Content License](https://pixabay.com/service/license-summary/).

## Development

Run the local mock API to work offline or test error paths:

```bash
node pixabay-media/scripts/mock-pixabay.mjs 8731
PIXABAY_API_BASE=http://127.0.0.1:8731 PIXABAY_API_KEY=TESTKEY \
  node pixabay-media/scripts/pixabay.mjs search-images "blossom"
```

The mock honours `MOCK_CDN_BASE` for its asset URLs.

## Licence

MIT — see [LICENSE](LICENSE). The plugin code is MIT; the media it retrieves
is covered by the [Pixabay Content License](https://pixabay.com/service/license-summary/).
