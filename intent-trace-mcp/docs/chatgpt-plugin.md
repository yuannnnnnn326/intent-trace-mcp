# 接入 ChatGPT 自定义 MCP 插件

> ChatGPT 不同客户端、账号和灰度版本对 developer MCP 的支持可能不同。本文只描述项目需要的连接信息，不保证每个界面都有完全一致的按钮名称。

## MCP 地址

本项目使用“不可猜的路径 Secret”保护个人 MCP：

```text
https://YOUR-WORKER.workers.dev/mcp/YOUR_MCP_KEY
```

完整 URL 本身等同于密码，不要截图公开。

## 身份验证

如果你的 ChatGPT 自定义插件创建界面只有：

- OAuth
- 无身份验证
- 混合

请选择：

```text
无身份验证
```

因为这里已经用随机 `MCP_KEY` 作为 URL 路径 Secret。

这适合**个人自托管**，不适合多人公用服务。

## 正常应扫描到的工具

```text
start_intent
check_pending_intent
resolve_intent
get_today_usage
```

## 推荐用法

这个项目最适合放在一个专门的“行动追踪”聊天窗口里。

例如：

```text
我去洗衣服了
```

AI 调用 `start_intent`。

回来后：

```text
我回来了
```

AI 调用 `check_pending_intent`，即可看到这段时间监控到的 App 使用情况。

之后可调用 `resolve_intent` 结算。

## 重要限制

- MCP 能否在后续消息中自动继续调用，取决于 ChatGPT 当前客户端和插件行为。
- 不应把“没有刷手机”自动解释成“任务一定完成”。
- 不应把“刷了某 App”自动解释成“任务一定失败”。
- 本项目是观察工具，不是强制专注工具。
