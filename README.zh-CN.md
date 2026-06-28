<div align="center">
  <p style="font-size: 18px; white-space: nowrap;"><strong>15 MB 驾驭 60+ 种数据库。桌面端 & Docker 自托管，内置 AI 助手。</strong></p>

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
    <a href="README.md">English</a> | 简体中文
  </p>

</div>

## 为什么选择 DBX？

<table>
  <tr>
    <td width="50%">
      <h3>🪶 15 MB，极致轻量</h3>
      <p>无需 Java 运行环境，无需 Python 虚拟环境，不内嵌 Chromium。DBX 是单个小巧的二进制文件——下载、安装、连接。DBeaver 依赖 Java；TablePlus 仅限 macOS。DBX 全平台可用，无需额外运行时。</p>
    </td>
    <td width="50%">
      <h3>🤖 AI 原生集成在编辑器里</h3>
      <p>选中一张表，描述你想要什么，直接得到 SQL——无需在工具之间复制粘贴。支持 Claude、OpenAI，或通过 Ollama 使用本地模型。内置安全检查会在执行前审查 AI 生成的 SQL。</p>
    </td>
  </tr>
  <tr>
    <td>
      <h3>🔌 MCP 协议：你的数据库，AI 就绪</h3>
      <p>DBX 原生支持 Model Context Protocol。Claude Code、Cursor、Windsurf 等 AI 编程助手可以直接通过你已配置的数据库连接查询数据。一次配置，处处可用。</p>
    </td>
    <td>
      <h3>🌐 桌面端 + Docker + Web</h3>
      <p>macOS、Windows、Linux 原生应用。通过 Docker 自托管供团队访问。Web 版本适配纯浏览器环境。同样的功能，同样的连接配置。</p>
    </td>
  </tr>
</table>

## 功能特性

### 60+ 种数据库，一个工具搞定

MySQL、PostgreSQL、SQLite、Redis、MongoDB、DuckDB、ClickHouse、SQL Server、Oracle、Elasticsearch、MariaDB、TiDB、OceanBase、openGauss、GaussDB、KWDB、KingBase、Vastbase、GoldenDB、Doris、SelectDB、StarRocks、Manticore Search、Redshift、DM、TDengine、虚谷 XuguDB、CockroachDB、Access、HighGo 等数据库都能直接连接。Agent/JDBC 方向的配置还可扩展到 H2、Snowflake、Trino、Hive、DB2、Informix、Neo4j、Cassandra、BigQuery、Kylin、SunDB 和自定义 JDBC。新增的原生与 Agent 驱动还覆盖了 Databricks、SAP HANA、Teradata、Vertica、Firebird、Exasol、崖山 YashanDB、GBase、Databend、RQLite、Turso、InfluxDB、QuestDB、IoTDB、etcd、IRIS 等。全部装进约 15 MB 的应用里，不内嵌 Chromium。

### 查询编辑器

CodeMirror 6 语法高亮、元数据感知自动补全、`Cmd+Enter` 执行、选中 SQL 执行、SQL 格式化、诊断提示，9 种编辑器主题。查询历史、常用 SQL 片段、标签页恢复和 SQL 文件执行让重复工作更顺手。

### AI SQL 助手

用自然语言描述你的需求，直接生成 SQL。还能解释查询、优化 SQL、修复错误，并通过内置安全检查执行 AI 生成的 SQL。支持 Claude、OpenAI、本地模型或任何 OpenAI 兼容端点。

### 数据表格

虚拟滚动，轻松应对大型结果集。行内编辑、保存前 SQL 预览、WHERE / ORDER BY 控件、DataGrip 风格过滤器、LIKE / NOT LIKE 右键过滤、排序、全文搜索、分页、列宽调整、自动列宽、行号、斑马纹和完整单元格详情。支持导出或复制为 CSV、JSON、Markdown、XLSX、INSERT 语句。

### Schema 工具

