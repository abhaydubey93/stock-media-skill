---
name: pixabay-licensing
description: Explain the Pixabay Content License, attribution rules, commercial-use rights, prohibited uses, hotlinking rules, rate limits, and API terms for Pixabay images and videos. Use this skill whenever someone asks whether they can use a Pixabay asset commercially, whether they must credit the author, what "standalone redistribution" means, whether AI or ML training is allowed, or what the API's rate-limit and caching obligations are - and also whenever you are about to ship media from Pixabay and need to confirm the usage is permitted.
---

# Pixabay licensing and API terms

Summarised from <https://pixabay.com/service/license-summary/> and
<https://pixabay.com/api/docs/>. Where these two conflict, the licence summary
governs the media and the API docs govern the API.

## What is allowed

- **Free of charge**, for commercial *and* non-commercial use.
- **Modify or adapt** the content into new works.
- **Use without crediting the author** — attribution is optional, though
  "giving credit is always appreciated". The author name and profile URL are in
  every search result and in every download sidecar, so crediting is cheap when
  the user wants it.
- Use the content inside a larger work: a website, a video, a presentation, a
  poster, a product, an ad.

## What is prohibited

- **Selling or distributing the content as a standalone item**, digitally or
  physically. "Standalone" means no creative effort was applied and the content
  is substantially unchanged. So: using a photo as the hero image of a website
  is fine; uploading the unmodified photo to a "free stock photos" site is not.
- **Selling unmodified copies** or redistributing the content on a standalone
  basis.
- **Using recognisable trademarks, logos, or brands** commercially in connection
  with goods or services — including printing the content on merchandise for
  sale.
- **Using the content as part of a trademark, design mark, trade name, business
  name, or service mark.**
- **Immoral, illegal, misleading, or deceptive use**, including using content
  featuring recognisable people in an immoral or illegal way.

## AI / ML training — the API answers this per asset

The licence summary is silent on AI/ML training, but **the API returns a
per-asset flag**: `noAiTraining` (boolean).

- `noAiTraining: false` → training use is not blocked for this asset.
- `noAiTraining: true` → training use is blocked for this asset.

Measured 2026-11-11 across image and video searches: the flag is genuinely
mixed, not a constant — roughly 1 in 10 assets came back `true`. Two other
flags come back alongside it:

| Field | Meaning |
|---|---|
| `noAiTraining` | Training use is blocked for this asset. |
| `isAiGenerated` | The asset itself was AI-generated. |
| `isGRated` | The asset contains G-rated (sensitive) content. |
| `isLowQuality` | Pixabay flags the asset as low quality. |

**Read these fields before recommending an asset for any AI/ML or
brand-safety-sensitive work.** Filter on `noAiTraining: false` and
`isAiGenerated: false` when the user needs training-safe or human-made
footage, and say which filter you applied.

`isGRated: true` is the API's own marker for sensitive content — worth
checking when the destination is a public site, a brand campaign, or anything
with a mixed audience.

Because the licence summary itself is silent, treat `noAiTraining` as the
authoritative per-asset signal rather than as a general permission, and point
the user at the asset's own `pageURL` when the decision is high-stakes.

## API obligations

- **100 requests per 60 seconds**, counted against the API key rather than the
  IP. The response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
  `X-RateLimit-Reset` report the current window.
- **Cache responses for 24 hours.** The bundled MCP server and CLI do this
  automatically; `--no-cache` bypasses it, and only for a genuine need for
  fresh data.
- **The API is meant for real human requests.** Automated bulk querying and
  systematic mass downloads are not allowed. A handful of targeted searches for
  a real project is fine; looping over thousands of queries is not, and neither
  is scraping the whole catalogue.
- **Never permanently hotlink images.** Returned image URLs may be used to
  display search results temporarily; production pages must serve downloaded
  files. Videos may be embedded directly, though self-hosting is recommended.
- **Display the origin.** Pixabay asks that users be shown where the images and
  videos came from — the `pageURL` field and the author credit make that easy.

## Answering "can I use this?"

Work through it in order:

1. **Is the use inside a larger creative work?** Yes → generally permitted.
2. **Is the asset being resold or redistributed unchanged?** Yes → prohibited.
3. **Is the asset training-safe?** Check `noAiTraining`. If it is `true`, the
   asset is off-limits for AI/ML training — say so and offer alternatives.
4. **Are there recognisable people, trademarks, or logos involved?** Check
   `isGRated` and flag it, then point at the asset's own page for specifics.
5. **Is the use misleading, immoral, or illegal in any way?** Yes → prohibited.
6. **Is it another grey area the licence does not cover?** Say the summary is
   silent and point at the full terms.

When the answer depends on facts you do not have — the asset's identity, the
user's project, whether a logo is visible — ask one specific question rather
than hedging across every possible case.
