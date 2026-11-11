#!/usr/bin/env node
/**
 * Pixabay MCP server - stdio transport, JSON-RPC 2.0, zero dependencies.
 *
 * Claude Code launches this via .mcp.json:
 *   command: node
 *   args:    ["${CLAUDE_PLUGIN_ROOT}/scripts/pixabay-mcp.mjs"]
 *
 * The API key arrives in PIXABAY_API_KEY, injected from the plugin's
 * userConfig option (stored in secure credential storage) or from the
 * user's shell environment.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import {
  PixabayError,
  IMAGE_SIZES,
  VIDEO_SIZES,
  downloadFirstWorking,
  getImage,
  getVideo,
  imageUrlCandidates,
  resolveApiKey,
  resolveVideoUrl,
  searchImages,
  searchVideos,
  summarizeImage,
  summarizeSearchResponse,
  summarizeVideo,
} from './pixabay-core.mjs';

const SERVER_NAME = 'pixabay-media';
const SERVER_VERSION = '1.0.0';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

/* ------------------------------------------------------------------ */
/* Tool definitions                                                    */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: 'search_images',
    description:
      'Search royalty-free stock images on Pixabay. Returns compact results with id, tags, dimensions, '
      + 'page URL, author, popularity stats, and ready-to-use URLs for every rendition '
      + '(preview, web_180..web_960, large, fullHD, original, vector). Use this whenever someone needs a '
      + 'photo, illustration, vector, background, or other still image. Returns at most 500 accessible hits '
      + 'per query, so narrow filters for specific needs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search terms, max 100 characters. Leave empty to browse all images.',
        },
        image_type: {
          type: 'string',
          enum: ['all', 'photo', 'illustration', 'vector'],
          description: "Filter by media type. Default 'all'.",
        },
        orientation: {
          type: 'string',
          enum: ['all', 'horizontal', 'vertical'],
          description: "Filter by aspect. Default 'all'.",
        },
        category: {
          type: 'string',
          enum: [
            'backgrounds', 'fashion', 'nature', 'science', 'education', 'feelings',
            'health', 'people', 'religion', 'places', 'animals', 'industry', 'computer',
            'food', 'sports', 'transportation', 'travel', 'buildings', 'business', 'music',
          ],
          description: 'Narrow to one topic category.',
        },
        colors: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'grayscale', 'transparent', 'red', 'orange', 'yellow', 'green', 'turquoise',
              'blue', 'lilac', 'pink', 'white', 'gray', 'black', 'brown',
            ],
          },
          description: 'Filter by dominant colour(s).',
        },
        min_width: { type: 'integer', description: 'Minimum image width in pixels.' },
        min_height: { type: 'integer', description: 'Minimum image height in pixels.' },
        editors_choice: { type: 'boolean', description: 'Only Editor\'s Choice images.' },
        safesearch: { type: 'boolean', description: 'Restrict to all-ages-safe results.' },
        order: { type: 'string', enum: ['popular', 'latest'], description: "Default 'popular'." },
        page: { type: 'integer', minimum: 1, description: 'Page number. Default 1.' },
        per_page: { type: 'integer', minimum: 3, maximum: 200, description: 'Results per page. Default 20.' },
        lang: { type: 'string', description: 'Search-language code, e.g. "en", "de", "ja". Default "en".' },
      },
      required: [],
    },
  },
  {
    name: 'search_videos',
    description:
      'Search royalty-free stock videos on Pixabay. Returns compact results with id, tags, duration in '
      + 'seconds, page URL, author, popularity stats, and URLs for every rendition '
      + '(large/medium/small/tiny) plus poster thumbnails. Use this for background loops, B-roll, '
      + 'hero clips, and motion footage. Returns at most 500 accessible hits per query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search terms, max 100 characters. Leave empty to browse all videos.',
        },
        video_type: {
          type: 'string',
          enum: ['all', 'film', 'animation'],
          description: "Filter by footage type. Default 'all'.",
        },
        category: {
          type: 'string',
          enum: [
            'backgrounds', 'fashion', 'nature', 'science', 'education', 'feelings',
            'health', 'people', 'religion', 'places', 'animals', 'industry', 'computer',
            'food', 'sports', 'transportation', 'travel', 'buildings', 'business', 'music',
          ],
          description: 'Narrow to one topic category.',
        },
        min_width: { type: 'integer', description: 'Minimum video width in pixels.' },
        min_height: { type: 'integer', description: 'Minimum video height in pixels.' },
        editors_choice: { type: 'boolean', description: 'Only Editor\'s Choice videos.' },
        safesearch: { type: 'boolean', description: 'Restrict to all-ages-safe results.' },
        order: { type: 'string', enum: ['popular', 'latest'], description: "Default 'popular'." },
        page: { type: 'integer', minimum: 1, description: 'Page number. Default 1.' },
        per_page: { type: 'integer', minimum: 3, maximum: 200, description: 'Results per page. Default 20.' },
        lang: { type: 'string', description: 'Search-language code, e.g. "en", "de", "ja". Default "en".' },
      },
      required: [],
    },
  },
  {
    name: 'get_image',
    description:
      'Fetch one Pixabay image by its numeric id with full metadata and every rendition URL. '
      + 'Use after a search when the caller wants a specific known image, or to re-resolve URLs that '
      + 'expire (webformat URLs are only valid for 24 hours).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'The Pixabay image id.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_video',
    description:
      'Fetch one Pixabay video by its numeric id with full metadata, duration, and every rendition URL '
      + 'plus poster thumbnails. Use after a search when the caller wants a specific known video.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'The Pixabay video id.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'download_image',
    description:
      'Download a Pixabay image to the local filesystem at a chosen rendition, and write a matching '
      + '.json sidecar with the author, source page, licence link, and tags. Use this when the image '
      + 'must be persisted rather than hotlinked - Pixabay forbids permanent hotlinking of images. '
      + 'Renditions: preview (150px), web_180, web_340, web_640, web_960, large (1280px), '
      + 'fullHD (1920px, needs full API access), original (needs full API access), vector (needs full API access).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'The Pixabay image id.' },
        size: {
          type: 'string',
          enum: Object.keys(IMAGE_SIZES),
          description: "Rendition to download. Default 'large'.",
        },
        destination: {
          type: 'string',
          description:
            'Absolute path of the file to write, or a directory (filename is derived from the id). '
            + 'Directories are created automatically.',
        },
      },
      required: ['id', 'destination'],
    },
  },
  {
    name: 'download_video',
    description:
      'Download a Pixabay video to the local filesystem at a chosen rendition, and write a matching '
      + '.json sidecar with the author, source page, licence link, duration, and tags. '
      + 'Renditions: large (usually 3840x2160, sometimes unavailable), medium (usually 1920x1080), '
      + 'small (usually 1280x720), tiny (usually 960x540).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'The Pixabay video id.' },
        size: {
          type: 'string',
          enum: Object.keys(VIDEO_SIZES),
          description: "Rendition to download. Default 'medium'.",
        },
        destination: {
          type: 'string',
          description:
            'Absolute path of the file to write, or a directory (filename is derived from the id). '
            + 'Directories are created automatically.',
        },
      },
      required: ['id', 'destination'],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function textContent(text) {
  return { content: [{ type: 'text', text }] };
}

