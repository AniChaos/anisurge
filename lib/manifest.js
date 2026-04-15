module.exports = {
  id: "community.anisurge",
  version: "1.0.0",
  name: "AniSurge",
  description:
    "Anime & Donghua streams from multiple sources — torrents, direct streams, and more",
  logo: "https://i.imgur.com/placeholder.png",
  background: "https://i.imgur.com/placeholder.png",
  resources: ["catalog", "meta", "stream"],
  types: ["series"],
  catalogs: [
    {
      type: "series",
      id: "anisurge-trending",
      name: "Trending Anime",
      extra: [{ name: "search" }, { name: "skip" }],
    },
    {
      type: "series",
      id: "anisurge-popular",
      name: "Popular Anime",
      extra: [{ name: "skip" }],
    },
    {
      type: "series",
      id: "anisurge-top-rated",
      name: "Top Rated Anime",
      extra: [{ name: "skip" }],
    },
    {
      type: "series",
      id: "anisurge-trending-donghua",
      name: "Trending Donghua",
      extra: [{ name: "skip" }],
    },
  ],
  idPrefixes: ["anilist:"],
  behaviorHints: { p2p: true },
};
