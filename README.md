<div align="center">
  <p style="font-size: 18px; white-space: nowrap;"><strong>60+ databases in 20 MB. Desktop & Docker self-hosting, with built-in AI assistant.</strong></p>

  <p>
    <a href="https://github.com/QYue64/dbx/releases"><img src="https://img.shields.io/github/downloads/QYue64/dbx/total?style=for-the-badge&color=blue" /></a>
    <a href="https://github.com/QYue64/dbx/graphs/contributors"><img src="https://img.shields.io/github/contributors/QYue64/dbx?style=for-the-badge" /></a>
	  </p>

	  <p>
    <img src="https://img.shields.io/badge/MySQL-4479A1?logo=mysql&logoColor=white" />
    <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" />
    <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" />
    <img src="https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white" />
    <img src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white" />
    <img src="https://img.shields.io/badge/DuckDB-FFF000?logo=duckdb&logoColor=black" />
    <img src="https://img.shields.io/badge/ClickHouse-FFCC01?logo=clickhouse&logoColor=black" />
    <img src="https://img.shields.io/badge/SQL%20Server-CC2927?logo=microsoftsqlserver&logoColor=white" />
    <img src="https://img.shields.io/badge/Oracle-F80000?logo=oracle&logoColor=white" />
    <img src="https://img.shields.io/badge/Elasticsearch-005571?logo=elasticsearch&logoColor=white" />
    <img src="https://img.shields.io/badge/MariaDB-003545?logo=mariadb&logoColor=white" />
    <img src="https://img.shields.io/badge/TiDB-DC150B?logo=tidb&logoColor=white" />
    <img src="https://img.shields.io/badge/Doris-0052CC?logoColor=white" />
    <img src="https://img.shields.io/badge/SelectDB-22C1C3?logoColor=white" />
    <img src="https://img.shields.io/badge/StarRocks-5C2D91?logoColor=white" />
    <img src="https://img.shields.io/badge/Redshift-8C4FFF?logo=amazonredshift&logoColor=white" />
    <img src="https://img.shields.io/badge/DM-3857FF?logoColor=white" />
    <img src="https://img.shields.io/badge/OceanBase-006AFF?logoColor=white" />
    <img src="https://img.shields.io/badge/openGauss-2B7BD9?logoColor=white" />
    <img src="https://img.shields.io/badge/GaussDB-E60012?logoColor=white" />
    <img src="https://img.shields.io/badge/KWDB-1c60e0?logoColor=white" />
    <img src="https://img.shields.io/badge/KingBase-003B8E?logoColor=white" />
    <img src="https://img.shields.io/badge/TDengine-2F6FFF?logoColor=white" />
    <img src="https://img.shields.io/badge/CockroachDB-6933FF?logoColor=white" />
    <img src="https://img.shields.io/badge/InfluxDB-d30971?logo=influxdb&logoColor=white" />
    <img src="https://img.shields.io/badge/JDBC-4B5563?logoColor=white" />
    <img src="https://img.shields.io/badge/and%20more...-555555?logoColor=white" />
  </p>
	  <p>
    English | <a href="README.zh-CN.md">前往中文版本</a>
  </p>

</div>

## Why DBX?

<table>
  <tr>
    <td width="50%">
      <h3>🪶 20 MB, zero runtime bloat</h3>
      <p>No Java JRE. No Python venv. No bundled Chromium. DBX ships as a single small binary — download, install, connect. DBeaver needs Java; TablePlus is macOS-only. DBX runs everywhere with nothing extra.</p>
    </td>
    <td width="50%">
      <h3>🤖 AI that lives in your editor</h3>
      <p>Highlight a table, describe what you want, get SQL back — no copy-paste between tools. Works with Claude, OpenAI, or local models via Ollama. Built-in safety checks review AI-generated SQL before it runs.</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>🔌 MCP: your databases, AI-ready</h3>
      <p>DBX speaks the Model Context Protocol. Claude Code, Cursor, Windsurf, and other AI coding agents can query your databases through connections you already set up. One config, everywhere.</p>
    </td>
    <td>
      <h3>🌐 Desktop + Docker + Web</h3>
      <p>Native app on macOS, Windows, and Linux. Self-host via Docker for team access. Web version for browser-only environments. Same feature set. Same connections.</p>
    </td>
  </tr>
