const DEFAULT_TZ_OFFSET_SECONDS = 8 * 60 * 60;
const DEFAULT_TZ_NAME = "Asia/Shanghai";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function getTimezoneName(env) {
  return env.TZ_NAME || DEFAULT_TZ_NAME;
}

function getTimezoneOffsetSeconds(env) {
  const raw = Number(env.TZ_OFFSET_SECONDS);
  return Number.isFinite(raw) ? raw : DEFAULT_TZ_OFFSET_SECONDS;
}

function formatTime(ts, env) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: getTimezoneName(env),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(ts * 1000));
  } catch {
    return new Date(ts * 1000).toISOString();
  }
}

function formatDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}小时${m}分钟`;
  if (m > 0) return `${m}分钟${s > 0 ? `${s}秒` : ""}`;
  return `${s}秒`;
}

function getBearer(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}

async function getPendingIntent(env) {
  return await env.DB.prepare(`
    SELECT *
    FROM intents
    WHERE status = 'pending'
    ORDER BY started_at DESC
    LIMIT 1
  `).first();
}

async function getDeviceState(env) {
  let state = await env.DB.prepare(`
    SELECT id, active_app, active_since
    FROM device_state
    WHERE id = 1
  `).first();

  if (!state) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO device_state (id, active_app, active_since)
      VALUES (1, NULL, NULL)
    `).run();

    state = { id: 1, active_app: null, active_since: null };
  }

  return state;
}

async function setDeviceState(env, appName, activeSince = null) {
  await env.DB.prepare(`
    UPDATE device_state
    SET active_app = ?, active_since = ?, updated_at = unixepoch()
    WHERE id = 1
  `)
    .bind(appName || null, activeSince)
    .run();
}

