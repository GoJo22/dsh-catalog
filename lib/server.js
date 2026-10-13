// server.js — 面板数据服务（Node 版，无第三方依赖）
//
// 只提供 JSON API，页面 UI 完全由 client.js 的 React 组件在 DSH 侧边栏内渲染：
//   GET  /api/mode      返回 {"mode":"serve"}，供前端探测服务是否在跑
//   GET  /api/catalog   实时重新构建目录并返回 JSON（不落盘）
//   GET  /api/refresh   重新扫描并写盘（assets/command-catalog.json，运行时产物，已 gitignore），返回最新 JSON
//   GET  /api/custom?collection=X   读取已保存的自定义分类（同时回传可编辑文本）
//   POST /api/custom    保存自定义分类（body: {text|rules, collection, strict, mode}）
//   POST /api/custom/reset          清空全部自定义分类
//   GET  /api/notes?collection=X    读取已保存的命令说明（回传 Markdown 表格文本）
//   POST /api/notes     保存命令说明（body: {text|notes, collection, mode}）
//   POST /api/notes/reset           清空全部命令说明
//
// 自定义分类保存在 ~/.dsh-catalog/categories.json（与插件安装目录分离），
// 每次 buildCatalog() 都会重新读取应用，所以刷新/重进都不丢。
//
// 作为 DSH 插件的一部分，在 apply() 时启动，dispose() 时关闭。
// 只监听 127.0.0.1 回环地址，不对外暴露。

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, writeCatalog } from "./scan.js";
import {
  loadCustom,
  saveCustom,
  clearCustom,
  parseCategoryText,
  serializeRules,
  mergeRules,
  storePath,
} from "./customCategories.js";
import {
  loadNotes,
  saveNotes,
  clearNotes,
  parseNotesText,
  serializeNotes,
  mergeNotes,
  notesPath,
} from "./customNotes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, "..", "assets", "command-catalog.json");
const DEFAULT_PORT = 8765;
const MAX_BODY = 4 * 1024 * 1024; // 4MB：粘贴一整份分类表足够，同时防异常大包

