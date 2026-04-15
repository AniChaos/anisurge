const cheerio = require("cheerio");

const ANIWATCH_BASE = "https://aniwatchtv.to";
const DONGHUA_BASE = "https://donghuafun.com";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

async function fetchPage(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { ...HEADERS, ...extraHeaders },
    redirect: "follow",
  });
  if (!res.ok) return null;
  return res.text();
}

async function fetchJson(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      ...HEADERS,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      ...extraHeaders,
    },
    redirect: "follow",
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// AniWatch (aniwatchtv.to)
// ---------------------------------------------------------------------------

async function aniwatchSearch(title) {
  const url = `${ANIWATCH_BASE}/search?keyword=${encodeURIComponent(title)}`;
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  // Search results are links with title attributes
  $("a[href*='/'][title]").each((_, el) => {
    const href = $(el).attr("href");
    const name = $(el).attr("title") || $(el).text().trim();
    if (href && name && href.startsWith("/") && !href.startsWith("/genre")) {
      // Extract the anime slug, e.g. /one-piece-100
      const slug = href.split("?")[0];
      if (slug.match(/^\/[\w-]+-\d+$/)) {
        results.push({ slug, name });
      }
    }
  });

  // deduplicate by slug
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.slug)) return false;
    seen.add(r.slug);
    return true;
  });
}

async function aniwatchGetEpisodes(animeSlug) {
  // First load the anime page to get the data-id
  const html = await fetchPage(`${ANIWATCH_BASE}${animeSlug}`);
  if (!html) return [];

  const $ = cheerio.load(html);

  // Look for anime_id in page scripts or data attributes
  let animeId = null;

  // Try finding in script content
  const scriptContent = $("script")
    .map((_, el) => $(el).html())
    .get()
    .join("\n");
  const idMatch = scriptContent.match(/"anime_id"\s*:\s*"?(\d+)"?/);
  if (idMatch) animeId = idMatch[1];

  // Fallback: look for data-id on elements
  if (!animeId) {
    const dataId = $("[data-id]").first().attr("data-id");
    if (dataId) animeId = dataId;
  }

  if (!animeId) return [];

  // Fetch episode list via AJAX
  const json = await fetchJson(
    `${ANIWATCH_BASE}/ajax/v2/episode/list/${animeId}`,
    { Referer: `${ANIWATCH_BASE}${animeSlug}` }
  );
  if (!json || !json.html) return [];

  const $ep = cheerio.load(json.html);
  const episodes = [];

  $ep("a[href]").each((_, el) => {
    const href = $ep(el).attr("href");
    const epNum = $ep(el).attr("data-number") || $ep(el).attr("data-id");
    const dataId =
      $ep(el).attr("data-id") || href?.split("?ep=")[1] || null;
    const title = $ep(el).attr("title") || $ep(el).text().trim();

    if (href && dataId) {
      episodes.push({
        dataId,
        number: parseInt(epNum) || episodes.length + 1,
        title,
        href,
      });
    }
  });

  return episodes;
}

async function aniwatchGetSources(episodeDataId, animeSlug) {
  // Get servers for this episode
  const servers = await fetchJson(
    `${ANIWATCH_BASE}/ajax/v2/episode/servers?episodeId=${episodeDataId}`,
    { Referer: `${ANIWATCH_BASE}${animeSlug}` }
  );

  if (!servers || !servers.html) return [];

  const $ = cheerio.load(servers.html);
  const serverIds = [];

  // Collect server data-ids, prefer sub servers
  $("[data-id]").each((_, el) => {
    const serverId = $(el).attr("data-id");
    const type = $(el).attr("data-type") || "sub";
    const name = $(el).text().trim();
    if (serverId) serverIds.push({ serverId, type, name });
  });

  const streams = [];

  for (const server of serverIds.slice(0, 3)) {
    try {
      const sources = await fetchJson(
        `${ANIWATCH_BASE}/ajax/v2/episode/sources?id=${server.serverId}`,
        { Referer: `${ANIWATCH_BASE}${animeSlug}` }
      );

      if (!sources) continue;

      // Sources may have a direct link or encrypted data
      if (sources.link) {
        streams.push({
          url: sources.link,
          name: `AniWatch ${server.type.toUpperCase()} (${server.name})`,
          behaviorHints: { notWebReady: true },
        });
      }
    } catch {
      // Server may return encrypted data we can't decode
    }
  }

  return streams;
}

