# Cloudflare 部署

这份教程使用 Cloudflare Workers + D1，适合单用户自托管。

## 1. 创建 D1 数据库

在 Cloudflare 控制台创建一个 D1 数据库，例如：

```text
intent-trace-db
```

进入数据库的 **Console**，运行仓库根目录的 `schema.sql`。

## 2. 创建 Worker

创建一个普通 Worker，例如：

```text
intent-trace
```

把仓库根目录 `worker.js` 的内容复制到 Worker 编辑器并部署。

## 3. 绑定 D1

进入 Worker：

**Settings → Bindings → Add binding → D1 database**

变量名必须是：

```text
DB
```

选择刚才创建的 D1 数据库。

## 4. 添加 Secrets

进入：

**Settings → Variables and Secrets**

创建两个 Secret：

```text
DEVICE_KEY
MCP_KEY
```

两者应该不同，并使用足够长的随机字符串。

Windows PowerShell 可以运行两次：

```powershell
([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
```

不要把真实 Secret 提交到 GitHub，也不要截图公开。

## 5. 可选时区变量

默认按中国标准时间显示：

```text
TZ_NAME = Asia/Shanghai
TZ_OFFSET_SECONDS = 28800
```

如果你不在 UTC+8，可自行设置。

> `TZ_OFFSET_SECONDS` 是固定偏移，不自动处理夏令时。v0.1.0 主要面向简单个人使用。

## 6. 检查服务

浏览器打开：

```text
https://YOUR-WORKER.workers.dev/health
```

正常会返回：

```json
{
  "ok": true,
  "service": "intent-trace-mcp"
}
```

## 已有旧版本数据库？

如果你之前已经创建了 `app_events` / `intents` / `intent_results`，但没有 `device_state`，只运行：

```text
migrations/001_add_device_state.sql
```

即可。
