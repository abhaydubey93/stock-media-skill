/**
 * Mock Pixabay API for offline testing. Serves the documented response shape
 * with fixture data so the MCP server and CLI can be exercised end to end
 * without a real API key.
 *
 * Usage:  node scripts/mock-pixabay.mjs [port]
 *         PIXABAY_API_BASE=http://127.0.0.1:PORT node scripts/pixabay-mcp.mjs
 */

import { createServer } from 'node:http';

const PORT = Number(process.argv[2] || 8731);
const CDN = process.env.MOCK_CDN_BASE || 'https://cdn.pixabay.com';

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
  user_id: 48777,
  user: 'Josch13',
  userImageURL: `${CDN}/user/mock_250.jpg`,
};

const VIDEO_HIT = {
  id: 125,
  pageURL: 'https://pixabay.com/videos/mock-flowers-125/',
  type: 'film',
  tags: 'flowers, yellow, blossom, mock',
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
  user_id: 1281700,
  user: 'Coverr-Free-Footage',
  userImageURL: `${CDN}/user/mock2_250.jpg`,
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
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
    payload.total = 1;
    payload.totalHits = 1;
    payload.hits = hits.filter((h) => String(h.id) === String(id));
    if (payload.hits.length === 0) {
      payload.hits = [];
    }
  }
  res.end(JSON.stringify(payload));
});

server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`mock pixabay listening on http://127.0.0.1:${PORT}\n`);
});