</table>

## Features

### 60+ Databases, One Tool

MySQL, PostgreSQL, SQLite, Cloudflare D1, Redis, MongoDB, DuckDB, ClickHouse, SQL Server, Oracle, Elasticsearch, Qdrant, Milvus, Weaviate, MariaDB, TiDB, OceanBase, openGauss, GaussDB, KWDB, KingBase, Vastbase, GoldenDB, Doris, SelectDB, StarRocks, Manticore Search, Redshift, DM, TDengine, XuguDB, CockroachDB, Access, HighGo, and more. Agent/JDBC-oriented profiles extend DBX to H2, Snowflake, Trino, PrestoSQL, Hive, DB2, Informix, Neo4j, Cassandra, BigQuery, Kylin, SunDB, JDBCX, and custom JDBC connections. New native and agent-driven drivers also cover Databricks, SAP HANA, Teradata, Vertica, Firebird, Exasol, YashanDB, GBase 8a/8s, Databend, RQLite, Turso, InfluxDB, QuestDB, IoTDB, etcd, ZooKeeper, Nacos, IRIS, and more. Message queue admin is also available for Pulsar, Kafka, and RocketMQ. All in a single ~20 MB app. No bundled Chromium.

### Query Editor

CodeMirror 6 with SQL syntax highlighting, metadata-aware autocomplete, `Cmd+Enter` execution, selected SQL execution, SQL formatting, diagnostics, and 9 editor themes. Persistent query history, saved SQL snippets, tab restore, and SQL file execution keep repeat work close at hand.

### AI SQL Assistant

Describe what you want in plain language — get SQL back. DBX can explain queries, optimize SQL, fix errors, and run AI-generated SQL through built-in safety checks. Works with Claude, OpenAI, local models, or any OpenAI-compatible endpoint.

### Data Grid

Virtual-scrolled table that handles large result sets. Inline editing, SQL preview before save, WHERE / ORDER BY controls, DataGrip-style filters, LIKE / NOT LIKE context filters, sorting, full-text search, pagination, column resize, auto-fit, row numbers, zebra stripes, and full cell details. Export or copy as CSV, JSON, Markdown, XLSX, or INSERT statements.

### Schema Tools

- **Schema browser** — databases, schemas, tables, columns, indexes, foreign keys, triggers, with sidebar search & pin
- **Object browser** — grouped procedures, functions, views, and source editing where supported
- **Table structure editor** — reviewable column and index changes for supported engines
- **ER diagram** — visualize table relationships
- **Schema diff** — compare structures across connections
- **Explain plan** — visual query execution plan
- **Field lineage** — column-level lineage analysis
- **Database search** — find objects across large schemas

### Data Operations

- **Table import** — CSV, Excel
- **Data transfer** — migrate between databases
- **Database export** — full database dump
- **Data compare** — compare table data and review synchronization output
- **SQL file execution** — run `.sql` files directly
- **File preview** — drag & drop Parquet, CSV, JSON to preview instantly (powered by DuckDB)
- **Connection import** — bring connection profiles from DBeaver or Navicat

### Specialized Browsers

- **Redis** — key pattern search, batch key operations, command runner, TTL editing, and all data types (String, Hash, List, Set, ZSet, Stream)
- **MongoDB** — document CRUD with pagination, Atlas & replica set URL connection

### Safety & Connectivity

SSH tunnel (key & password) · database and AI proxy settings · auto-reconnect on connection loss · confirmation dialogs for destructive operations · encrypted config export/import · color-coded connections · driver store and optional JDBC plugin

### Polished UI

Dark mode with native title bar sync · 9 editor themes · English, 简体中文 & Español · layout preferences · built-in auto-update

## AI Agent Integration (MCP)

