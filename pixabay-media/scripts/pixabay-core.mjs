/**
 * Pixabay API core client. Zero dependencies - uses Node's global fetch.
 *
 * Endpoints (from https://pixabay.com/api/docs/):
 *   Images: GET https://pixabay.com/api/
 *   Videos: GET https://pixabay.com/api/videos/
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const API_ROOT = process.env.PIXABAY_API_BASE || 'https://pixabay.com/api';
export const IMAGE_ENDPOINT = `${API_ROOT}/`;
export const VIDEO_ENDPOINT = `${API_ROOT}/videos/`;

/** 100 requests per 60 seconds per API key (documented default). */
export const RATE_LIMIT = { requests: 100, windowSeconds: 60 };

export const CATEGORIES = [
  'backgrounds', 'fashion', 'nature', 'science', 'education', 'feelings',
  'health', 'people', 'religion', 'places', 'animals', 'industry', 'computer',
  'food', 'sports', 'transportation', 'travel', 'buildings', 'business', 'music',
];

export const COLORS = [
  'grayscale', 'transparent', 'red', 'orange', 'yellow', 'green', 'turquoise',
  'blue', 'lilac', 'pink', 'white', 'gray', 'black', 'brown',
];

export const IMAGE_TYPES = ['all', 'photo', 'illustration', 'vector'];
export const ORIENTATIONS = ['all', 'horizontal', 'vertical'];
export const VIDEO_TYPES = ['all', 'film', 'animation'];
export const ORDERS = ['popular', 'latest'];

export const LANGUAGES = [
  'cs', 'da', 'de', 'en', 'es', 'fr', 'id', 'it', 'hu', 'nl', 'no', 'pl', 'pt',
  'ro', 'sk', 'fi', 'sv', 'tr', 'vi', 'th', 'bg', 'ru', 'el', 'ja', 'ko', 'zh',
];

/**
 * Image rendition ladder.
 *
 * The API returns two URL families and they behave differently:
 *
 *   CDN form   https://cdn.pixabay.com/photo/2017/05/09/03/46/alberta-2297204_150.jpg
 *              The size is a filename segment, so other sizes CAN be derived.
 *
 *   Proxy form https://pixabay.com/get/<token>_640.jpg
 *              The token is bound to one size, so a substituted URL 404s.
 *              This is what webformatURL / largeImageURL / fullHDURL contain.
 *
 * `cdnToken` is the CDN filename token for that size. `fallback` is the API
 * field to use when the CDN form is unavailable or the token does not exist.
 *
 * Measured against the live CDN (2026-11-11): `_150`, `_640`, `_960_720` and
 * `_1280` exist; `_180`, `_340`, `_960` and `_1920` do NOT (403, identical to
 * a nonsense filename). See references/cdn-renditions.md.
 */
export const IMAGE_SIZES = {
  preview: {
    cdnToken: '_150',
    fallback: 'previewURL',
    cdnFirst: false,
    max: '150px',
    needsFullAccess: false,
  },
  web_180: {
    cdnToken: '_180',
    fallback: 'previewURL',
    cdnFirst: false,
    max: '180px tall',
    needsFullAccess: false,
  },
  web_340: {
    cdnToken: '_340',
    fallback: 'webformatURL',
    cdnFirst: false,
    max: '340px tall',
    needsFullAccess: false,
  },
  web_640: {
    cdnToken: '_640',
    fallback: 'webformatURL',
    cdnFirst: true,
    max: '640px',
    needsFullAccess: false,
  },
  web_960: {
    cdnToken: '_960_720',
    fallback: 'largeImageURL',
    cdnFirst: true,
    max: '960x720',
    needsFullAccess: false,
  },
  large: {
    cdnToken: '_1280',
    fallback: 'largeImageURL',
    cdnFirst: true,
    max: '1280px',
    needsFullAccess: false,
  },
  fullHD: {
    cdnToken: null,
    fallback: 'fullHDURL',
    cdnFirst: false,
    max: '1920px',
    needsFullAccess: true,
  },
  original: {
    cdnToken: null,
    fallback: 'imageURL',
    cdnFirst: false,
    max: 'original',
    needsFullAccess: true,
  },
  vector: {
    cdnToken: null,
    fallback: 'vectorURL',
    cdnFirst: false,
    max: 'vector',
    needsFullAccess: true,
  },
};

