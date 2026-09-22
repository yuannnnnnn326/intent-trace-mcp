# Intent Trace MCP

一个**单用户、自托管**的行动追踪 MCP：把“我现在要去做什么”和这段时间的 iPhone App 使用记录关联起来。

它不是应用封锁器，也不会读取你的屏幕内容。它做的事情很简单：

> 你告诉 AI：“我去做饭了。”  
> AI 记录行动起点。  
> 你回来以后，AI 可以查看这段时间监控到的 App 使用记录，帮助你看见自己时间到底去了哪里。

## 为什么做这个？

普通屏幕使用时间会告诉你：

> 今天抖音用了 2 小时。

这个项目更关心的是：

> **你说“我要去做饭”之后，到真正回来之前，手机都去了哪里？**

它把“行动意图”和“手机使用轨迹”放在同一个时间区间里，适合作为轻量的拖延觉察工具。

## 特点

- 单用户、自托管
- Cloudflare Workers + D1
- iOS 快捷指令自动记录选定 App 的打开/关闭时间
- 不上传截图、不读取屏幕内容
- MCP 工具记录行动起点并查询期间 App 使用情况
- 数据保存在你自己的 Cloudflare 账户
- 不需要常开电脑

## MCP 工具

| 工具 | 作用 |
| --- | --- |
| `start_intent` | 记录“我现在要去做某件事”的行动起点 |
| `check_pending_intent` | 查看尚未结算行动开始后的 App 使用情况 |
| `resolve_intent` | 完成或取消上一条行动 |
| `get_today_usage` | 查看今天各监控 App 的累计使用时长 |

## 架构

```text
iPhone 快捷指令
  │  App open / close
  ▼
Cloudflare Worker
  │
  ├── /api/app-event  ← DEVICE_KEY Bearer
  │
  ├── D1
  │    ├── app_events
  │    ├── intents
  │    ├── intent_results
  │    └── device_state
  │
  └── /mcp/<MCP_KEY>
          ▲
          │
       ChatGPT
```

## 快速开始

### 1. 部署 Cloudflare

按照：

[docs/cloudflare-setup.md](docs/cloudflare-setup.md)

### 2. 配置 iPhone 自动化

按照：

[docs/ios-shortcuts.md](docs/ios-shortcuts.md)

### 3. 接入 ChatGPT

按照：

[docs/chatgpt-plugin.md](docs/chatgpt-plugin.md)

## 典型使用

```text
你：我去晾衣服了。
AI：记录行动起点。

（8 分钟后）

你：我洗完了。
AI：查看这 8 分钟的 App 使用记录，并结合上下文回应。
```

例如可能得到：

```text
行动：去晾衣服
经过：8 分钟
期间监控到的手机使用：0 分钟
```

或者：

```text
行动：去做饭
经过：42 分钟
抖音：31 分钟
微信：4 分钟
ChatGPT：2 分钟
```

## 隐私设计

这个项目只存：

- App 名称
- App 打开/关闭时间
- 你主动告诉 AI 的行动文本
- 行动开始/结束时间

默认**不存**：

- 屏幕截图
- App 内具体内容
- 通知正文
- 键盘输入
- 浏览历史正文
- 微信聊天内容

所有数据都进入你自己的 Cloudflare D1。

## 安全说明

### DEVICE_KEY

`/api/app-event` 使用：

```text
Authorization: Bearer <DEVICE_KEY>
```

### MCP_KEY

个人 MCP 使用：

```text
/mcp/<MCP_KEY>
```

因此完整 MCP URL 本身是 Secret。

**不要把真实 `DEVICE_KEY`、`MCP_KEY`、自己的 Worker 私密地址提交到 GitHub。**

如果怀疑泄露，直接在 Cloudflare 中轮换 Secret。

## 已知限制

- iOS 需要手动选择要监控的 App，并配置两条自动化。
- 这个项目不会主动把你从 App 里踢出去，也不会强制锁机。
- ChatGPT 是否会在同一对话里自动继续使用 MCP，取决于当前客户端/账号能力。
- App 使用记录只能说明手机使用情况，不能证明现实任务一定完成或失败。
- v0.1.0 的“今天”使用固定 UTC 偏移计算，不处理夏令时。

## 适合谁？

如果你只想知道：

> “我明明说要去做事，为什么半小时以后还没开始？”

这个项目可能有点用。

如果你需要的是严格屏蔽 App、强制专注或家长控制，这不是它的目标。

## 文件结构

```text
intent-trace-mcp/
├── README.md
├── worker.js
├── schema.sql
├── LICENSE
├── .gitignore
├── migrations/
│   └── 001_add_device_state.sql
└── docs/
    ├── cloudflare-setup.md
    ├── ios-shortcuts.md
    └── chatgpt-plugin.md
```

## License

MIT