- **结构浏览** — 数据库、Schema、表、字段、索引、外键、触发器，支持侧边栏搜索和置顶
- **对象浏览** — 按类型分组查看过程、函数、视图，并在支持的数据库中编辑源码
- **表结构编辑器** — 对支持的数据库执行可审查的字段和索引变更
- **ER 关系图** — 可视化表间关联
- **Schema 对比** — 跨连接对比表结构差异
- **执行计划** — 可视化查询执行计划
- **字段血缘** — 字段级血缘分析
- **数据库搜索** — 在大型 Schema 中快速查找对象

### 数据操作

- **数据导入** — CSV、Excel
- **数据迁移** — 在数据库之间迁移数据
- **数据库导出** — 完整数据库导出
- **数据对比** — 对比表数据并审查同步结果
- **SQL 文件执行** — 直接执行 `.sql` 文件
- **文件预览** — 拖入 Parquet、CSV、JSON 即时预览（基于 DuckDB）
- **连接导入** — 从 DBeaver 或 Navicat 导入连接配置

### 专项浏览器

- **Redis** — 模式匹配搜索、批量键操作、命令执行器、TTL 编辑，全数据类型支持（String、Hash、List、Set、ZSet、Stream）
- **MongoDB** — 文档增删改查、分页浏览，支持 Atlas 和副本集 URL 直连

### 安全与连接

SSH 隧道（密钥和密码认证）· 数据库和 AI 代理设置 · 断线自动重连 · 危险操作确认对话框 · 加密导出/导入连接配置 · 连接颜色标记 · 驱动商店与可选 JDBC 插件

### 精致 UI

深色模式原生标题栏同步 · 9 种编辑器主题 · English、简体中文、Español · 布局偏好设置 · 内置自动更新

## AI 编程助手集成 (MCP)

DBX 提供 [MCP Server](packages/mcp-server/)，让 AI 编程助手直接使用 DBX 中已配置的数据库连接查询数据。

```bash
npx @dbx-app/mcp-server
```

在 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "dbx": { "command": "npx", "args": ["-y", "@dbx-app/mcp-server"] }
  }
}
```

支持 Claude Code、Cursor、Windsurf 等 MCP 兼容的 AI 助手。可列出连接、浏览表、执行 SQL，还能直接在 DBX 界面中打开表。

DBX 也提供独立 CLI 包，适合终端、脚本和 Codex 工作流：

```bash
npm install -g @dbx-app/cli
dbx connections list --json
dbx query local "select 1" --json
```

详见 [MCP Server 说明](packages/mcp-server/README.md) 和 [CLI 说明](packages/cli/README.md)。

## 安装

从 [QYue64/dbx Releases](https://github.com/QYue64/dbx/releases/latest) 页面下载最新桌面端安装包。

这个分支的安装包只通过 GitHub Releases 发布。Homebrew、Scoop、WinGet 和 Docker 镜像暂未作为当前分发渠道维护。

## 自托管 (Docker)

上游项目提供 Web Docker 镜像，但这个分支目前不发布 `QYue64/dbx` 镜像。当前分发优先使用 GitHub Releases 的桌面端安装包，也可以从本仓库自行构建 Web 镜像。

本地 Docker Compose 示例位于 `deploy/docker-compose.yml`：

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

浏览器访问 `http://localhost:4224`。

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) >= 1.77

#### 系统依赖

**macOS：**

无需额外安装。

