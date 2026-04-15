const cheerio = require("cheerio");

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.bittor.pw:1337/announce",
  "udp://explodie.org:6969/announce",
];

const RSS_URL = "https://subsplease.org/rss/";
const API_URL = "https://subsplease.org/api/";

function parseQuality(title) {
  if (/2160p/i.test(title)) return "2160p";
  if (/1080p/i.test(title)) return "1080p";
  if (/720p/i.test(title)) return "720p";
  if (/480p/i.test(title)) return "480p";
  return "Unknown";
}

function qualityRank(q) {
  const map = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, Unknown: 0 };
  return map[q] || 0;
}

function extractInfoHash(magnetUri) {
  if (!magnetUri) return null;
  const match = magnetUri.match(/btih:([a-fA-F0-9]{40})/);
  return match ? match[1].toLowerCase() : null;
}

async function searchRss(queryStr) {
  const url = `${RSS_URL}?t&s=${encodeURIComponent(queryStr)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = await res.text();

  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];

  $("item").each((_, el) => {
    const $el = $(el);
    const title = $el.find("title").text();
    const link = $el.find("link").text();

    // SubsPlease RSS link is a torrent file URL, extract hash from it or use magnet
    // The link contains the info hash in the filename
    const hashMatch = link.match(/([a-fA-F0-9]{40})/);
    const infoHash = hashMatch ? hashMatch[1].toLowerCase() : null;

    if (!infoHash) return;

    items.push({ title, infoHash });
  });

  return items;
}

async function searchApi(queryStr) {
  const url = `${API_URL}?f=search&tz=UTC&s=${encodeURIComponent(queryStr)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  // API returns object with show names as keys
  if (typeof data !== "object" || Array.isArray(data)) return [];

  const results = [];
  for (const [, show] of Object.entries(data)) {
    if (show.downloads && Array.isArray(show.downloads)) {
      for (const dl of show.downloads) {
        const infoHash = extractInfoHash(dl.magnet);
        if (infoHash) {
          results.push({
            title: `[SubsPlease] ${show.show} - ${dl.res}`,
            infoHash,
            quality: dl.res || "Unknown",
          });
        }
      }
    }
  }

  return results;
}

async function findStreams(englishTitle, romajiTitle, episode) {
  const epStr = String(episode).padStart(2, "0");
  const queries = [];

  for (const title of [englishTitle, romajiTitle].filter(Boolean)) {
    queries.push(`${title} - ${epStr}`);
  }

  const unique = [...new Set(queries)];

  // Try RSS first, fall back to API search
  const allResults = await Promise.all(unique.map(searchRss));

  const seen = new Set();
  const merged = [];

  for (const items of allResults) {
    for (const item of items) {
      if (seen.has(item.infoHash)) continue;
      seen.add(item.infoHash);
      merged.push(item);
    }
  }

  // If RSS gave nothing, try the API
  if (merged.length === 0) {
    for (const title of [englishTitle, romajiTitle].filter(Boolean)) {
      const apiResults = await searchApi(title);
      for (const item of apiResults) {
        if (seen.has(item.infoHash)) continue;
        seen.add(item.infoHash);
        merged.push(item);
      }
      if (merged.length > 0) break;
    }
  }

  merged.sort((a, b) => {
    const qa = qualityRank(parseQuality(a.title));
    const qb = qualityRank(parseQuality(b.title));
    return qb - qa;
  });

  const trackerSources = TRACKERS.map((t) => `tracker:${t}`);

  return merged.map((item) => {
    const quality = parseQuality(item.title);

    return {
      infoHash: item.infoHash,
      fileIdx: 0,
      name: `SubsPlease ${quality}`,
      title: item.title,
      sources: trackerSources,
    };
  });
}

module.exports = { findStreams };