/** Video rendition ladder. `large` may be absent (empty url, size 0). */
export const VIDEO_SIZES = {
  large: { max: 'usually 3840x2160' },
  medium: { max: 'usually 1920x1080' },
  small: { max: 'usually 1280x720' },
  tiny: { max: 'usually 960x540' },
};

export class PixabayError extends Error {
  constructor(message, { status = null, code = null, body = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'PixabayError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

/* ------------------------------------------------------------------ */
/* API key resolution                                                  */
/* ------------------------------------------------------------------ */

/**
 * Resolve the API key, in priority order:
 *   1. PIXABAY_API_KEY environment variable
 *   2. ~/.pixabay/config.json  ->  { "api_key": "..." }
 *
 * The MCP server receives the key through PIXABAY_API_KEY, injected from the
 * plugin's `userConfig.pixabay_api_key` (stored in secure credential storage).
 */
export function resolveApiKey() {
  const fromEnv = process.env.PIXABAY_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const configPath = join(homedir(), '.pixabay', 'config.json');
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
      const key = typeof parsed.api_key === 'string' ? parsed.api_key.trim() : '';
      if (key) return key;
    } catch {
      // fall through to the actionable error below
    }
  }

  throw new PixabayError(
    'No Pixabay API key found.\n' +
    'Set one of:\n' +
    '  - the PIXABAY_API_KEY environment variable, or\n' +
    '  - the plugin option "Pixabay API key" (run /config and fill in the key), or\n' +
    '  - ~/.pixabay/config.json containing { "api_key": "<your key>" }\n' +
    'Get a free key at https://pixabay.com/api/docs/',
    { code: 'NO_API_KEY' },
  );
}

/* ------------------------------------------------------------------ */
/* 24-hour response cache (Pixabay requires requests be cached 24h)     */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA
    || join(homedir(), '.claude', 'plugins', 'data', 'pixabay-media');
  return join(base, 'cache');
}

function cacheKey(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 32);
}