**Linux (Ubuntu/Debian)：**

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev
```

**Windows：**

无需额外安装。

### 开发

```bash
make
```

`make` 会在需要时安装根目录依赖，并启动本地 Tauri 桌面端开发环境。

> [!TIP]
> DuckDB 从源码编译较慢。如果不涉及 DuckDB 功能，可以跳过以加速本地构建：
>
> ```bash
> # 快速检查（跳过 DuckDB）
> make cargo-check-fast
> make cargo-test-fast
>
> # Tauri 开发模式跳过 DuckDB
> make dev-fast
> ```
>
> `--no-default-features` 仅影响本地开发，发布构建（`pnpm tauri build`）始终包含 DuckDB。

Web 版本：

```bash
make dev-web       # 前端
make dev-backend   # 后端
```

文档站：

```bash
make docs
```

DBX 官网文档位于 `docs/` 目录。如果你想贡献官网内容或文档页面，请修改 `docs/` 下的文件，并运行 `make docs` 在本地预览文档站。

JDBC Agent 驱动开发工程位于 `agents/` 目录：

```bash
cd agents
./gradlew test
```

本地驱动安装流程会优先查找 `agents/drivers/<db-type>/build/libs/` 下的构建产物。

### 构建

```bash
make package
```

安装包输出在 `src-tauri/target/release/bundle/` 目录。

## 技术栈

| 层级   | 技术                                                                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 框架   | [Tauri 2](https://tauri.app/)                                                                                                                                                                                    |
| 前端   | [Vue 3](https://vuejs.org/) + TypeScript                                                                                                                                                                         |
| UI     | [shadcn-vue](https://www.shadcn-vue.com/) + Tailwind CSS                                                                                                                                                         |
| 编辑器 | [CodeMirror 6](https://codemirror.net/)                                                                                                                                                                          |
| 后端   | Rust + [sqlx](https://github.com/launchbadge/sqlx) / [tiberius](https://github.com/prisma/tiberius) / [redis-rs](https://github.com/redis-rs/redis-rs) / [mongodb](https://github.com/mongodb/mongo-rust-driver) |

## 项目来源

这个分支的源码、Release、Issue 和自动更新通道统一收口到 [QYue64/dbx](https://github.com/QYue64/dbx)。

## 常见问题

<details>
<summary><strong>DBX 是免费的吗？</strong></summary>
是的。DBX 基于 Apache-2.0 协议开源，所有功能均免费使用。
</details>

<details>
<summary><strong>DBX 会收集用户数据吗？</strong></summary>
不会。DBX 不收集任何遥测数据。自动更新功能仅检查 GitHub Releases 获取新版本——你可以在设置中禁用它。
</details>

<details>
<summary><strong>可以离线使用吗？</strong></summary>
可以。桌面端完全支持离线使用。内网环境安装驱动时，可先在有网机器准备驱动包，传输到内网机器后，在 DBX 的「设置 > 驱动管理」中导入。AI 功能需要网络访问模型端点（或通过 Ollama 使用本地模型）。
</details>

<details>
<summary><strong>DBX 和 DBeaver / TablePlus / Beekeeper Studio 有什么区别？</strong></summary>
DBX 仅 15 MB，无需运行时依赖（无需 Java、无需 Python）。AI 和 MCP 是原生内置功能，不是插件。单一代码库同时支持 60+ 数据库、桌面端、Docker 和 Web。
</details>

<details>
<summary><strong>支持哪些数据库？</strong></summary>
MySQL、PostgreSQL、SQLite、Redis、MongoDB、DuckDB、ClickHouse、SQL Server、Oracle、Elasticsearch、Qdrant、Milvus、Weaviate、MariaDB、TiDB、OceanBase、openGauss、GaussDB、KWDB、KingBase、Vastbase、GoldenDB、Doris、SelectDB、StarRocks、Manticore Search、Redshift、DM、TDengine、虚谷 XuguDB、CockroachDB、Access、HighGo 等。JDBC 方向配置可扩展到 H2、Snowflake、Trino、PrestoSQL、Hive、DB2、Informix、Neo4j、Cassandra、BigQuery、Kylin、SunDB、Databricks、SAP HANA、Teradata、Vertica、Firebird、Exasol、崖山 YashanDB、GBase 8a/8s、Databend、RQLite、Turso、InfluxDB、QuestDB、IoTDB、etcd、ZooKeeper、Nacos、IRIS 及自定义 JDBC 连接，并支持消息队列管理（Pulsar、Kafka、RocketMQ）。
</details>

<details>
<summary><strong>如何报告 Bug 或请求新功能？</strong></summary>
在 <a href="https://github.com/QYue64/dbx/issues">GitHub Issues</a> 提交 Issue。
</details>

## 贡献者

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

## 开源协议

[Apache-2.0](LICENSE)
