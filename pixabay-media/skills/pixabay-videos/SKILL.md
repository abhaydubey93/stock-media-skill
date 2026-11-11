---
name: pixabay-videos
description: Download, embed, and prepare royalty-free stock footage and background videos from Pixabay. Use this skill when someone already has a video picked and wants the file on disk - choosing a resolution (large/medium/small/tiny), pulling a poster thumbnail, checking clip duration, trimming with ffmpeg, looping a clip as a CSS/video background, or deciding whether to embed a Pixabay video URL versus self-hosting it. Also use it when they mention a specific Pixabay video id to fetch.
---

# Download and use Pixabay videos

## Pick the rendition

Videos ship in four renditions. Note that **`large` is sometimes missing** —
the API returns an empty URL and size 0 for videos that have no 4K version, so
check before you promise it.

| Rendition | Usual size | Use for | Notes |
|---|---|---|---|
| `large` | 3840×2160 | 4K hero backgrounds, large displays | **Often unavailable.** Fall back to `medium`. |
| `medium` | 1920×1080 | **Default.** Full-screen backgrounds, hero video | Always available. Older videos are 1280×720. |
| `small` | 1280×720 | Embedded players, course content | Always available. Older videos are 960×540. |
| `tiny` | 960×540 | Thumbnails, preview strips, previews | Always available. Older videos are 640×360. |

**Start at `medium`.** It is available on every video and covers full-screen web
use. Drop to `small` for embedded players where bandwidth matters.

Each rendition carries its own `thumbnail` poster image URL — use it as the
`poster` attribute of a `<video>` element so the player shows a still frame
before playback starts instead of a black box.

## Downloading

Use the MCP tool:

```
download_video
  id: 125
  size: medium
  destination: /abs/path/to/site/public/video/hero.mp4
```

Or the CLI:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pixabay.mjs" download-video 125 --dest ./assets --size medium
```

Downloads write a sibling `<file>.json` sidecar with the duration, dimensions,
author, source page, licence link, poster thumbnail URL, and source URL. Keep
it — it is the only record of where the footage came from once the filename
stops saying anything useful.

## Embedding vs. hosting

Pixabay permits **embedding videos directly** in applications — unlike images,
permanent hotlinking of video is allowed. Videos may be embedded directly in
your applications, though storing them on your own server is recommended.

So both of these are acceptable:

```html
<!-- Embedded from Pixabay - allowed -->
<video controls poster="https://cdn.pixabay.com/video/.../poster.jpg">
  <source src="https://cdn.pixabay.com/video/.../file_1920_1080.mp4" type="video/mp4">
</video>
```

```html
<!-- Downloaded and self-hosted - recommended -->
<video controls poster="/video/hero-poster.jpg">
  <source src="/video/hero.mp4" type="video/mp4">
</video>
```

Self-hosting wins when you need the video to survive a CDN change, when you
need offline playback, when you must apply your own transforms, or when the
embedding target blocks third-party media. Downloading also lets you use the
`download=1` parameter, which forces a file download instead of inline playback.

## Working with the clip

- **`duration` is in seconds** and comes back on every hit. Check it against
  what the user needs before downloading — a 40-second clip for a 5-second
  hero is wasted bytes.
- **Loop a short clip** for background video with `loop muted autoplay playsinline`.
  Muted autoplay is a browser requirement, not a Pixabay one.
- **Trim with ffmpeg** when only part of the clip is needed — cutting after
  download keeps the source untouched:
  ```bash
  ffmpeg -i hero.mp4 -t 8 -c:v libx264 -preset slow -crf 23 -c:a aac hero-8s.mp4
  ```
  `-an` drops the audio track, which is usually what you want for background
  loops.
- **Check `type`** — `film` is live action, `animation` is motion graphics.
  Mixing them in one page usually looks wrong.

## Licensing constraints

- Free for commercial and non-commercial use, and you may modify it.
- **Do not redistribute the video standalone** — not as a stock-footage library,
  not as a template pack, not resold raw. Using it inside a film, site, or
  presentation is fine.
- **Do not use footage of recognisable people** immorally, illegally, or
  misleadingly.
- **Check for trademarks and logos** before commercial use.
- Attribution is optional but appreciated; the author is in the sidecar.

Full licence details are in the `pixabay-licensing` skill.
