# iPhone 快捷指令配置

这个项目不读取屏幕内容，只记录你选择监控的 App 的打开/关闭时间。

你需要创建两条 iOS 自动化：

1. **所选 App 已打开**
2. **所选 App 已关闭**

同一条自动化里可以一次选择多个 App。

## 先准备

你的事件上报地址：

```text
https://YOUR-WORKER.workers.dev/api/app-event
```

你的 `DEVICE_KEY` 只保存在你自己的快捷指令里，不要提交到 GitHub。

---

## 自动化 A：App 已打开

在「快捷指令 → 自动化」中新建 App 自动化：

- 选择想监控的 App
- 条件：**已打开**
- 设置为自动运行

添加动作：**获取 URL 内容**。

### URL

```text
https://YOUR-WORKER.workers.dev/api/app-event
```

### 方法

```text
POST
```

### Header

Key：

```text
Authorization
```

Value：

```text
Bearer YOUR_DEVICE_KEY
```

注意 `Bearer` 后面有一个空格。

### 请求体

选择 JSON：

```text
app_name    [触发自动化的 App → 名称]
event_type  open
```

其中 `app_name` 不要写死，应使用快捷指令里的蓝色 `App` 魔法变量，并把属性设为「名称」。

---

## 自动化 B：App 已关闭

再创建一条几乎一样的自动化：

- 选择同一批 App
- 条件：**已关闭**

请求体改为：

```text
app_name    [触发自动化的 App → 名称]
event_type  close
```

其他配置保持一致。

---

## 测试

打开某个已监控 App，停留几秒，再切换到另一个已监控 App。

在 D1 Console 运行：

```sql
SELECT
  id,
  app_name,
  event_type,
  datetime(event_time, 'unixepoch', '+8 hours') AS time_cn
FROM app_events
ORDER BY id DESC
LIMIT 20;
```

你应该能看到类似：

```text
抖音      open
抖音      close
ChatGPT   open
```

如果你不是 UTC+8，请把 SQL 里的 `+8 hours` 改成适合你的偏移；这只影响测试显示，不影响实际存储。
