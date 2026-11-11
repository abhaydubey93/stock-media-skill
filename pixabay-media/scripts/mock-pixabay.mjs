/**
 * Mock Pixabay API for offline testing.
 *
 * Serves the documented response shape with fixture data, so the MCP server
 * and CLI can be exercised end to end without a real API key or network
 * access to Pixabay's CDN.
 *
 * By default the asset URLs point back at this server, and the server also
 * serves the asset bytes, so image and video downloads work offline.
 *
 * Usage:  node scripts/mock-pixabay.mjs [port]
 *         PIXABAY_API_BASE=http://127.0.0.1:PORT node scripts/pixabay.mjs
 */

import { createServer } from 'node:http';

const PORT = Number(process.argv[2] || 8731);
// Default to ourselves so the mock is self-contained. Override to point the
// asset URLs at a real CDN instead.
const CDN = process.env.MOCK_CDN_BASE || `http://127.0.0.1:${PORT}`;

const IMAGE_HIT = {
  id: 195893,
  pageURL: 'https://pixabay.com/photos/mock-blossom-195893/',
  type: 'photo',
  tags: 'blossom, bloom, flower, mock',
  previewURL: `${CDN}/photo/mock_150.jpg`,
  previewWidth: 150,
  previewHeight: 84,
  webformatURL: `${CDN}/photo/mock_640.jpg`,
  webformatWidth: 640,
  webformatHeight: 360,
  largeImageURL: `${CDN}/photo/mock_1280.jpg`,
  imageWidth: 4000,
  imageHeight: 2250,
  imageSize: 2411520,
  views: 7671,
  downloads: 6439,
  likes: 5,
  comments: 2,
  collections: 12,
  user_id: 48777,
  user: 'Josch13',
  userURL: 'https://pixabay.com/users/48777/',
  userImageURL: `${CDN}/user/mock_250.jpg`,
  noAiTraining: false,
  isAiGenerated: false,
  isGRated: true,
  isLowQuality: false,
};

const VIDEO_HIT = {
  id: 125,
  pageURL: 'https://pixabay.com/videos/mock-flowers-125/',
  type: 'film',
  tags: 'flowers, yellow, blossom, mock',
  name: 'flowers, yellow, blossom',
  duration: 12,
  videos: {
    large: {
      url: `${CDN}/video/mock_4k.mp4`,
      width: 3840,
      height: 2160,
      size: 6615235,
      thumbnail: `${CDN}/video/mock_4k.jpg`,
    },
    medium: {
      url: `${CDN}/video/mock_1080.mp4`,
      width: 1920,
      height: 1080,
      size: 3562083,
      thumbnail: `${CDN}/video/mock_1080.jpg`,
    },
    small: {
      url: `${CDN}/video/mock_720.mp4`,
      width: 1280,
      height: 720,
      size: 1030736,
      thumbnail: `${CDN}/video/mock_720.jpg`,
    },
    tiny: {
      url: `${CDN}/video/mock_540.mp4`,
      width: 960,
      height: 540,
      size: 426799,
      thumbnail: `${CDN}/video/mock_540.jpg`,
    },
  },
  views: 4462,
  downloads: 1464,
  likes: 18,
  comments: 0,
  collections: null,
  user_id: 1281700,
  user: 'Coverr-Free-Footage',
  userURL: 'https://pixabay.com/users/1281700/',
  userImageURL: `${CDN}/user/mock2_250.jpg`,
  noAiTraining: false,
  isAiGenerated: false,
  isGRated: true,
  isLowQuality: false,
};

// A real, if tiny, JPEG so the download path produces a valid file.
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABkAGQBAREA/8QAHwAAAQUBAQEB'
  + 'AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh'
  + 'ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ'
  + 'WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxM'
  + 'XGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z',
  'base64',
);
const MP4_BYTES = Buffer.from('0000001c6d703432000000006d703432', 'hex');

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Serve asset bytes so downloads work offline.
  if (url.pathname.startsWith('/photo/') || url.pathname.startsWith('/user/')) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.end(JPEG_BYTES);
    return;
  }
  if (url.pathname.startsWith('/video/')) {
    if (url.pathname.endsWith('.jpg')) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.end(JPEG_BYTES);
    } else {
      res.setHeader('Content-Type', 'video/mp4');
      res.end(MP4_BYTES);
    }
    return;
  }

  const key = url.searchParams.get('key');
  res.setHeader('X-RateLimit-Limit', '100');
  res.setHeader('X-RateLimit-Remaining', '99');
  res.setHeader('X-RateLimit-Reset', '42');
  res.setHeader('Content-Type', 'application/json');

  if (!key || key === 'INVALID') {
    res.statusCode = 400;
    res.end('[ERROR 400] Invalid or missing API key (https://pixabay.com/api/docs/).');
    return;
  }

  const id = url.searchParams.get('id');
  const isVideo = url.pathname.includes('/videos');
  const hits = isVideo ? [VIDEO_HIT] : [IMAGE_HIT];
  const payload = { total: 42, totalHits: 42, hits };
  if (id) {
    const match = hits.filter((h) => String(h.id) === String(id));
    payload.total = match.length;
    payload.totalHits = match.length;
    payload.hits = match;
  }
  res.end(JSON.stringify(payload));
});

server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`mock pixabay listening on http://127.0.0.1:${PORT}\n`);
});