DBX provides an [MCP server](packages/mcp-server/) that lets AI coding agents query your databases using connections already configured in DBX.

```bash
npx @dbx-app/mcp-server
```

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "dbx": { "command": "npx", "args": ["-y", "@dbx-app/mcp-server"] }
  }
}
```

Windows portable builds need `DBX_DATA_DIR` in the MCP config, pointing to the `data` directory next to `DBX.exe` (the folder that contains `dbx.db`).

Works with Claude Code, Cursor, Windsurf, and any MCP-compatible agent. Supports listing connections, browsing tables, executing SQL, and opening tables directly in DBX's UI.

DBX also provides a dedicated CLI package for terminal, script, and Codex workflows:

```bash
npm install -g @dbx-app/cli
dbx connections list --json
dbx query local "select 1" --json
```

See the [MCP server README](packages/mcp-server/README.md) and [CLI README](packages/cli/README.md) for details.

## Install

Download the latest desktop installers from the [QYue64/dbx Releases](https://github.com/QYue64/dbx/releases/latest) page.

This fork publishes installers through GitHub Releases only. Homebrew, Scoop, WinGet, and Docker images are not maintained for this distribution channel yet.

**Flatpak (Linux):**

```bash
flatpak remote-add --if-not-exists flatpark https://dl.flatpark.org/flatpark.flatpakrepo
flatpak install flatpark com.dbxio.dbx
```

Updates then arrive through the regular `flatpak update`. See the [DBX page on FlatPark](https://flatpark.org/apps/com.dbxio.dbx/) for details.

## Self-Hosted (Docker)

The upstream project provides a web Docker image, but this fork does not currently publish a `QYue64/dbx` image. For this distribution, use the desktop installers from GitHub Releases or build the web image yourself from this repository.

A local Docker Compose example lives at `deploy/docker-compose.yml`:

```yaml
services:
  dbx:
    build: .
    ports:
      - "4224:4224"
    volumes:
      - dbx-data:/app/data
    restart: unless-stopped

volumes:
  dbx-data:
```

Open `http://localhost:4224` in your browser.

To publish DBX under a reverse-proxy context path such as `/dbx`, set the
runtime base path and proxy the same prefix to the container:

```yaml
environment:
  - DBX_PUBLIC_BASE_PATH=/dbx
```

When building the frontend yourself with an absolute asset base, set
`VITE_DBX_BASE_PATH=/dbx/` before `pnpm build`.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) >= 1.77

#### System Dependencies

**macOS:**

