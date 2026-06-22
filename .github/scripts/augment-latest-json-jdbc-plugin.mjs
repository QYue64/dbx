import { readFileSync, writeFileSync } from "node:fs";

const GITHUB_PROXY_PREFIX = "https://gh-proxy.org/";

export function proxyGithubDownloadUrl(url) {
  if (typeof url !== "string") return url;
  if (url.startsWith(GITHUB_PROXY_PREFIX)) return url;
  if (!url.startsWith("https://github.com/")) return url;
  return `${GITHUB_PROXY_PREFIX}${url}`;
}

export function proxyLatestJsonPlatformUrls(data) {
  if (!data || typeof data !== "object" || !data.platforms || typeof data.platforms !== "object") {
    return data;
  }
  for (const platform of Object.values(data.platforms)) {
    if (platform && typeof platform === "object" && typeof platform.url === "string") {
      platform.url = proxyGithubDownloadUrl(platform.url);
    }
  }
  return data;
}

export function augmentLatestJsonWithJdbcPlugin({ latestJson, jdbcVersion, protocolVersion, url }) {
  const data = JSON.parse(latestJson);
  proxyLatestJsonPlatformUrls(data);
  data.jdbc_plugin = {
    version: jdbcVersion,
    protocol_version: Number(protocolVersion),
    url: proxyGithubDownloadUrl(url),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

function main() {
  const [latestJsonPath, jdbcVersion, protocolVersion, url] = process.argv.slice(2);
  if (!latestJsonPath || !jdbcVersion || !protocolVersion || !url) {
    console.error("Usage: augment-latest-json-jdbc-plugin.mjs <latest.json> <jdbc-version> <protocol-version> <url>");
    process.exit(1);
  }

  const updated = augmentLatestJsonWithJdbcPlugin({
    latestJson: readFileSync(latestJsonPath, "utf8"),
    jdbcVersion,
    protocolVersion,
    url,
  });
  writeFileSync(latestJsonPath, updated);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
