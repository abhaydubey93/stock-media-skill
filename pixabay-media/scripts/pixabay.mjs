#!/usr/bin/env node
/**
 * Pixabay CLI - the same core the MCP server uses, for scripting and for
 * sessions where the MCP server is not loaded.
 *
 * Usage:
 *   node pixabay.mjs search-images "query" [--orientation vertical] [--per-page 30] ...
 *   node pixabay.mjs search-videos "query" [--video-type film] ...
 *   node pixabay.mjs get-image <id>
 *   node pixabay.mjs get-video <id>
 *   node pixabay.mjs download-image <id> --dest ./assets --size large
 *   node pixabay.mjs download-video <id> --dest ./assets --size medium
 *
 * API key: PIXABAY_API_KEY env var, or ~/.pixabay/config.json {"api_key":"..."}
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import {
  PixabayError,
  downloadFirstWorking,
  getImage,
  getVideo,
  imageUrlCandidates,
  resolveVideoUrl,
  searchImages,
  searchVideos,
  summarizeImage,
  summarizeSearchResponse,
  summarizeVideo,
} from './pixabay-core.mjs';

/* ------------------------------------------------------------------ */
/* Argument parsing                                                    */
/* ------------------------------------------------------------------ */

const BOOLEAN_FLAGS = new Set([
  'editors_choice', 'editors-choice', 'safesearch', 'no-cache', 'no_cache',
  'pretty', 'help', 'h',
]);
const LIST_FLAGS = new Set(['colors']);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      const key = (eq === -1 ? body : body.slice(0, eq)).replace(/-/g, '_');
      let value;
      if (eq !== -1) {
        value = body.slice(eq + 1);
      } else if (BOOLEAN_FLAGS.has(key)) {
        value = true;
      } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
        value = argv[i + 1];
        i += 1;
      } else {
        value = true;
      }
      if (LIST_FLAGS.has(key)) {
        flags[key] = String(value).split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        flags[key] = value;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function numberFlags(flags, keys) {
  const out = {};
  for (const key of keys) {
    if (flags[key] !== undefined && flags[key] !== true) out[key] = Number(flags[key]);
  }
  return out;
}

function boolFlags(flags, keys) {
  const out = {};
  for (const key of keys) {
    if (flags[key] === undefined) continue;
    out[key] = flags[key] === true || String(flags[key]).toLowerCase() === 'true';
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Output helpers                                                      */
/* ------------------------------------------------------------------ */

function printSearchSummary(response) {
  const lines = [];
  lines.push(`total: ${response.total}   accessible hits: ${response.totalHits}${response.hitsCapReached ? ' (500 cap reached - narrow the query to reach more)' : ''}`);
  lines.push(`page: ${response.page ?? '-'}   cached: ${response.cached ? 'yes' : 'no'}`);
  lines.push('');
  for (const r of response.results) {
    const title = (r.tags || '').split(',')[0] || 'untitled';
    lines.push(`[${r.id}] ${title}  (${r.type})`);
    if (r.imageWidth) lines.push(`    ${r.imageWidth}x${r.imageHeight}`);
    if (r.duration !== null && r.duration !== undefined) lines.push(`    ${r.duration}s`);
    lines.push(`    author: ${r.user}   likes:${r.likes ?? 0} downloads:${r.downloads ?? 0}`);
    lines.push(`    page: ${r.pageURL}`);
    if (r.sizes) {
      const usable = Object.entries(r.sizes).filter(([, v]) => v).map(([k]) => k);
      lines.push(`    sizes: ${usable.join(', ')}`);
      lines.push(`    url: ${r.sizes.large || r.sizes.web_640 || r.previewURL}`);
    } else if (r.renditions) {
      const usable = Object.entries(r.renditions).filter(([, v]) => v).map(([k]) => k);
      lines.push(`    renditions: ${usable.join(', ')}`);
      lines.push(`    url: ${r.renditions.medium?.url || r.renditions.small?.url || r.renditions.tiny?.url}`);
    }
    lines.push('');
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function writeSidecar(filePath, payload) {
  const sidecar = `${filePath}.json`;
  await writeFile(sidecar, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return sidecar;
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

const USAGE = `pixabay.mjs <command> [args]

Commands:
  search-images <query>     Search stock images
  search-videos <query>     Search stock videos
  get-image <id>            Fetch one image by id
  get-video <id>            Fetch one video by id
  download-image <id>       Download an image (--dest required)
  download-video <id>       Download a video (--dest required)

Common flags:
  --image-type photo|illustration|vector     (images)
  --orientation horizontal|vertical          (images)
  --video-type film|animation                (videos)
  --category <name>                          (both)
  --colors red,blue                          (images)
  --min-width N --min-height N               (both)
  --editors-choice --safesearch              (both)
  --order popular|latest                     (both)
  --page N --per-page N                      (both; per-page 3-200)
  --lang en                                  (both)
  --size <rendition>                         (download)
  --dest <path>                              (download)
  --json                                     (raw JSON output)
  --no-cache                                 (bypass the 24h cache)
`;

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || flags.help || flags.h) {
    process.stdout.write(USAGE);
    return;
  }

  const opts = { cache: flags.no_cache !== true };
  const jsonOut = flags.json === true;

  switch (command) {
    case 'search-images': {
      const data = await searchImages({
        query: positional.slice(1).join(' '),
        ...numberFlags(flags, ['min_width', 'min_height', 'page', 'per_page']),
        ...boolFlags(flags, ['editors_choice', 'safesearch']),
        image_type: flags.image_type,
        orientation: flags.orientation,
        category: flags.category,
        colors: flags.colors,
        order: flags.order,
        lang: flags.lang,
      }, opts);
      const summary = summarizeSearchResponse(data, summarizeImage);
      if (jsonOut) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      else printSearchSummary(summary);
      return;
    }

    case 'search-videos': {
      const data = await searchVideos({
        query: positional.slice(1).join(' '),
        ...numberFlags(flags, ['min_width', 'min_height', 'page', 'per_page']),
        ...boolFlags(flags, ['editors_choice', 'safesearch']),
        video_type: flags.video_type,
        category: flags.category,
        order: flags.order,
        lang: flags.lang,
      }, opts);
      const summary = summarizeSearchResponse(data, summarizeVideo);
      if (jsonOut) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      else printSearchSummary(summary);
      return;
    }

    case 'get-image': {
      const data = await getImage(positional[1], opts);
      const hit = data?.hits?.[0];
      if (!hit) throw new PixabayError(`No image found with id ${positional[1]}.`, { code: 'NOT_FOUND' });
      const summary = summarizeImage(hit);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return;
    }

    case 'get-video': {
      const data = await getVideo(positional[1], opts);
      const hit = data?.hits?.[0];
      if (!hit) throw new PixabayError(`No video found with id ${positional[1]}.`, { code: 'NOT_FOUND' });
      const summary = summarizeVideo(hit);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return;
    }

    case 'download-image': {
      if (!flags.dest) throw new PixabayError('--dest is required for downloads.', { code: 'MISSING_ARG' });
      const size = flags.size || 'large';
      const data = await getImage(positional[1], opts);
      const hit = data?.hits?.[0];
      if (!hit) throw new PixabayError(`No image found with id ${positional[1]}.`, { code: 'NOT_FOUND' });
      const candidates = imageUrlCandidates(hit, size);
      const saved = await downloadFirstWorking(candidates, flags.dest);
      const sidecar = await writeSidecar(saved.path, {
        pixabay_id: hit.id,
        kind: 'image',
        type: hit.type,
        rendition: size,
        width: hit.imageWidth ?? null,
        height: hit.imageHeight ?? null,
        bytes: saved.bytes,
        tags: hit.tags ?? '',
        author: hit.user ?? null,
        author_id: hit.user_id ?? null,
        author_profile: hit.userURL ?? (hit.user ? `https://pixabay.com/users/${hit.user_id}/` : null),
        source_page: hit.pageURL ?? null,
        license: 'https://pixabay.com/service/license-summary/',
        license_name: 'Pixabay Content License',
        downloaded_at: new Date().toISOString(),
        source_url: saved.url,
      });
      process.stdout.write(`${JSON.stringify({
        saved: saved.path, bytes: saved.bytes, sidecar, pixabay_id: hit.id,
        rendition: size, resolved_url: saved.url, author: hit.user, source_page: hit.pageURL,
        license: 'https://pixabay.com/service/license-summary/',
      }, null, 2)}\n`);
      return;
    }

    case 'download-video': {
      if (!flags.dest) throw new PixabayError('--dest is required for downloads.', { code: 'MISSING_ARG' });
      const size = flags.size || 'medium';
      const data = await getVideo(positional[1], opts);
      const hit = data?.hits?.[0];
      if (!hit) throw new PixabayError(`No video found with id ${positional[1]}.`, { code: 'NOT_FOUND' });
      const url = resolveVideoUrl(hit, size);
      const saved = await downloadFirstWorking([url], flags.dest);
      const rendition = hit.videos?.[size] ?? {};
      const sidecar = await writeSidecar(saved.path, {
        pixabay_id: hit.id,
        kind: 'video',
        type: hit.type,
        rendition: size,
        width: rendition.width ?? null,
        height: rendition.height ?? null,
        duration_seconds: hit.duration ?? null,
        bytes: saved.bytes,
        tags: hit.tags ?? '',
        author: hit.user ?? null,
        author_id: hit.user_id ?? null,
        author_profile: hit.userURL ?? (hit.user ? `https://pixabay.com/users/${hit.user_id}/` : null),
        source_page: hit.pageURL ?? null,
        poster_thumbnail: rendition.thumbnail ?? null,
        license: 'https://pixabay.com/service/license-summary/',
        license_name: 'Pixabay Content License',
        downloaded_at: new Date().toISOString(),
        source_url: url,
      });
      process.stdout.write(`${JSON.stringify({
        saved: saved.path, bytes: saved.bytes, sidecar, pixabay_id: hit.id,
        rendition: size, duration_seconds: hit.duration ?? null, author: hit.user,
        source_page: hit.pageURL, license: 'https://pixabay.com/service/license-summary/',
      }, null, 2)}\n`);
      return;
    }

    default:
      throw new PixabayError(`Unknown command "${command}".\n\n${USAGE}`, { code: 'UNKNOWN_COMMAND' });
  }
}

main().catch((err) => {
  process.stderr.write(`[pixabay] ${err instanceof PixabayError ? err.message : (err?.stack ?? err)}\n`);
  process.exit(1);
});
