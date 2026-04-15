const cache = require("./cache");

const API_URL = "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id
  title { english romaji native }
  description(asHtml: false)
  coverImage { extraLarge large }
  bannerImage
  averageScore
  genres
  seasonYear
  season
  episodes
  status
  studios(isMain: true) { nodes { name } }
  startDate { year month day }
  endDate { year month day }
  airingSchedule(notYetAired: false, perPage: 50) {
    nodes { episode airingAt }
  }
`;

const PREVIEW_FIELDS = `
  id
  title { english romaji }
  coverImage { extraLarge large }
  averageScore
  seasonYear
`;

async function query(gql, variables) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: gql, variables }),
  });
  if (!res.ok) throw new Error(`AniList API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

function toMetaPreview(media) {
  return {
    id: `anilist:${media.id}`,
    type: "series",
    name: media.title.english || media.title.romaji,
    poster: media.coverImage.extraLarge || media.coverImage.large,
    releaseInfo: media.seasonYear ? String(media.seasonYear) : undefined,
    imdbRating: media.averageScore
      ? (media.averageScore / 10).toFixed(1)
      : undefined,
  };
}

async function _fetchPage(sort, page, perPage, country) {
  const countryFilter = country ? `, countryOfOrigin: $country` : "";
  const vars = { page, perPage, sort };
  if (country) vars.country = country;

  const data = await query(
    `query ($page: Int, $perPage: Int, $sort: [MediaSort]${country ? ", $country: CountryCode" : ""}) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: $sort, isAdult: false${countryFilter}) { ${PREVIEW_FIELDS} }
      }
    }`,
    vars
  );
  return data.Page.media.map(toMetaPreview);
}

async function _search(term, page, perPage) {
  const data = await query(
    `query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, search: $search, isAdult: false) { ${PREVIEW_FIELDS} }
      }
    }`,
    { search: term, page, perPage }
  );
  return data.Page.media.map(toMetaPreview);
}

async function _getAnime(anilistId) {
  const data = await query(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
    }`,
    { id: anilistId }
  );
  return data.Media;
}

const trending = cache.wrap("trending", cache.TTL.catalog, (page, perPage) =>
  _fetchPage(["TRENDING_DESC"], page, perPage)
);
const popular = cache.wrap("popular", cache.TTL.catalog, (page, perPage) =>
  _fetchPage(["POPULARITY_DESC"], page, perPage)
);
const topRated = cache.wrap("topRated", cache.TTL.catalog, (page, perPage) =>
  _fetchPage(["SCORE_DESC"], page, perPage)
);
const trendingDonghua = cache.wrap("trendingDonghua", cache.TTL.catalog, (page, perPage) =>
  _fetchPage(["TRENDING_DESC"], page, perPage, "CN")
);
const search = cache.wrap("search", cache.TTL.catalog, _search);
const getAnime = cache.wrap("anime", cache.TTL.meta, _getAnime);

function getTitle(media) {
  return media.title.english || media.title.romaji;
}

function getRomajiTitle(media) {
  return media.title.romaji;
}

module.exports = { trending, popular, topRated, trendingDonghua, search, getAnime, getTitle, getRomajiTitle, toMetaPreview };
