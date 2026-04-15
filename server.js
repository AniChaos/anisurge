require("dotenv").config();

const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const manifest = require("./lib/manifest");
const catalogHandler = require("./lib/catalog");
const metaHandler = require("./lib/meta");
const streamHandler = require("./lib/stream");

const builder = new addonBuilder(manifest);
builder.defineCatalogHandler(catalogHandler);
builder.defineMetaHandler(metaHandler);
builder.defineStreamHandler(streamHandler);

const app = express();
app.use(getRouter(builder.getInterface()));

app.get("/health", (_, res) => res.json({ status: "ok" }));

const port = parseInt(process.env.PORT) || 7000;
app.listen(port, "0.0.0.0", () => {
  console.log(`AniSurge addon running at http://0.0.0.0:${port}`);
  console.log(`Manifest: http://127.0.0.1:${port}/manifest.json`);
});
