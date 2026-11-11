# Pixabay API reference

Everything below is transcribed from <https://pixabay.com/api/docs/>.

## Endpoints

| Media | Endpoint |
|---|---|
| Images | `GET https://pixabay.com/api/` |
| Videos | `GET https://pixabay.com/api/videos/` |

Response format is JSON, UTF-8 encoded. Object keys and values are case-sensitive.
Key order may change between responses and new keys may be added, so parse
defensively and ignore unknown fields.

## Authentication

Every request requires `key` — the API key from <https://pixabay.com/api/docs/>.

## Shared parameters

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `key` | string | — | **Required.** API key. |
| `q` | string | all media | Search term, **max 100 characters**, URL-encoded. |
| `lang` | string | `en` | Search language. See list below. |
| `id` | string | — | Fetch a single asset by its numeric id. |
| `editors_choice` | boolean | `false` | Only Editor's Choice assets. |
| `safesearch` | boolean | `false` | Restrict to all-ages-safe results. |
| `order` | string | `popular` | `popular` or `latest`. |
| `page` | integer | `1` | Page number. |
| `per_page` | integer | `20` | Results per page, **range 3–200**. |
| `callback` | string | — | JSONP callback function name. |
| `pretty` | boolean | `false` | Pretty-printed JSON. Not for production. |

Supported `lang` values:
`cs da de en es fr id it hu nl no pl pt ro sk fi sv tr vi th bg ru el ja ko zh`

## Image-only parameters

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `image_type` | string | `all` | `all`, `photo`, `illustration`, `vector`. |
| `orientation` | string | `all` | `all`, `horizontal`, `vertical`. |
| `category` | string | — | See categories below. |
| `min_width` | integer | `0` | Minimum width in pixels. |
| `min_height` | integer | `0` | Minimum height in pixels. |
| `colors` | string | — | Comma-separated. See colors below. |

## Video-only parameters

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `video_type` | string | `all` | `all`, `film`, `animation`. |
| `category` | string | — | See categories below. |
| `min_width` | integer | `0` | Minimum width in pixels. |
| `min_height` | integer | `0` | Minimum height in pixels. |

Videos have **no** `orientation`, `colors`, or `image_type` parameter.

## Categories

`backgrounds` `fashion` `nature` `science` `education` `feelings` `health`
`people` `religion` `places` `animals` `industry` `computer` `food` `sports`
`transportation` `travel` `buildings` `business` `music`

## Colors

`grayscale` `transparent` `red` `orange` `yellow` `green` `turquoise` `blue`
`lilac` `pink` `white` `gray` `black` `brown`

## Response envelope

Both endpoints return the same top-level shape:

```json
{
  "total": 4692,
  "totalHits": 500,
  "hits": [ ... ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `total` | integer | Total number of hits. |
| `totalHits` | integer | Hits reachable through the API — **capped at 500** per query. |
| `hits` | array | The result objects. |

## Image hit fields

| Field | Type | Meaning |
|---|---|---|
| `id` | integer | Unique image id. |
| `pageURL` | string | Pixabay source page — links to the original download. |
| `type` | string | `photo`, `illustration`, or `vector`. |
| `tags` | string | Comma-separated tags. |
| `name` | string | The asset's keyword string. |
| `heading` | string | Human-readable title (often empty). |
| `description` | string | Human-readable description (often empty). |
| `previewURL` | string | Low-resolution image, max 150px. **CDN form** — see below. |
| `previewWidth` / `previewHeight` | integer | Preview dimensions. |
| `webformatURL` | string | Medium image, max 640px. **Proxy form** — see below. |
| `webformatWidth` / `webformatHeight` | integer | Web-format dimensions. |
| `largeImageURL` | string | Scaled image, max 1280px. **Proxy form** — see below. |
| `imageWidth` / `imageHeight` | integer | Original dimensions. |
| `imageSize` | integer | Original file size in bytes. |
| `views` / `downloads` / `likes` / `comments` | integer | Popularity counters. |
| `collections` | integer | How many collections the asset is in. May be null. |
| `user_id` | integer | Contributor id. |
| `user` | string | Contributor username. |
| `userURL` | string | Contributor profile — `https://pixabay.com/users/<user_id>/`. |
| `userImageURL` | string | Contributor avatar, 250×250. |
| `noAiTraining` | boolean | Training use is blocked for this asset. |
| `isAiGenerated` | boolean | The asset itself was AI-generated. |
| `isGRated` | boolean | The asset contains G-rated (sensitive) content. |
| `isLowQuality` | boolean | Pixabay flags the asset as low quality. |
| `fullHDURL` | string | **Full API access only.** Max 1920px. |
| `imageURL` | string | **Full API access only.** Original resolution. |
| `vectorURL` | string | **Full API access only.** Original vector resource. |

> The last four fields below `userImageURL` — `noAiTraining`, `isAiGenerated`,
> `isGRated`, `isLowQuality` — are returned by the live API but are **not in
> the official field list**. They are the per-asset answer to "may this be
> used for AI/ML training?" and to content-sensitivity checks.

### Two URL families

`previewURL` is a **CDN** URL whose size is a filename segment:

```
https://cdn.pixabay.com/photo/2017/05/09/03/46/alberta-2297204_150.jpg
```

`webformatURL`, `largeImageURL`, `fullHDURL`, and `imageURL` are **proxy**
URLs whose token is bound to one size:

```
https://pixabay.com/get/<token>_640.jpg
```

Substituting the suffix works on the CDN form and **fails on the proxy form**
(404). Derive other sizes from `previewURL`. Full measurements, including which
size tokens exist, are in `references/cdn-renditions.md`.

## Video hit fields

| Field | Type | Meaning |
|---|---|---|
| `id` | integer | Unique video id. |
| `pageURL` | string | Pixabay source page. |
| `type` | string | `film` or `animation`. |
| `tags` | string | Comma-separated tags. |
| `name` | string | The asset's keyword string. |
| `heading` | string | Human-readable title (often empty). |
| `duration` | integer | Duration in seconds. |
| `videos` | object | Renditions keyed by `large`, `medium`, `small`, `tiny`. |
| `views` / `downloads` / `likes` / `comments` | integer | Popularity counters. |
| `collections` | integer | Collections the asset is in. May be null. |
| `user_id` / `user` / `userURL` / `userImageURL` | — | Contributor info. |
| `noAiTraining` | boolean | Training use is blocked for this asset. |
| `isAiGenerated` | boolean | The asset itself was AI-generated. |
| `isGRated` | boolean | The asset contains G-rated (sensitive) content. |
| `isLowQuality` | boolean | Pixabay flags the asset as low quality. |

Each rendition object contains `url`, `width`, `height`, `size` (bytes), and
`thumbnail` (poster image URL). Adding `download=1` as a GET parameter to a
video `url` makes the browser download it instead of playing it inline.

## Rate limits and caching

- **100 requests per 60 seconds**, associated with the API key rather than the
  caller's IP.
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` (seconds until the window resets).
- Exceeding the limit returns **HTTP 429** with the body
  `API rate limit exceeded`.
- **Requests must be cached for 24 hours** to keep the service responsive.
  The bundled MCP server and CLI cache every response for 24 hours
  automatically; pass `--no-cache` to bypass when you specifically need fresh data.
- The API is intended for real human requests. Automated bulk querying and
  systematic mass downloads are not allowed.

## Hotlinking and storage

- Returned image URLs may be used to **temporarily** display search results.
- **Permanent hotlinking of images is not allowed.** Download images to your own
  server (or disk) before use.
- Videos may be embedded directly in applications, though storing them on your
  own server is recommended.
