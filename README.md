<div align="center">
  <p style="font-size: 18px; white-space: nowrap;"><strong>50+ databases in 15 MB. Desktop app and self-hostable web, with built-in AI assistant.</strong></p>

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
      <h3>🪶 15 MB, zero runtime bloat</h3>
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

### 50+ Databases, One Tool

MySQL, PostgreSQL, SQLite, Redis, MongoDB, DuckDB, ClickHouse, SQL Server, Oracle, Elasticsearch, MariaDB, TiDB, OceanBase, openGauss, GaussDB, KWDB, KingBase, Vastbase, GoldenDB, Doris, SelectDB, StarRocks, Manticore Search, Redshift, DM, TDengine, XuguDB, CockroachDB, Access, HighGo, and more. Agent/JDBC-oriented profiles extend DBX to H2, Snowflake, Trino, Hive, DB2, Informix, Neo4j, Cassandra, BigQuery, Kylin, SunDB, and custom JDBC connections. New native and agent-driven drivers also cover Databricks, SAP HANA, Teradata, Vertica, Firebird, Exasol, YashanDB, GBase, Databend, RQLite, Turso, InfluxDB, QuestDB, IoTDB, etcd, IRIS, and more. All in a single ~15 MB app. No bundled Chromium.

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

**Windows:**

No additional dependencies required.

### Development

```bash
pnpm install
pnpm dev:tauri
```

> [!TIP]
> DuckDB compilation takes a while. If you're not working on DuckDB features,
> skip it to speed up local builds:
>
> ```bash
> # Fast checks (skip DuckDB)
> cargo check --no-default-features
> cargo test  --no-default-features
>
> # Tauri dev without DuckDB
> pnpm tauri dev -- --no-default-features
> ```
>
> The `--no-default-features` flag only affects local development.
> Release builds (`pnpm tauri build`) always include DuckDB.

Web version:

```bash
pnpm dev:web       # frontend
pnpm dev:backend   # backend
```

[dbx-agents](https://github.com/t8y2/dbx-agents) is a separate repository containing JDBC agent driver development projects. For local development, clone it alongside `dbx/` under the same workspace directory and open the parent folder in your IDE:

```bash
mkdir dbx-workspace && cd dbx-workspace
git clone https://github.com/QYue64/dbx.git
git clone https://github.com/t8y2/dbx-agents.git
# Open dbx-workspace/ in your IDE to work on both projects together
```

This keeps the two repositories independent (separate git histories) while making it easy to navigate between them during development.

### Build

```bash
pnpm tauri build
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
DBX is 15 MB with no runtime dependencies (no Java, no Python). It includes AI and MCP natively — not as plugins. It supports 50+ databases across desktop, Docker, and web from a single codebase.
</details>

<details>
<summary><strong>What databases are supported?</strong></summary>
MySQL, PostgreSQL, SQLite, Redis, MongoDB, DuckDB, ClickHouse, SQL Server, Oracle, Elasticsearch, MariaDB, TiDB, OceanBase, openGauss, GaussDB, KWDB, KingBase, Vastbase, GoldenDB, Doris, SelectDB, StarRocks, Manticore Search, Redshift, DM, TDengine, XuguDB, CockroachDB, Access, HighGo, and more. Agent/JDBC-oriented profiles extend support to H2, Snowflake, Trino, Hive, DB2, Informix, Neo4j, Cassandra, BigQuery, Kylin, SunDB, Databricks, SAP HANA, Teradata, Vertica, Firebird, Exasol, YashanDB, GBase, Databend, RQLite, Turso, InfluxDB, QuestDB, IoTDB, etcd, IRIS, and custom JDBC connections.
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