async function aniwatchFindStreams(title, episode) {
  try {
    const results = await aniwatchSearch(title);
    if (results.length === 0) return [];

    // Try to find the best match by title similarity
    const target = title.toLowerCase();
    const match =
      results.find((r) => r.name.toLowerCase() === target) ||
      results.find((r) => r.name.toLowerCase().includes(target)) ||
      results[0];

    const episodes = await aniwatchGetEpisodes(match.slug);
    const ep =
      episodes.find((e) => e.number === episode) || episodes[episode - 1];
    if (!ep) return [];

    return aniwatchGetSources(ep.dataId, match.slug);
  } catch (err) {
    console.error("AniWatch scraper error:", err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// DonghuaFun (donghuafun.com)
// ---------------------------------------------------------------------------

async function donghuaSearch(title) {
  const url = `${DONGHUA_BASE}/index.php/vod/search.html?wd=${encodeURIComponent(title)}`;
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $("a[href*='/index.php/vod/detail/id/']").each((_, el) => {
    const href = $(el).attr("href");
    const name = $(el).attr("title") || $(el).text().trim();
    if (href && name) {
      const idMatch = href.match(/\/id\/(\d+)/);
      if (idMatch) {
        results.push({ id: idMatch[1], name, href });
      }
    }
  });

  // deduplicate by id
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

async function donghuaGetPlayerData(animeId, episode) {
  // Try season 1 first, episode = nid
  const url = `${DONGHUA_BASE}/index.php/vod/play/id/${animeId}/sid/1/nid/${episode}.html`;
  const html = await fetchPage(url);
  if (!html) return null;

  // Extract player_aaaa object
  const match = html.match(/var\s+player_aaaa\s*=\s*(\{[^;]+\})/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function decodePlayerUrl(playerData) {
  if (!playerData || !playerData.url) return null;

  // If encrypt is 0, URL might be plain or base64
  if (playerData.encrypt === 0) {
    // Check if it looks like a URL already
    if (
      playerData.url.startsWith("http://") ||
      playerData.url.startsWith("https://")
    ) {
      return playerData.url;
    }
    // Try base64 decode
    try {
      const decoded = Buffer.from(playerData.url, "base64").toString("utf-8");
      if (decoded.startsWith("http")) return decoded;
    } catch {}
  }

  if (playerData.encrypt === 1) {
    // URL is typically base64 encoded
    try {
      const decoded = Buffer.from(playerData.url, "base64").toString("utf-8");
      if (decoded.startsWith("http")) return decoded;
    } catch {}
  }

  if (playerData.encrypt === 2) {
    // URL is typically double base64 encoded
    try {
      const first = Buffer.from(playerData.url, "base64").toString("utf-8");
      const decoded = Buffer.from(first, "base64").toString("utf-8");
      if (decoded.startsWith("http")) return decoded;
    } catch {}
  }

  // If from is "dailymotion" or similar, the URL might be a video ID
  if (playerData.from === "dailymotion" && !playerData.url.startsWith("http")) {
    return `https://www.dailymotion.com/embed/video/${playerData.url}`;
  }

  return null;
}

async function donghuaFindStreams(title, episode) {
  try {
    const results = await donghuaSearch(title);
    if (results.length === 0) return [];

    const target = title.toLowerCase();
    const match =
      results.find((r) => r.name.toLowerCase() === target) ||
      results.find((r) => r.name.toLowerCase().includes(target)) ||
      results[0];

    const playerData = await donghuaGetPlayerData(match.id, episode);
    if (!playerData) return [];

    const videoUrl = decodePlayerUrl(playerData);
    if (!videoUrl) return [];

    const source = playerData.from || "unknown";

    return [
      {
        url: videoUrl,
        name: `DonghuaFun (${source})`,
        behaviorHints: { notWebReady: true },
      },
    ];
  } catch (err) {
    console.error("DonghuaFun scraper error:", err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

async function findStreams(englishTitle, romajiTitle, episode) {
  const titles = [englishTitle, romajiTitle].filter(Boolean);
  const primaryTitle = titles[0] || "";

  const [aniwatchStreams, donghuaStreams] = await Promise.all([
    aniwatchFindStreams(primaryTitle, episode).catch(() => []),
    donghuaFindStreams(primaryTitle, episode).catch(() => []),
  ]);

  // If primary title didn't work for either, try romaji
  const retries = [];
  if (aniwatchStreams.length === 0 && romajiTitle && romajiTitle !== englishTitle) {
    retries.push(aniwatchFindStreams(romajiTitle, episode).catch(() => []));
  }
  if (donghuaStreams.length === 0 && romajiTitle && romajiTitle !== englishTitle) {
    retries.push(donghuaFindStreams(romajiTitle, episode).catch(() => []));
  }

  const retryResults = await Promise.all(retries);
  const allRetry = retryResults.flat();

  return [...aniwatchStreams, ...donghuaStreams, ...allRetry];
}

module.exports = { findStreams };
