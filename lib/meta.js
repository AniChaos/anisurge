const anilist = require("./anilist");

function stripHtml(str) {
  if (!str) return "";
  return str.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function formatDate(d) {
  if (!d || !d.year) return undefined;
  return `${d.year}-${String(d.month || 1).padStart(2, "0")}-${String(d.day || 1).padStart(2, "0")}`;
}

async function metaHandler({ type, id }) {
  const anilistId = parseInt(id.replace("anilist:", ""));
  if (!anilistId) return { meta: null };

  let media;
  try {
    media = await anilist.getAnime(anilistId);
  } catch {
    return { meta: null };
  }
  if (!media) return { meta: null };

  const epCount = media.episodes || 0;
  const airingMap = {};
  if (media.airingSchedule && media.airingSchedule.nodes) {
    for (const node of media.airingSchedule.nodes) {
      airingMap[node.episode] = new Date(node.airingAt * 1000).toISOString();
    }
  }

  const videos = [];
  for (let ep = 1; ep <= epCount; ep++) {
    videos.push({
      id: `anilist:${anilistId}:1:${ep}`,
      title: `Episode ${ep}`,
      season: 1,
      episode: ep,
      released: airingMap[ep] || undefined,
    });
  }

  const releaseInfo = [
    media.startDate?.year,
    media.endDate?.year && media.endDate.year !== media.startDate?.year
      ? media.endDate.year
      : null,
  ]
    .filter(Boolean)
    .join("-");

  return {
    meta: {
      id: `anilist:${anilistId}`,
      type: "series",
      name: anilist.getTitle(media),
      poster: media.coverImage.extraLarge || media.coverImage.large,
      background: media.bannerImage || undefined,
      description: stripHtml(media.description),
      releaseInfo: releaseInfo || undefined,
      imdbRating: media.averageScore
        ? (media.averageScore / 10).toFixed(1)
        : undefined,
      genres: media.genres || [],
      videos,
    },
  };
}

module.exports = metaHandler;