async function readCache(url) {
  const file = join(cacheDir(), `${cacheKey(url)}.json`);
  if (!existsSync(file)) return null;
  try {
    const info = await stat(file);
    if (Date.now() - info.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function writeCache(url, payload) {
  try {
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(
      join(cacheDir(), `${cacheKey(url)}.json`),
      JSON.stringify(payload),
      'utf8',
    );
  } catch {
    // Cache is an optimisation; never fail a request because of it.
  }
}

/* ------------------------------------------------------------------ */
/* Parameter validation                                                */
/* ------------------------------------------------------------------ */

function enumCheck(name, value, allowed) {
  if (value === undefined || value === null || value === '') return undefined;
  const lower = String(value).toLowerCase();
  if (!allowed.includes(lower)) {
    throw new PixabayError(
      `Invalid ${name} "${value}". Allowed values: ${allowed.join(', ')}.`,
      { code: 'INVALID_PARAM' },
    );
  }
  return lower;
}

function boolParam(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  throw new PixabayError(`Invalid boolean "${value}". Use true or false.`, { code: 'INVALID_PARAM' });
}

function intParam(name, value, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new PixabayError(`Invalid ${name} "${value}". Expected an integer.`, { code: 'INVALID_PARAM' });
  }
  if (min !== null && n < min) {
    throw new PixabayError(`${name} must be >= ${min} (got ${n}).`, { code: 'INVALID_PARAM' });
  }
  if (max !== null && n > max) {
    throw new PixabayError(`${name} must be <= ${max} (got ${n}).`, { code: 'INVALID_PARAM' });
  }
  return n;
}

/** Build the query object for an image search, validating every parameter. */
export function buildImageParams(input = {}) {
  const params = {};
  const q = input.query ?? input.q;
  if (q !== undefined && q !== null && q !== '') {
    const trimmed = String(q).trim();
    if (trimmed.length > 100) {
      throw new PixabayError(
        `Search query is ${trimmed.length} characters; Pixabay accepts a maximum of 100. Shorten it.`,
        { code: 'INVALID_PARAM' },
      );
    }
    params.q = trimmed;
  }
  params.lang = enumCheck('lang', input.lang, LANGUAGES) ?? 'en';
  params.image_type = enumCheck('image_type', input.image_type, IMAGE_TYPES) ?? 'all';
  params.orientation = enumCheck('orientation', input.orientation, ORIENTATIONS) ?? 'all';
  params.category = enumCheck('category', input.category, CATEGORIES);
  params.min_width = intParam('min_width', input.min_width, { min: 0 });
  params.min_height = intParam('min_height', input.min_height, { min: 0 });
  if (input.colors !== undefined && input.colors !== null && input.colors !== '') {
    const list = Array.isArray(input.colors)
      ? input.colors
      : String(input.colors).split(',').map((s) => s.trim()).filter(Boolean);
    for (const c of list) {
      if (!COLORS.includes(String(c).toLowerCase())) {
        throw new PixabayError(
          `Invalid color "${c}". Allowed values: ${COLORS.join(', ')}.`,
          { code: 'INVALID_PARAM' },
        );
      }
    }
    params.colors = list.map((c) => String(c).toLowerCase()).join(',');
  }
  params.editors_choice = boolParam(input.editors_choice) ?? false;
  params.safesearch = boolParam(input.safesearch) ?? false;
  params.order = enumCheck('order', input.order, ORDERS) ?? 'popular';
  params.page = intParam('page', input.page, { min: 1 }) ?? 1;
  params.per_page = intParam('per_page', input.per_page, { min: 3, max: 200 }) ?? 20;
  return params;
}

/** Build the query object for a video search, validating every parameter. */
export function buildVideoParams(input = {}) {
  const params = {};
  const q = input.query ?? input.q;
  if (q !== undefined && q !== null && q !== '') {
    const trimmed = String(q).trim();
    if (trimmed.length > 100) {
      throw new PixabayError(
        `Search query is ${trimmed.length} characters; Pixabay accepts a maximum of 100. Shorten it.`,
        { code: 'INVALID_PARAM' },
      );
    }
    params.q = trimmed;
  }
  params.lang = enumCheck('lang', input.lang, LANGUAGES) ?? 'en';
  params.video_type = enumCheck('video_type', input.video_type, VIDEO_TYPES) ?? 'all';
  params.category = enumCheck('category', input.category, CATEGORIES);
  params.min_width = intParam('min_width', input.min_width, { min: 0 });
  params.min_height = intParam('min_height', input.min_height, { min: 0 });
  params.editors_choice = boolParam(input.editors_choice) ?? false;
  params.safesearch = boolParam(input.safesearch) ?? false;
  params.order = enumCheck('order', input.order, ORDERS) ?? 'popular';
  params.page = intParam('page', input.page, { min: 1 }) ?? 1;
  params.per_page = intParam('input.per_page', input.per_page, { min: 3, max: 200 }) ?? 20;
  return params;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function buildUrl(endpoint, params) {
  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Parse Pixabay's plain-text error bodies, e.g. "[ERROR 400] Invalid or missing API key". */
function parseErrorBody(text) {
  const m = /^\[ERROR\s+(\d+)\]\s*(.*)$/s.exec(text.trim());
  if (m) return { code: Number(m[1]), message: m[2].trim() };
  return { code: null, message: text.trim() };
}

async function apiGet(endpoint, params, { apiKey, cache = true, timeoutMs = 30000 } = {}) {
  const key = apiKey ?? resolveApiKey();
  const query = { ...params, key };
  const url = buildUrl(endpoint, query);

  if (cache) {
    const hit = await readCache(url);
    if (hit) return { ...hit.data, _cached: true, _cachedAt: hit.cachedAt };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'claude-pixabay-media-plugin/1.0', Accept: 'application/json' },
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new PixabayError(`Pixabay request timed out after ${timeoutMs}ms.`, { code: 'TIMEOUT' });
    }
    throw new PixabayError(`Could not reach Pixabay: ${err?.message ?? err}`, { code: 'NETWORK' });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  if (!response.ok) {
    const { code, message } = parseErrorBody(text);
    if (response.status === 429) {
      const reset = response.headers.get('X-RateLimit-Reset');
      throw new PixabayError(
        `Pixabay rate limit exceeded (HTTP 429). ${message || ''}\n`
        + `Limit is ${RATE_LIMIT.requests} requests per ${RATE_LIMIT.windowSeconds}s per API key.`
        + (reset ? ` Retry in about ${reset}s.` : ' Wait a minute and retry.'),
        { status: 429, code: 'RATE_LIMIT', body: message, retryAfter: reset ? Number(reset) : 60 },
      );
    }
    if (response.status === 400 && /api key/i.test(message)) {
      throw new PixabayError(
        `Pixabay rejected the API key: ${message}\nCheck the key in /config or PIXABAY_API_KEY.`,
        { status: 400, code: 'BAD_API_KEY', body: message },
      );
    }
    throw new PixabayError(
      `Pixabay API error (HTTP ${response.status}): ${message || text.slice(0, 300)}`,
      { status: response.status, code: code ?? 'HTTP_ERROR', body: message || text },
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PixabayError(
      `Pixabay returned a non-JSON response: ${text.slice(0, 200)}`,
      { status: response.status, code: 'BAD_RESPONSE', body: text },
    );
  }

  if (cache) {
    await writeCache(url, { data, cachedAt: new Date().toISOString() });
  }

  return {
    ...data,
    _cached: false,
    _rateLimit: {
      limit: response.headers.get('X-RateLimit-Limit'),
      remaining: response.headers.get('X-RateLimit-Remaining'),
      reset: response.headers.get('X-RateLimit-Reset'),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function searchImages(input = {}, opts = {}) {
  const params = buildImageParams(input);
  return apiGet(IMAGE_ENDPOINT, params, opts);
}

export async function searchVideos(input = {}, opts = {}) {
  const params = buildVideoParams(input);
  return apiGet(VIDEO_ENDPOINT, params, opts);
}

/** Fetch a single image by id. */
export async function getImage(id, opts = {}) {
  const numeric = intParam('id', id, { min: 1 });
  return apiGet(IMAGE_ENDPOINT, { id: numeric }, opts);
}

/** Fetch a single video by id. */
export async function getVideo(id, opts = {}) {
  const numeric = intParam('id', id, { min: 1 });
  return apiGet(VIDEO_ENDPOINT, { id: numeric }, opts);
}

/**
 * Derive a size variant from a CDN-form URL.
 *
 *   https://cdn.pixabay.com/photo/.../alberta-2297204_150.jpg
 *   -> https://cdn.pixabay.com/photo/.../alberta-2297204_960_720.jpg
 *
 * Returns null for proxy-form URLs (pixabay.com/get/...) because their token
 * is bound to a single size.
 */
export function cdnSizeVariant(url, cdnToken) {
  if (!url || !cdnToken) return null;
  if (!/cdn\.pixabay\.com\//i.test(url)) return null;
  const m = /([_-])(?:150|180|340|640|960_720|1280|1920)(?=\.|$)/.exec(url);
  if (!m) return null;
  return `${url.slice(0, m.index)}${m[1]}${cdnToken.slice(1)}${url.slice(m.index + m[0].length)}`;
}

/**
 * Ordered candidate URLs for a named image size, best-first.
 *
 * Candidates are verified at download time. This keeps the client correct
 * against both URL families and against the documented-but-unimplemented
 * `_180` / `_340` sizes — see references/cdn-renditions.md.
 */
export function imageUrlCandidates(hit, sizeName = 'large') {
  const spec = IMAGE_SIZES[sizeName];
  if (!spec) {
    throw new PixabayError(
      `Unknown image size "${sizeName}". Available: ${Object.keys(IMAGE_SIZES).join(', ')}.`,
      { code: 'INVALID_PARAM' },
    );
  }

  // Sizes that need full API access have no derivable equivalent: the CDN
  // token for them does not exist on a standard key, and the API omits the
  // field entirely. Say so plainly instead of guessing.
  if (spec.needsFullAccess && !hit?.[spec.fallback]) {
    throw new PixabayError(
      `The "${sizeName}" rendition needs a Pixabay account approved for full API access. `
      + 'Apply at https://pixabay.com/api/docs/ — until then use "large" (1280px) or a webformat size.',
      { code: 'NEEDS_FULL_ACCESS' },
    );
  }

  const candidates = [];
  const seen = new Set();
  const push = (url) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      candidates.push(url);
    }
  };

  const derived = cdnSizeVariant(hit?.previewURL, spec.cdnToken);
  const direct = hit?.[spec.fallback];

  // Prefer the derived CDN URL only when its token is known to exist, because
  // the API field is often a size-bound proxy URL of the exact right size
  // anyway, and the derived URL may 403.
  if (spec.cdnFirst) {
    push(derived);
    push(direct);
  } else {
    push(direct);
    push(derived);
  }

  // Neighbouring sizes, so a missing rendition still yields something usable.
  const neighbours = {
    web_180: ['preview', 'web_340'],
    web_340: ['web_640', 'preview'],
    web_640: ['preview'],
    web_960: ['large'],
  }[sizeName] ?? [];
  for (const neighbour of neighbours) {
    const nspec = IMAGE_SIZES[neighbour];
    push(cdnSizeVariant(hit?.previewURL, nspec.cdnToken));
    push(hit?.[nspec.fallback]);
  }

  if (candidates.length === 0) {
    throw new PixabayError(
      `This image does not provide a "${sizeName}" rendition (${spec.fallback} is missing).`,
      { code: 'NO_RENDITION' },
    );
  }
  return candidates;
}

/**
 * Resolve a downloadable image URL for a named size.
 *
 * When `verify` is set the candidates are probed in order and the first URL
 * that responds 2xx wins; otherwise the first candidate is returned as-is.
 */
export async function resolveImageUrl(hit, sizeName = 'large', { verify = false } = {}) {
  const candidates = imageUrlCandidates(hit, sizeName);
  if (!verify) return candidates[0];

  for (const url of candidates) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return url;
    } catch {
      // try the next candidate
    }
  }
  throw new PixabayError(
    `No working URL found for the "${sizeName}" rendition of this image. `
    + `Tried: ${candidates.join(', ')}.`,
    { code: 'NO_RENDITION' },
  );
}

/** Resolve a downloadable video URL for a named rendition. */
export function resolveVideoUrl(hit, sizeName = 'medium') {
  if (!VIDEO_SIZES[sizeName]) {
    throw new PixabayError(
      `Unknown video size "${sizeName}". Available: ${Object.keys(VIDEO_SIZES).join(', ')}.`,
      { code: 'INVALID_PARAM' },
    );
  }
  const rendition = hit?.videos?.[sizeName];
  if (!rendition?.url) {
    throw new PixabayError(
      `This video has no "${sizeName}" rendition available. `
      + `Available: ${Object.entries(hit?.videos ?? {}).filter(([, v]) => v?.url).map(([k]) => k).join(', ') || 'none'}.`,
      { code: 'NO_RENDITION' },
    );
  }
  return rendition.url;
}

/**
 * Download a URL to disk, trying each candidate in order until one succeeds.
 * Returns the saved path plus which candidate won.
 */
export async function downloadFirstWorking(candidates, destination) {
  const errors = [];
  for (const url of candidates) {
    try {
      const saved = await downloadUrlTo(url, destination);
      return { ...saved, url };
    } catch (err) {
      errors.push(`${url}: ${err instanceof PixabayError ? err.message : err}`);
    }
  }
  throw new PixabayError(
    `Could not download any candidate URL.\n${errors.join('\n')}`,
    { code: 'DOWNLOAD_FAILED', body: errors.join('\n') },
  );
}

async function downloadUrlTo(url, destination) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'claude-pixabay-media-plugin/1.0' },
  });
  if (!response.ok) {
    throw new PixabayError(`HTTP ${response.status}`, { status: response.status, code: 'DOWNLOAD_FAILED' });
  }
  const contentType = response.headers.get('content-type');
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  const extByType = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
    'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  };
  let ext = extByType[type] || extname(new URL(url).pathname) || '';

  let target = resolve(destination);
  if (destination.endsWith('/') || destination.endsWith('\\') || !extname(destination)) {
    await mkdir(target, { recursive: true });
    target = join(target, basename(new URL(url).pathname) || `pixabay${ext}`);
  } else {
    await mkdir(resolve(target, '..'), { recursive: true });
  }
  if (!extname(target)) target = `${target}${ext}`;

  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  const info = await stat(target);
  return { path: target, bytes: info.size, contentType };
}

