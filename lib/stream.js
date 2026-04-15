const anilist = require("./anilist");
const nyaa = require("./nyaa");
const animetosho = require("./animetosho");
const subsplease = require("./subsplease");
const scraper = require("./scraper");
const cache = require("./cache");

async function _getStreams(anilistId, episode) {
  let media;
  try {
    media = await anilist.getAnime(anilistId);
  } catch {
    return { streams: [] };
  }
  if (!media) return { streams: [] };

  const englishTitle = anilist.getTitle(media);
  const romajiTitle = anilist.getRomajiTitle(media);

  const [nyaaStreams, toshoStreams, spStreams, scraperStreams] = await Promise.all([
    nyaa.findStreams(englishTitle, romajiTitle, episode).catch((err) => {
      console.error("Nyaa error:", err.message);
      return [];
    }),
    animetosho.findStreams(englishTitle, romajiTitle, episode).catch((err) => {
      console.error("AnimeTosho error:", err.message);
      return [];
    }),
    subsplease.findStreams(englishTitle, romajiTitle, episode).catch((err) => {
      console.error("SubsPlease error:", err.message);
      return [];
    }),
    scraper.findStreams(englishTitle, romajiTitle, episode).catch((err) => {
      console.error("Scraper error:", err.message);
      return [];
    }),
  ]);

  // Deduplicate torrents by infoHash across all sources
  const seen = new Set();
  const torrents = [];
  for (const stream of [...nyaaStreams, ...toshoStreams, ...spStreams]) {
    if (stream.infoHash && seen.has(stream.infoHash)) continue;
    if (stream.infoHash) seen.add(stream.infoHash);
    torrents.push(stream);
  }

  // HTTP streams first (instant play), then deduplicated torrents
  return { streams: [...scraperStreams, ...torrents] };
}

const getStreams = cache.wrap("streams", cache.TTL.stream, _getStreams);

async function streamHandler({ type, id }) {
  // id format: anilist:{anilistId}:1:{episode}
  const parts = id.split(":");
  if (parts.length < 4 || parts[0] !== "anilist") {
    return { streams: [] };
  }

  const anilistId = parseInt(parts[1]);
  const episode = parseInt(parts[3]);

  if (!anilistId || !episode) return { streams: [] };

  return getStreams(anilistId, episode);
}

module.exports = streamHandler;