async function calculateUsage(env, start, end) {
  const result = await env.DB.prepare(`
    SELECT id, app_name, event_type, event_time
    FROM app_events
    WHERE event_time >= ? AND event_time <= ?
    ORDER BY event_time ASC, id ASC
  `)
    .bind(start, end)
    .all();

  const events = result.results || [];
  const totals = {};
  let activeApp = null;
  let activeStart = null;

  function add(app, from, to) {
    if (!app || from == null || to <= from) return;
    totals[app] = (totals[app] || 0) + (to - from);
  }

  for (const event of events) {
    const app = event.app_name;
    const time = Number(event.event_time);

    if (event.event_type === "open") {
      if (activeApp) add(activeApp, activeStart, time);
      activeApp = app;
      activeStart = time;
      continue;
    }

    if (event.event_type === "close") {
      if (activeApp === app) {
        add(activeApp, activeStart, time);
        activeApp = null;
        activeStart = null;
      } else if (!activeApp) {
        // The app may already have been open before the requested interval began.
        add(app, start, time);
      }
    }
  }

  if (activeApp) add(activeApp, activeStart, end);

  return Object.entries(totals)
    .map(([app_name, seconds]) => ({
      app_name,
      seconds,
      duration: formatDuration(seconds),
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

async function startIntent(env, intentText) {
  const existing = await getPendingIntent(env);

  if (existing) {
    return {
      ok: false,
      reason: "pending_intent_exists",
      message: "已经有一个尚未结算的行动，请先检查并处理它。",
      pending_intent: {
        id: existing.id,
        text: existing.intent_text,
        started_at: existing.started_at,
        started_at_text: formatTime(existing.started_at, env),
      },
    };
  }

  const startedAt = nowSec();
  const result = await env.DB.prepare(`
    INSERT INTO intents (intent_text, started_at, status)
    VALUES (?, ?, 'pending')
  `)
    .bind(intentText, startedAt)
    .run();

  return {
    ok: true,
    intent_id: result.meta?.last_row_id,
    intent_text: intentText,
    started_at: startedAt,
    started_at_text: formatTime(startedAt, env),
    message: `已记录行动：“${intentText}”`,
  };
}

async function checkPendingIntent(env) {
  const intent = await getPendingIntent(env);

  if (!intent) {
    return {
      ok: true,
      has_pending: false,
      message: "目前没有尚未结算的行动。",
    };
  }

  const end = nowSec();
  const usage = await calculateUsage(env, Number(intent.started_at), end);
  const totalSeconds = usage.reduce((sum, item) => sum + item.seconds, 0);

  return {
    ok: true,
    has_pending: true,
    intent: {
      id: intent.id,
      text: intent.intent_text,
      started_at: intent.started_at,
      started_at_text: formatTime(intent.started_at, env),
    },
    checked_at: end,
    checked_at_text: formatTime(end, env),
    elapsed: formatDuration(end - Number(intent.started_at)),
    tracked_phone_time: formatDuration(totalSeconds),
    app_usage: usage,
  };
}

async function resolveIntent(env, args = {}) {
  let intent;

  if (args.intent_id) {
    intent = await env.DB.prepare(`
      SELECT *
      FROM intents
      WHERE id = ? AND status = 'pending'
      LIMIT 1
    `)
      .bind(args.intent_id)
      .first();
  } else {
    intent = await getPendingIntent(env);
  }

  if (!intent) {
    return { ok: false, message: "没有找到需要结算的行动。" };
  }

  const status = args.status === "cancelled" ? "cancelled" : "resolved";
  const resolvedAt = nowSec();
  const usage = await calculateUsage(env, Number(intent.started_at), resolvedAt);

  await env.DB.prepare(`
    UPDATE intents
    SET status = ?, resolved_at = ?
    WHERE id = ?
  `)
    .bind(status, resolvedAt, intent.id)
    .run();

  const summary = JSON.stringify({
    intent_text: intent.intent_text,
    status,
    note: args.note || "",
    app_usage: usage,
  });

  await env.DB.prepare(`
    INSERT INTO intent_results (intent_id, summary)
    VALUES (?, ?)
  `)
    .bind(intent.id, summary)
    .run();

  return {
    ok: true,
    intent_id: intent.id,
    intent_text: intent.intent_text,
    status,
    resolved_at: resolvedAt,
    resolved_at_text: formatTime(resolvedAt, env),
    app_usage: usage,
  };
}

async function getTodayUsage(env) {
  const now = nowSec();
  const offset = getTimezoneOffsetSeconds(env);
  const start = Math.floor((now + offset) / 86400) * 86400 - offset;
  const usage = await calculateUsage(env, start, now);

  return {
    ok: true,
    start,
    start_text: formatTime(start, env),
    end: now,
    end_text: formatTime(now, env),
    app_usage: usage,
  };
}

function toolDefinitions() {
  return [
    {
      name: "start_intent",
      description:
        "记录用户现在或接下来立即要执行的现实行动。行动类型不限，直接保存自然语言，例如‘我去洗衣服了’‘我现在做饭’‘我去背书了’。不要对明天、以后、假设或犹豫中的计划调用。",
      inputSchema: {
        type: "object",
        properties: {
          intent_text: {
            type: "string",
            description: "用户即将立即执行的行动，自由文本。",
          },
        },
        required: ["intent_text"],
      },
    },
    {
      name: "check_pending_intent",
      description:
        "检查尚未结算的行动，并返回该行动开始后记录到的各 App 使用时间。适合用户回来聊天时复盘这段时间去了哪里。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "resolve_intent",
      description:
        "结束上一条行动。用户完成时使用 resolved；明确放弃时使用 cancelled。不要仅凭手机使用情况臆测完成状态。",
      inputSchema: {
        type: "object",
        properties: {
          intent_id: {
            type: "integer",
            description: "可选。省略时自动处理最近一条 pending 行动。",
          },
          status: {
            type: "string",
            enum: ["resolved", "cancelled"],
          },
          note: {
            type: "string",
            description: "可选备注。",
          },
        },
      },
    },
    {
      name: "get_today_usage",
      description: "读取今天各个已监控 App 的累计使用时间。",
      inputSchema: { type: "object", properties: {} },
    },
  ];
}

async function callTool(env, name, args) {
  switch (name) {
    case "start_intent":
      if (!args?.intent_text?.trim()) throw new Error("intent_text 不能为空");
      return await startIntent(env, args.intent_text.trim());
    case "check_pending_intent":
      return await checkPendingIntent(env);
    case "resolve_intent":
      return await resolveIntent(env, args || {});
    case "get_today_usage":
      return await getTodayUsage(env);
    default:
      throw new Error(`未知工具：${name}`);
  }
}

async function handleMcp(request, env) {
  if (request.method === "GET") {
    return json({
      name: "intent-trace-mcp",
      status: "ok",
      message: "MCP endpoint is running.",
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  }

  const id = body.id ?? null;
  const method = body.method;

  if (method === "initialize") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: body.params?.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "intent-trace-mcp", version: "0.1.0" },
        instructions:
          "Use this server to record immediate real-world actions and review phone app usage during the interval. Do not shame the user. Treat usage data as context, not as proof that a task was completed or abandoned.",
      },
    });
  }

  if (method === "notifications/initialized") {
    return new Response(null, { status: 204 });
  }

  if (method === "ping") {
    return json({ jsonrpc: "2.0", id, result: {} });
  }

  if (method === "tools/list") {
    return json({
      jsonrpc: "2.0",
      id,
      result: { tools: toolDefinitions() },
    });
  }

  if (method === "tools/call") {
    try {
      const result = await callTool(
        env,
        body.params?.name,
        body.params?.arguments || {}
      );

      return json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
          isError: false,
        },
      });
    } catch (error) {
      return json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "错误：" + (error?.message || String(error)),
            },
          ],
          isError: true,
        },
      });
    }
  }

  return json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found" },
  });
}