export function summarizeImage(hit) {
  const sizes = {};
  for (const name of Object.keys(IMAGE_SIZES)) {
    try {
      // First candidate only — the full candidate list is used at download time.
      sizes[name] = imageUrlCandidates(hit, name)[0] ?? null;
    } catch {
      sizes[name] = null;
    }
  }
  return {
    id: hit.id,
    type: hit.type,
    tags: hit.tags,
    name: hit.name ?? null,
    heading: hit.heading ?? null,
    description: hit.description ?? null,
    pageURL: hit.pageURL,
    previewURL: hit.previewURL ?? null,
    sizes,
    imageWidth: hit.imageWidth ?? null,
    imageHeight: hit.imageHeight ?? null,
    imageSize: hit.imageSize ?? null,
    views: hit.views ?? null,
    downloads: hit.downloads ?? null,
    likes: hit.likes ?? null,
    collections: hit.collections ?? null,
    user: hit.user ?? null,
    user_id: hit.user_id ?? null,
    userURL: hit.userURL ?? (hit.user ? `https://pixabay.com/users/${hit.user_id}/` : null),
    userImageURL: hit.userImageURL ?? null,
    // Undocumented but returned by the API. `noAiTraining` is the per-asset
    // answer to "may this be used for AI/ML training?".
    noAiTraining: hit.noAiTraining ?? null,
    isAiGenerated: hit.isAiGenerated ?? null,
    isGRated: hit.isGRated ?? null,
    isLowQuality: hit.isLowQuality ?? null,
  };
}

