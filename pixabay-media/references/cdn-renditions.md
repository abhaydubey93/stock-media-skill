---
name: pixabay-cdn-rendition-urls
description: Verified facts about how Pixabay image and video rendition URLs are actually named, which URL families the API returns, and which parts of the official docs are wrong. Use when implementing or debugging Pixabay image size variants (preview, web_180, web_340, web_640, web_960, large, fullHD, original, vector), when a rendition URL returns 403 or 404, when deciding whether to substitute a size suffix, or when implementing a Pixabay API client.
metadata:
  type: reference
---

# Pixabay rendition URLs — measured, not documented

Measured 2026-11-11 against the live API (real key) and the live CDN, by
probing 25+ distinct images plus the canonical docs example, with and without
a `Referer` header. These results contradict the official API docs in one
important way.

## The API returns TWO URL families, and they behave differently

| Field | Family | Example |
|---|---|---|
| `previewURL` | **CDN** | `https://cdn.pixabay.com/photo/2017/05/09/03/46/alberta-2297204_150.jpg` |
| `webformatURL` | **proxy** | `https://pixabay.com/get/<token>_640.jpg` |
| `largeImageURL` | **proxy** | `https://pixabay.com/get/<token>_1280.jpg` |
| `fullHDURL` | proxy | `https://pixabay.com/get/<token>_1920.jpg` |
| `imageURL` | proxy | `https://pixabay.com/get/<token>.jpg` |

**CDN form** — the size is a filename segment, so other sizes CAN be derived by
swapping it.

**Proxy form** — the token is bound to one specific size. Swapping the suffix
produces a 404. The token is a 96-hex string starting with `g`; the docs show
an older 16-hex form. Proxy URLs may also carry `?longlived=`, and without that
query param they expire ("This URL is invalid or has expired", HTTP 400).

**Practical consequence:** derive sizes from `previewURL` (CDN form), not from
`webformatURL` (proxy form).

## Image size tokens that actually exist

| Token | Exists | Meaning |
|---|---|---|
| `_150` | **yes** (25/25) | preview — `previewURL` points here |
| `_640` | **yes** (25/25) | webformat — `webformatURL` points here |
| `_960_720` | **yes** (25/25) | the 960×720 variant |
| `_1280` | **yes** (25/25) | large — `largeImageURL` points here |
| `_180` | **no** (0/25) | 403 |
| `_340` | **no** (0/25) | 403 |
| `_960` | **no** (0/25) | 403 — the live file is `_960_720` |
| `_1920` | **no** (0/25) | 403 without full API access |

A 403 from the CDN means **that file does not exist** — a nonsense filename
returns the identical 403. It is not hotlink protection: sending
`Referer: https://pixabay.com/` changes nothing, and query parameters like
`?w=180` are ignored (the bytes come back identical to the unmodified file).

## What the docs get wrong

The API docs say:

> Replace '_640' in any webformatURL value to access other image sizes:
> replace with '_180' or '_340' ... replace with '_960'

Taken literally against a proxy-form `webformatURL`, this yields 404s, because
the token — not the suffix — selects the rendition. The `_960` suffix also
misses: the live file is `_960_720`.

## Video renditions

No guessing needed — the API returns `videos.large`, `videos.medium`,
`videos.small`, `videos.tiny` objects, each with its own `url` and `thumbnail`.
Verified live: `.../video/2015/08/08/125-135736646_large.mp4`, `_medium.mp4`,
`_small.mp4`, `_tiny.mp4` all return 200, with matching `_large.jpg` /
`_medium.jpg` posters. Video URLs appear in CDN form
(`cdn.pixabay.com/video/...`) or proxy form (`pixabay.com/video/...`) —
both work as given. `large` may be absent entirely (empty `url`, `size` 0)
for videos with no 4K source.

## Fields the docs omit

The live API returns these on both images and videos, and they are worth
surfacing:

| Field | Meaning |
|---|---|
| `noAiTraining` | Training use is blocked for this asset (`true`/`false`). |
| `isAiGenerated` | The asset itself was AI-generated. |
| `isGRated` | The asset contains G-rated (sensitive) content. |
| `isLowQuality` | Pixabay flags the asset as low quality. |
| `collections` | How many collections the asset is in (may be null). |
| `userURL` | Author profile — `https://pixabay.com/users/<user_id>/`. |
| `name` | The asset's keyword string. |
| `heading` | A human-readable title (often empty). |
| `description` | A human-readable description (often empty). |

Note `userURL` uses the numeric id only. The docs' format
`https://pixabay.com/users/{USERNAME}-{ID}/` does not match the live value.

## How to apply this

**Never hand a derived URL to a user as if it were verified.** Instead:

1. Use the API-provided fields as authoritative for their exact size.
2. For other sizes, derive from `previewURL` (CDN form) — that is the only
   family where substitution works.
3. Keep an ordered **candidate list** and verify at download time by fetching
   until one returns 2xx:
   - `preview` → `_150`
   - `web_180` → `_180`, then `_150`
   - `web_340` → `_340`, then `_640`
   - `web_640` → `_640`
   - `web_960` → `_960_720`, then `_1280`
   - `large` → `_1280`
4. Verify at download time, not at list time — the listing stays cheap, and the
   download either succeeds or reports which renditions actually exist.

This makes the client correct against both URL families, and against the
documented-but-unimplemented `_180` / `_340` sizes, without ever guessing.

## See also

- `skills/pixabay-search/references/api.md` — parameter and field reference.
- `skills/pixabay-images/SKILL.md` — the rendition ladder from a user's point of view.