async function handleAppEvent(request, env) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!env.DEVICE_KEY) {
    return json({ error: "DEVICE_KEY 尚未配置" }, 500);
  }

  if (getBearer(request) !== env.DEVICE_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求内容不是合法 JSON" }, 400);
  }

  const appName = String(body.app_name || "").trim();
  const eventType = String(body.event_type || "").trim();
  const eventTime = nowSec();

  if (!appName) return json({ error: "app_name 不能为空" }, 400);
  if (eventType !== "open" && eventType !== "close") {
    return json({ error: "event_type 必须是 open 或 close" }, 400);
  }

  const state = await getDeviceState(env);

  if (eventType === "open") {
    if (state.active_app === appName) {
      return json({
        ok: true,
        ignored: true,
        reason: "already_active",
        app_name: appName,
      });
    }

    if (state.active_app) {
      await env.DB.prepare(`
        INSERT INTO app_events (app_name, event_type, event_time)
        VALUES (?, 'close', ?)
      `)
        .bind(state.active_app, eventTime)
        .run();
    }

    await env.DB.prepare(`
      INSERT INTO app_events (app_name, event_type, event_time)
      VALUES (?, 'open', ?)
    `)
      .bind(appName, eventTime)
      .run();

    await setDeviceState(env, appName, eventTime);

    return json({
      ok: true,
      action: "opened",
      app_name: appName,
      event_time: eventTime,
      event_time_text: formatTime(eventTime, env),
    });
  }

  // Ignore stale close events when a different app is already active.
  if (state.active_app !== appName) {
    return json({
      ok: true,
      ignored: true,
      reason: "stale_close",
      app_name: appName,
      active_app: state.active_app || null,
    });
  }

  await env.DB.prepare(`
    INSERT INTO app_events (app_name, event_type, event_time)
    VALUES (?, 'close', ?)
  `)
    .bind(appName, eventTime)
    .run();

  await setDeviceState(env, null, null);

  return json({
    ok: true,
    action: "closed",
    app_name: appName,
    event_time: eventTime,
    event_time_text: formatTime(eventTime, env),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "intent-trace-mcp",
        time: formatTime(nowSec(), env),
      });
    }

    if (url.pathname === "/api/app-event") {
      return await handleAppEvent(request, env);
    }

    if (env.MCP_KEY && url.pathname === `/mcp/${env.MCP_KEY}`) {
      return await handleMcp(request, env);
    }

    return json(
      {
        ok: true,
        service: "intent-trace-mcp",
        endpoints: [
          "/health",
          "/api/app-event",
          "/mcp/<MCP_KEY>",
        ],
      },
      200
    );
  },
};