export function summarizeVideo(hit) {
  const renditions = {};
  for (const name of Object.keys(VIDEO_SIZES)) {
    const r = hit?.videos?.[name];
    renditions[name] = r?.url
      ? { url: r.url, width: r.width, height: r.height, size: r.size, thumbnail: r.thumbnail }
      : null;
  }
  return {
    id: hit.id,
    type: hit.type,
    tags: hit.tags,
    name: hit.name ?? null,
    heading: hit.heading ?? null,
    pageURL: hit.pageURL,
    duration: hit.duration ?? null,
    renditions,
    views: hit.views ?? null,
    downloads: hit.downloads ?? null,
    likes: hit.likes ?? null,
    collections: hit.collections ?? null,
    user: hit.user ?? null,
    user_id: hit.user_id ?? null,
    userURL: hit.userURL ?? (hit.user ? `https://pixabay.com/users/${hit.user_id}/` : null),
    userImageURL: hit.userImageURL ?? null,
    // Undocumented but returned by the API.
    noAiTraining: hit.noAiTraining ?? null,
    isAiGenerated: hit.isAiGenerated ?? null,
    isGRated: hit.isGRated ?? null,
    isLowQuality: hit.isLowQuality ?? null,
  };
}

export function summarizeSearchResponse(data, summarize) {
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return {
    total: data?.total ?? 0,
    totalHits: data?.totalHits ?? 0,
    // Pixabay caps totalHits at 500 per query - results beyond that are unreachable.
    hitsCapReached: (data?.totalHits ?? 0) >= 500,
    page: data?.page ?? null,
    cached: Boolean(data?._cached),
    rateLimit: data?._rateLimit ?? null,
    results: hits.map(summarize),
  };
}