function send(res, payload, contentType, code = 200) {
  let data;
  // Buffer/字符串原样返回；纯对象才 JSON 序列化
  // （Buffer 的 typeof 是 "object"，不先判会把文件内容序列化成 {"type":"Buffer",...}）
  if (Buffer.isBuffer(payload) || typeof payload === "string") {
    data = payload;
  } else {
    data = JSON.stringify(payload);
    contentType = "application/json; charset=utf-8";
  }
  res.writeHead(code, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * 解析结果对照当前目录做体检：哪些命令真的命中了，哪些在当前目录里找不到。
 * 找不到的不报错（插件可能还没装/临时卸载），只在回执里提示。
 */
function statsFor(rules, catalog) {
  const all = new Set();
  const byColl = new Map();
  for (const c of catalog.commands) {
    all.add(c.name);
    if (!byColl.has(c.collection)) byColl.set(c.collection, new Set());
    byColl.get(c.collection).add(c.name);
  }
  let total = 0;
  let matched = 0;
  const unknown = [];
  for (const r of rules) {
    for (const n of r.commands) {
      total++;
      const pool = r.collection ? byColl.get(r.collection) || new Set() : all;
      if (pool.has(n)) matched++;
      else if (unknown.length < 15) unknown.push((r.collection ? r.collection + " › " : "") + "/" + n);
    }
  }
  return { total, matched, unknown };
}

export function createServer(port = DEFAULT_PORT) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const p = url.pathname;
    const method = (req.method || "GET").toUpperCase();
    try {
      // ---------------- 自定义分类：读 ----------------
      if (p === "/api/custom" && method === "GET") {
        const coll = url.searchParams.get("collection") || "";
        const custom = loadCustom();
        send(res, {
          custom,
          text: serializeRules(custom.rules, coll),
          path: storePath(),
        });
        return;
      }
      // ---------------- 自定义分类：写 ----------------
      if (p === "/api/custom" && method === "POST") {
        readBody(req)
          .then((raw) => {
            let body = {};
            try {
              body = raw ? JSON.parse(raw) : {};
            } catch (e) {
              send(res, { ok: false, error: "请求体不是合法 JSON" }, "application/json", 400);
              return null;
            }
            const coll = body.collection ? String(body.collection) : "";
            let parsed;
            if (body.text != null) {
              parsed = parseCategoryText(body.text, coll);
            } else if (Array.isArray(body.rules)) {
              parsed = { rules: body.rules, warnings: [], stats: { categories: body.rules.length } };
            } else {
              send(res, { ok: false, error: "缺少 text 或 rules" }, "application/json", 400);
              return null;
            }
            const merged = mergeRules(
              loadCustom(),
              parsed.rules,
              coll,
              !!body.strict,
              body.mode === "merge" ? "merge" : "replace"
            );
            const saved = saveCustom(merged);
            // 用保存后的完整规则集做体检（不只是本次粘贴的部分）
            const stats = statsFor(saved.rules, buildCatalog());
            send(res, {
              ok: true,
              custom: saved,
              stats,
              parsed: parsed.stats,
              warnings: parsed.warnings.slice(0, 10),
              path: storePath(),
            });
            return null;
          })
          .catch((e) => send(res, { ok: false, error: String(e && e.message ? e.message : e) }, "application/json", 500));
        return;
      }
      // ---------------- 自定义分类：清空 ----------------
      if (p === "/api/custom/reset" && method === "POST") {
        send(res, { ok: true, custom: clearCustom() });
        return;
      }
      // ---------------- 命令说明：读 ----------------
      if (p === "/api/notes" && method === "GET") {
        const coll = url.searchParams.get("collection") || "";
        const notes = loadNotes();
        send(res, {
          notes: notes,
          text: serializeNotes(notes.notes, coll),
          path: notesPath(),
        });
        return;
      }
      // ---------------- 命令说明：写 ----------------
      if (p === "/api/notes" && method === "POST") {
        readBody(req)
          .then((raw) => {
            let body = {};
            try {
              body = raw ? JSON.parse(raw) : {};
            } catch (e) {
              send(res, { ok: false, error: "请求体不是合法 JSON" }, "application/json", 400);
              return null;
            }
            const coll = body.collection ? String(body.collection) : "";
            let parsed;
            if (body.text != null) {
              parsed = parseNotesText(body.text, coll);
            } else if (Array.isArray(body.notes)) {
              parsed = {
                notes: body.notes,
                warnings: [],
                stats: { notes: body.notes.length },
              };
            } else {
              send(res, { ok: false, error: "缺少 text 或 notes" }, "application/json", 400);
              return null;
            }
            const saved = saveNotes(
              mergeNotes(loadNotes(), parsed.notes, coll, body.mode === "merge" ? "merge" : "replace")
            );
            // 体检：保存后的全部说明里，有多少条在当前目录命中了命令
            const catalog = buildCatalog();
            const known = new Set();
            const knownByColl = new Map();
            for (const c of catalog.commands) {
              known.add(c.name);
              if (!knownByColl.has(c.collection)) knownByColl.set(c.collection, new Set());
              knownByColl.get(c.collection).add(c.name);
            }
            let matched = 0;
            const unknown = [];
            for (const n of saved.notes) {
              const pool = n.collection ? knownByColl.get(n.collection) || new Set() : known;
              if (pool.has(n.command)) matched++;
              else if (unknown.length < 15) {
                unknown.push((n.collection ? n.collection + " › " : "") + "/" + n.command);
              }
            }
            send(res, {
              ok: true,
              notes: saved,
              stats: { total: saved.notes.length, matched: matched, unknown: unknown },
              parsed: parsed.stats,
              warnings: parsed.warnings.slice(0, 10),
              path: notesPath(),
            });
            return null;
          })
          .catch((e) =>
            send(res, { ok: false, error: String(e && e.message ? e.message : e) }, "application/json", 500)
          );
        return;
      }
      // ---------------- 命令说明：清空 ----------------
      if (p === "/api/notes/reset" && method === "POST") {
        send(res, { ok: true, notes: clearNotes() });
        return;
      }
      if (p === "/api/mode") {
        send(res, { mode: "serve" });
      } else if (p === "/api/catalog") {
        send(
          res,
          url.searchParams.get("refresh") === "1" ? writeCatalog(JSON_PATH) : buildCatalog()
        );
      } else if (p === "/api/refresh") {
        send(res, writeCatalog(JSON_PATH));
      } else {
        send(res, "Not Found", "text/plain", 404);
      }
    } catch (e) {
      send(res, { error: String(e) }, "application/json", 500);
    }
  });

  server.on("clientError", (err, socket) => socket.destroy());

  return {
    start() {
      return new Promise((resolve, reject) => {
        server.listen(port, "127.0.0.1", () => {
          const addr = server.address();
          resolve(`http://127.0.0.1:${addr.port}`);
        });
        server.once("error", reject);
      });
    },
    stop() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
    port,
  };
}
