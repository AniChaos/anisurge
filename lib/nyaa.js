const cheerio = require("cheerio");

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.bittor.pw:1337/announce",
  "udp://explodie.org:6969/announce",
];

const RSS_URL = "https://nyaa.si/?page=rss&c=1_2&q=";

function parseQuality(title) {
  if (/2160p/i.test(title)) return "2160p";
  if (/1080p/i.test(title)) return "1080p";
  if (/720p/i.test(title)) return "720p";
  if (/480p/i.test(title)) return "480p";
  return "Unknown";
}

function parseGroup(title) {
  const match = title.match(/^\[([^\]]+)\]/);
  return match ? match[1] : "";
}

function qualityRank(q) {
  const map = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, Unknown: 0 };
  return map[q] || 0;
}

function parseRssXml(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];

  $("item").each((_, el) => {
    const $el = $(el);
    const title = $el.find("title").text();
    const infoHash = $el.find("nyaa\\:infoHash, infoHash").text();
    const seeders = parseInt($el.find("nyaa\\:seeders, seeders").text()) || 0;
    const size = $el.find("nyaa\\:size, size").text();
    const trusted = $el.find("nyaa\\:trusted, trusted").text() === "Yes";

    if (!infoHash) return;

    items.push({ title, infoHash: infoHash.toLowerCase(), seeders, size, trusted });
  });

  return items;
}

async function searchNyaa(queryStr) {
  const url = RSS_URL + encodeURIComponent(queryStr);
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = await res.text();
  return parseRssXml(xml);
}

async function findStreams(englishTitle, romajiTitle, episode) {
  const epStr = String(episode).padStart(2, "0");
  const queries = [];

  for (const title of [englishTitle, romajiTitle].filter(Boolean)) {
    queries.push(`"${title}" ${epStr}`);
    queries.push(`"${title}" E${epStr}`);
    queries.push(`"${title}" - ${epStr}`);
  }

  // deduplicate queries
  const unique = [...new Set(queries)];

  const allResults = await Promise.all(unique.map(searchNyaa));
  const seen = new Set();
  const merged = [];

  for (const results of allResults) {
    for (const item of results) {
      if (seen.has(item.infoHash)) continue;
      seen.add(item.infoHash);
      if (item.seeders > 0) merged.push(item);
    }
  }

  // sort: trusted first, then by seeders, then by quality
  merged.sort((a, b) => {
    if (a.trusted !== b.trusted) return b.trusted - a.trusted;
    const qa = qualityRank(parseQuality(a.title));
    const qb = qualityRank(parseQuality(b.title));
    if (qa !== qb) return qb - qa;
    return b.seeders - a.seeders;
  });

  return merged.map((item) => {
    const quality = parseQuality(item.title);
    const group = parseGroup(item.title);
    const trackerSources = TRACKERS.map((t) => `tracker:${t}`);

    return {
      infoHash: item.infoHash,
      fileIdx: 0,
      name: `Nyaa ${quality}`,
      title: `${item.title}\n${item.seeders} seeders | ${item.size}`,
      sources: trackerSources,
    };
  });
}

module.exports = { findStreams };
