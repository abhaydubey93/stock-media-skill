---
name: pixabay-search
description: Find royalty-free stock photos, illustrations, vectors, and stock videos on Pixabay. Use this skill whenever someone asks to search for stock imagery, find a background photo, look up stock footage or B-roll, find an illustration or vector graphic, or wants to browse Pixabay by category, colour, orientation, or mood - even if they never say "Pixabay" but ask for "a free stock photo of a cat" or "some royalty free footage of a city at night". Also use it to narrow an existing search that returned too many or too few results.
---

# Search Pixabay stock media

Pixabay exposes two documented endpoints, both requiring an API key:

| Media | Endpoint | Tool |
|---|---|---|
| Images | `GET https://pixabay.com/api/` | `search_images` |
| Videos | `GET https://pixabay.com/api/videos/` | `search_videos` |

## Before searching

**Check the key works.** Every call needs a valid key. If a search fails with
`No Pixabay API key found` or `Pixabay rejected the API key`, do not retry — tell
the user to add their key with `/config` (the "Pixabay API key" option) or by
setting `PIXABAY_API_KEY`. The key is free and takes a minute to obtain at
<https://pixabay.com/api/docs/>.

**Prefer the MCP tools.** `search_images` and `search_videos` return compact
summaries: id, tags, page URL, author, popularity, and ready-to-use rendition
URLs. They also cache responses for 24 hours, which is what Pixabay's terms
require and it keeps you well inside the rate limit.

If the MCP server is not available in this session, the same functionality is
available through the bundled CLI:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pixabay.mjs" search-images "sunset beach" --orientation horizontal --per-page 10
node "${CLAUDE_PLUGIN_ROOT}/scripts/pixabay.mjs" search-videos "city timelapse" --video-type film --json
```

## Searching well

Pixabay matches on tags, so **concrete nouns beat descriptions**. "coffee cup"
finds more than "a cozy morning scene with a warm drink". Two or three terms
usually work best; the query field accepts at most 100 characters.

| Intent | Filter to reach it |
|---|---|
| Hero image for a web page | `--orientation horizontal`, `min_width 1920` |
| Phone wallpaper, story graphic | `--orientation vertical` |
| Icon, logo-ish graphic | `--image_type vector` |
| Hand-drawn or cartoon look | `--image_type illustration` |
| Real-world photo | `--image_type photo` |
| Footage with motion graphics | `--video_type animation` |
| Live-action footage | `--video_type film` |
| Safe for all audiences | `--safesearch true` |
| Curated high-quality picks | `--editors_choice true` |
| Brand-matching palette | `--colors blue,white` |
| Lowest-noise result set | `--category nature` + `--min_width 1920` |

The full parameter list, every valid enum value, and the response fields are in
[references/api.md](references/api.md). Read it when you need a filter that isn't
in the table above, or when you need to interpret an unfamiliar response field.

## Choosing filters instead of paging

**`totalHits` is capped at 500 per query** — page 25 at 20 results per page is the
end of the road. The response flags this with `hitsCapReached: true`. When you hit
the cap, the fix is a narrower query or tighter filters, never a deeper page.
Broad terms like "background" easily return the full 500; adding
`--category backgrounds --orientation vertical --min_width 1080` usually surfaces
the right images in the first page.

## Narrowing a search that missed

Pixabay's index is tag-based, so a miss usually means wrong vocabulary rather
than a broken query. Try, in order:

1. Drop the adjectives — "mountain" instead of "beautiful snowy mountain".
2. Swap synonyms for the concrete object — "automobile" for "car" if "car" missed.
3. Remove the `image_type` / `category` filter and re-add it once you know the
   right results are in range.
4. Try the plural or the bare noun.

## Presenting results

Give the user a short shortlist, not a wall of URLs. For each candidate include
the **id**, a **one-line description**, the **author**, and the **page URL**
(`pageURL` on the result) so they can verify and credit it. Two to five
candidates is usually right; more than that and nobody chooses.

Flag `hitsCapReached` when it is true — it means the query was too broad to be
exhaustive, and there may be better matches on page 2 that the cap hides.

### Metadata worth checking before recommending

Every result carries flags the official field list omits. Read them before
recommending an asset for anything sensitive:

| Flag | Why it matters |
|---|---|
| `noAiTraining` | `true` means the asset is off-limits for AI/ML training. |
| `isAiGenerated` | The asset is AI-generated, not photographed. |
| `isGRated` | The asset contains G-rated content. |
| `isLowQuality` | Pixabay flags it as low quality. |

For a brand site, a public landing page, or anything with a mixed audience,
check `isGRated` before showing the asset. For AI training or dataset work,
filter on `noAiTraining: false` and say you did.

Also note `duration` for videos and `imageWidth`/`imageHeight` for images — a
40-second clip for a 5-second hero is wasted bytes, and a 500×300 image will
not fill a 1440px banner.

Point at the `pixabay-images` and `pixabay-videos` skills when the user wants to
download or pick a specific rendition, and `pixabay-licensing` when they ask
about attribution or commercial use.
