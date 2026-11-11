---
name: pixabay-images
description: Download and prepare royalty-free images from Pixabay at the right resolution, with proper attribution and licensing metadata. Use this skill when someone already has an image picked and wants the file on disk - saving it to a folder, choosing between preview/webformat/large/full-HD/original/vector renditions, embedding an image in a website, building a hero banner, or refreshing an expired image URL. Also use it when they mention a specific Pixabay image id to fetch.
---

# Download and use Pixabay images

## Pick the rendition before downloading

Every image carries several renditions. Choosing by the destination keeps the
file small and avoids the 24-hour expiry trap.

| Rendition | Max size | Use for | Access |
|---|---|---|---|
| `preview` | 150px | Result thumbnails, hover previews, admin pickers | Any key |
| `web_180` | 180px tall | Avatars, tiny icons, list rows | Any key |
| `web_340` | 340px tall | Cards, small gallery tiles | Any key |
| `web_640` | 640px | Social posts, inline article images | Any key |
| `web_960` | 960×720 | Medium blog headers, slide backgrounds | Any key |
| `large` | 1280px | **Default for web use** — hero banners, blog headers | Any key |
| `fullHD` | 1920px | Full-screen backgrounds, retina displays | Full API access |
| `original` | Native pixels | Print, source files, further editing | Full API access |
| `vector` | SVG/vector | Logos, icons, anything that must scale | Full API access |

### Two of these sizes are approximations, and that is fine

Pixabay's CDN does **not** serve distinct 180px or 340px files, even though
the API documentation says you can substitute those suffixes. Verified against
the live CDN across 25+ images: `_180` and `_340` return 403, exactly like a
nonsense filename. The live 960px file is `_960_720`, not `_960`.

So the download resolves those sizes to the nearest one that genuinely exists:

| Requested | You actually get |
|---|---|
| `web_180` | 150px (`preview`) |
| `web_340` | 640px (`web_640`) |

The download response reports the `resolved_url` that was used, so you can
check what landed. If an exact size matters — a design specifying 340px
exactly — resize the file locally rather than expecting Pixabay to serve it.

**Start at `large`.** It is 1280px, works with every key, and covers most web
placements. Go bigger only when the destination genuinely demands it.

### Full-access sizes

`fullHD`, `original`, and `vector` need a Pixabay account approved for full
API access. The API omits those fields entirely on a standard key, so the
download fails with a clear `needs a Pixabay account approved for full API
access` message. Say so plainly and fall back to `large` rather than silently
substituting a smaller file.
## Downloading

Use the MCP tool:

```
download_image
  id: 195893
  size: large
  destination: /abs/path/to/site/public/images/hero.jpg
```

`destination` accepts either a full file path or a directory — if it is a
directory, the filename is derived from the source URL and the directory is
created if missing.

Without the MCP server, use the CLI:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pixabay.mjs" download-image 195893 --dest ./assets --size large
```

### Always keep the sidecar

Every download writes a sibling `<file>.json` recording the Pixabay id, author,
author profile URL, source page, licence link, tags, and the exact source URL.
This is what makes attribution possible later, when the filename no longer hints
at where the asset came from. Do not delete it — hand it to whoever maintains
the project, and mention it exists so it survives.

### Expiring URLs

The API's `webformatURL`, `largeImageURL`, `fullHDURL`, and `imageURL` come
back as `https://pixabay.com/get/<token>_640.jpg` proxy links, and the
documentation states they are **valid for 24 hours only**. Any of them saved
into a file, a config, or a database will eventually fail with
`This URL is invalid or has expired`.

`previewURL` is different — it is a direct CDN link
(`cdn.pixabay.com/.../name_<id>_150.jpg`) that does not expire, and the other
sizes can be derived from it by swapping the filename token.

- If a stored image URL has gone stale, re-fetch it with `get_image` using the
  id and re-download the file. The id is stable; the URL is not.
- For anything that ships to a server, download the bytes rather than storing
  the URL.

## Hotlinking: the rule people break

Pixabay's terms forbid **permanent hotlinking of images**. Two acceptable
patterns:

1. **Download to your own server or disk** and serve the local file. This is
   what `download_image` does, and it is the right answer for almost every case.
2. **Temporarily** use the Pixabay URL to display search results, e.g. a
   results grid in a tool. Fine for a preview, wrong for a published page.

Never paste a `webformatURL` into a production `<img src>` that is meant to
stay up. It expires in 24 hours and it violates the licence.

For videos the rule differs — see the `pixabay-videos` skill.

## Using the image well

- **Attribution is optional** under the Pixabay Content License, but crediting
  the author is appreciated and costs the user nothing. The `user` field and
  the author profile URL are in every search result and sidecar.
- **Do not use images of recognisable people** in a misleading or immoral
  context — that is prohibited regardless of the licence.
- **Check for trademarks and logos** in the image before using it commercially.
- **Do not redistribute the image standalone** — as a stock photo site entry, a
  template pack, or a "free images" collection. Using it inside a design or
  product is fine; reselling the raw file is not.

Full licence details are in the `pixabay-licensing` skill.