function jsonContent(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function errorContent(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function firstHit(data) {
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return hits.length > 0 ? hits[0] : null;
}

const EXTENSION_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

function extensionFor(contentType, url) {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  if (EXTENSION_BY_TYPE[type]) return EXTENSION_BY_TYPE[type];
  const fromUrl = extname(new URL(url).pathname);
  if (fromUrl) return fromUrl;
  return '';
}


async function writeSidecar(imagePath, payload) {
  const sidecar = `${imagePath}.json`;
  await writeFile(sidecar, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return sidecar;
}

/* ------------------------------------------------------------------ */
/* Tool execution                                                      */
/* ------------------------------------------------------------------ */

async function runTool(name, args = {}) {
  switch (name) {
    case 'search_images': {
      const data = await searchImages(args);
      return jsonContent(summarizeSearchResponse(data, summarizeImage));
    }

    case 'search_videos': {
      const data = await searchVideos(args);
      return jsonContent(summarizeSearchResponse(data, summarizeVideo));
    }

    case 'get_image': {
      const data = await getImage(args.id);
      const hit = firstHit(data);
      if (!hit) throw new PixabayError(`No image found with id ${args.id}.`, { code: 'NOT_FOUND' });
      return jsonContent(summarizeImage(hit));
    }

    case 'get_video': {
      const data = await getVideo(args.id);
      const hit = firstHit(data);
      if (!hit) throw new PixabayError(`No video found with id ${args.id}.`, { code: 'NOT_FOUND' });
      return jsonContent(summarizeVideo(hit));
    }

    case 'download_image': {
      const size = args.size || 'large';
      const data = await getImage(args.id);
      const hit = firstHit(data);
      if (!hit) throw new PixabayError(`No image found with id ${args.id}.`, { code: 'NOT_FOUND' });
      const candidates = imageUrlCandidates(hit, size);
      const saved = await downloadFirstWorking(candidates, args.destination);
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
      return jsonContent({
        saved: saved.path,
        bytes: saved.bytes,
        contentType: saved.contentType,
        sidecar,
        pixabay_id: hit.id,
        rendition: size,
        resolved_url: saved.url,
        author: hit.user,
        source_page: hit.pageURL,
        license: 'https://pixabay.com/service/license-summary/',
      });
    }

    case 'download_video': {
      const size = args.size || 'medium';
      const data = await getVideo(args.id);
      const hit = firstHit(data);
      if (!hit) throw new PixabayError(`No video found with id ${args.id}.`, { code: 'NOT_FOUND' });
      const url = resolveVideoUrl(hit, size);
      const saved = await downloadFirstWorking([url], args.destination);
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
      return jsonContent({
        saved: saved.path,
        bytes: saved.bytes,
        contentType: saved.contentType,
        sidecar,
        pixabay_id: hit.id,
        rendition: size,
        duration_seconds: hit.duration ?? null,
        author: hit.user,
        source_page: hit.pageURL,
        license: 'https://pixabay.com/service/license-summary/',
      });
    }

    default:
      throw new PixabayError(`Unknown tool "${name}".`, { code: 'UNKNOWN_TOOL' });
  }
}

/* ------------------------------------------------------------------ */
/* JSON-RPC plumbing                                                   */
/* ------------------------------------------------------------------ */

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message, data = undefined) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  send({ jsonrpc: '2.0', id, error });
}

async function handle(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    const requested = params?.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : DEFAULT_PROTOCOL_VERSION;
    sendResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return; // notification: no response
  }

  if (method === 'ping') {
    sendResult(id, {});
    return;
  }

  if (method === 'tools/list') {
    sendResult(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments ?? {};
    if (!TOOLS.some((t) => t.name === toolName)) {
      sendResult(id, errorContent(`Unknown tool "${toolName}". Available: ${TOOLS.map((t) => t.name).join(', ')}.`));
      return;
    }
    try {
      sendResult(id, await runTool(toolName, toolArgs));
    } catch (err) {
      const message = err instanceof PixabayError
        ? err.message
        : `Unexpected error: ${err?.message ?? err}`;
      sendResult(id, errorContent(message));
    }
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = '';
let pending = 0;
let stdinClosed = false;

function track(promise) {
  pending += 1;
  promise.finally(() => {
    pending -= 1;
    maybeExit();
  });
}

function maybeExit() {
  // Only exit once stdin is closed AND every in-flight request has settled,
  // otherwise a pending network call gets killed before it can respond.
  if (stdinClosed && pending === 0) process.exit(0);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf('\n');
  while (index !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        sendError(null, -32700, 'Parse error: request was not valid JSON.');
        index = buffer.indexOf('\n');
        continue;
      }
      track(Promise.resolve(handle(parsed)).catch((err) => {
        if (parsed?.id !== undefined) {
          sendError(parsed.id, -32603, err?.message ?? 'Internal error');
        }
      }));
    }
    index = buffer.indexOf('\n');
  }
});
process.stdin.on('end', () => {
  stdinClosed = true;
  maybeExit();
});

// Fail fast with an actionable message if the key is missing at startup.
if (!process.env.PIXABAY_API_KEY) {
  try {
    resolveApiKey();
  } catch (err) {
    process.stderr.write(`[pixabay-media] ${err.message}\n`);
  }
}
