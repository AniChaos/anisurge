const anilist = require("./anilist");

const PER_PAGE = 20;

async function catalogHandler({ type, id, extra }) {
  const skip = parseInt(extra.skip) || 0;
  const page = Math.floor(skip / PER_PAGE) + 1;

  if (extra.search) {
    const metas = await anilist.search(extra.search, page, PER_PAGE);
    return { metas };
  }

  let metas;
  switch (id) {
    case "anisurge-trending":
      metas = await anilist.trending(page, PER_PAGE);
      break;
    case "anisurge-popular":
      metas = await anilist.popular(page, PER_PAGE);
      break;
    case "anisurge-top-rated":
      metas = await anilist.topRated(page, PER_PAGE);
      break;
    case "anisurge-trending-donghua":
      metas = await anilist.trendingDonghua(page, PER_PAGE);
      break;
    default:
      return { metas: [] };
  }

  return { metas };
}

module.exports = catalogHandler;
