const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.bittor.pw:1337/announce",
  "udp://explodie.org:6969/announce",
];

const API_URL = "https://feed.animetosho.org/json";

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

function formatSize(bytes) {
  if (!bytes) return "";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GiB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MiB`;
}

async function searchTosho(queryStr) {
  const url = `${API_URL}?q=${encodeURIComponent(queryStr)}&qx=1`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  return items;
}

async function findStreams(englishTitle, romajiTitle, episode) {
  const epStr = String(episode).padStart(2, "0");
  const queries = [];

  for (const title of [englishTitle, romajiTitle].filter(Boolean)) {
    queries.push(`"${title}" ${epStr}`);
    queries.push(`"${title}" E${epStr}`);
  }

  const unique = [...new Set(queries)];
  const allResults = await Promise.all(unique.map(searchTosho));

  const seen = new Set();
  const merged = [];

  for (const items of allResults) {
    for (const item of items) {
      const hash = item.info_hash;
      if (!hash || seen.has(hash)) continue;
      seen.add(hash);
      if ((item.seeders || 0) > 0) {
        merged.push(item);
      }
    }
  }

  merged.sort((a, b) => {
    const qa = qualityRank(parseQuality(a.title));
    const qb = qualityRank(parseQuality(b.title));
    if (qa !== qb) return qb - qa;
    return (b.seeders || 0) - (a.seeders || 0);
  });

  const trackerSources = TRACKERS.map((t) => `tracker:${t}`);

  return merged.map((item) => {
    const quality = parseQuality(item.title);
    const size = formatSize(item.total_size);

    return {
      infoHash: item.info_hash.toLowerCase(),
      fileIdx: item.num_files === 1 ? 0 : undefined,
      name: `Tosho ${quality}`,
      title: `${item.title}\n${item.seeders || 0} seeders${size ? " | " + size : ""}`,
      sources: trackerSources,
    };
  });
}

module.exports = { findStreams };