No additional dependencies required.

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev
```

**NIXOS/NIX :**

<a href="README-NIX.md">See README-NIX.md</a>

**Windows:**

No additional dependencies required.

### Development

```bash
make
```

`make` installs root dependencies when needed and starts the local Tauri desktop development environment.

> [!TIP]
> DuckDB compilation takes a while. If you're not working on DuckDB features,
> skip it to speed up local builds:
>
> ```bash
> # Fast checks (skip DuckDB)
> make cargo-check-fast
> make cargo-test-fast
>
> # Tauri dev without DuckDB
> make dev-fast
> ```
>
> The `--no-default-features` flag only affects local development.
> Release builds (`pnpm tauri build`) always include DuckDB.

Web version:

```bash
make dev-web       # frontend
make dev-backend   # backend
```

Documentation site:

```bash
make docs
```

The official DBX documentation site lives in `docs/`. If you want to improve the website content or documentation pages, edit the files under `docs/` and run `make docs` to preview the site locally.

JDBC agent driver development projects live in `agents/`:

```bash
cd agents
./gradlew test
```

Build artifacts from `agents/drivers/<db-type>/build/libs/` are picked up by local driver install flows when available.

### Build

```bash
make package
```

The installer will be in `src-tauri/target/release/bundle/`.

## Tech Stack

| Layer     | Technology                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | [Tauri 2](https://tauri.app/)                                                                                                                                                                                    |
| Frontend  | [Vue 3](https://vuejs.org/) + TypeScript                                                                                                                                                                         |
| UI        | [shadcn-vue](https://www.shadcn-vue.com/) + Tailwind CSS                                                                                                                                                         |
| Editor    | [CodeMirror 6](https://codemirror.net/)                                                                                                                                                                          |
| Backend   | Rust + [sqlx](https://github.com/launchbadge/sqlx) / [tiberius](https://github.com/prisma/tiberius) / [redis-rs](https://github.com/redis-rs/redis-rs) / [mongodb](https://github.com/mongodb/mongo-rust-driver) |

## Project Source

This fork's source, releases, issues, and auto-update channel are centralized at [QYue64/dbx](https://github.com/QYue64/dbx).

## Support DBX

DBX is free and open source, but ongoing maintenance, database compatibility testing, infrastructure, and release work require sustained time and resources.

- [Support DBX](https://my.feishu.cn/wiki/WMTkwdATDiiu4rk14JMcoyhTnoh) — voluntary donations via WeChat or Alipay
- [Sponsors & Partners](https://my.feishu.cn/wiki/CgOWwwTzzify79k9Oq8cXpUNn6e) — sponsorship, infrastructure, tools, and community collaboration

Support does not affect access to DBX or guarantee feature prioritization. With mutual confirmation, sponsors and partners may be listed on the sponsors page.

## FAQ

<details>
<summary><strong>Is DBX free?</strong></summary>
Yes. DBX is open source under Apache-2.0. All features are free.
</details>

<details>
<summary><strong>Does DBX phone home?</strong></summary>
No. DBX does not collect telemetry. The auto-update feature checks GitHub Releases for new versions — you can disable it in settings.
</details>

<details>
<summary><strong>Can I use DBX without an internet connection?</strong></summary>
Yes. The desktop app works fully offline. For air-gapped driver installs, prepare driver packages on an internet-connected machine, transfer them to the offline machine, then import them in DBX from Settings > Driver Manager. AI features need network access to the model endpoint (or a local model via Ollama).
</details>

<details>
<summary><strong>How is DBX different from DBeaver / TablePlus / Beekeeper Studio?</strong></summary>
DBX is 20 MB with no runtime dependencies (no Java, no Python). It includes AI and MCP natively — not as plugins. It supports 60+ databases across desktop, Docker, and web from a single codebase.
</details>

<details>
<summary><strong>What databases are supported?</strong></summary>
MySQL, PostgreSQL, SQLite, Cloudflare D1, Redis, MongoDB, DuckDB, ClickHouse, SQL Server, Oracle, Elasticsearch, Qdrant, Milvus, Weaviate, MariaDB, TiDB, OceanBase, openGauss, GaussDB, KWDB, KingBase, Vastbase, GoldenDB, Doris, SelectDB, StarRocks, Manticore Search, Redshift, DM, TDengine, XuguDB, CockroachDB, Access, HighGo, and more. Agent/JDBC-oriented profiles extend support to H2, Snowflake, Trino, PrestoSQL, Hive, DB2, Informix, Neo4j, Cassandra, BigQuery, Kylin, SunDB, JDBCX, Databricks, SAP HANA, Teradata, Vertica, Firebird, Exasol, YashanDB, GBase 8a/8s, Databend, RQLite, Turso, InfluxDB, QuestDB, IoTDB, etcd, ZooKeeper, Nacos, IRIS, and custom JDBC connections. Message queue admin (Pulsar, Kafka, RocketMQ) is also supported.
</details>

<details>
<summary><strong>How do I report a bug or request a feature?</strong></summary>
Open an issue on <a href="https://github.com/QYue64/dbx/issues">GitHub Issues</a>.
</details>

## Contributors

<a href="https://github.com/QYue64/dbx/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=QYue64/dbx" />
</a>

## Star History

<a href="https://www.star-history.com/?repos=QYue64%2Fdbx&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=QYue64/dbx&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=QYue64/dbx&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=QYue64/dbx&type=date&legend=top-left" />
 </picture>
</a>

## License

[Apache-2.0](LICENSE)
