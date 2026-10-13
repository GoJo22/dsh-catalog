// customNotes.js — 用户自定义「命令说明」：持久化 + 粘贴解析 + 右键信息卡展示
//
// 用途：在命令卡片上点右键时，弹出的信息卡显示用户自己写的说明，
// 便于回忆这个命令是做什么的。与 customCategories.js 一样的三条硬约束：
// 刷新不丢、其它插件增删不影响、与插件安装目录解耦。
//
// 输入格式：直接粘贴 Markdown 表格（技能清单里最常见的形态）：
//     | **ask-matt** | 技能路由器。不确定该用哪个技能/流程时问它。 |
//     | **code-review** | 双轴代码审查：对照仓库编码规范 + 对照需求 spec。 |
// 也兼容无管道的 `name: 说明` 与 `name   说明`（两个以上空格分隔）。
//
// 存储：~/.dsh-catalog/notes.json
//   { version, updated_at, notes: [ { collection, command, note } ] }
//   collection 为空串 = 全局（按命令名匹配，不限集合）。
// 展示：右键信息卡优先显示 note；note 存在时，技能自带的 description 作为
//       「原始描述」附注在下方，不丢失信息。

import fs from "node:fs";
import path from "node:path";
import { normalizeCommandName } from "./customCategories.js";
import { STORE_DIR, migrateLegacy } from "./store.js";

const STORE_PATH = path.join(STORE_DIR, "notes.json");
const VERSION = 1;

export function notesPath() {
  return STORE_PATH;
}

function emptyDoc() {
  return { version: VERSION, updated_at: null, notes: [] };
}

// 表头行的常见用词（粘贴整张表时第一行会被识别成表头，直接跳过）
const HEADER_WORDS = new Set([
  "command", "commands", "cmd", "skill", "skills", "name", "names", "slug",
  "命令", "技能", "名称", "命令名", "说明", "简介", "描述", "描述文本",
  "desc", "description", "summary", "what", "用途", "作用", "功能",
]);

/** 去掉 Markdown 强调符与反引号（用于表格第一格的命令名）。 */
function stripEmphasis(s) {
  return String(s == null ? "" : s).replace(/[`*_]/g, "").trim();
}

/** `|---|---|` 这类表头分隔行。 */
function isSeparatorRow(line) {
  return /^\|?[\s:|-]*-[\s:|-]*\|?$/.test(line) && line.replace(/[\s:|-]/g, "") === "";
}

/** 拆表格单元格：去掉行首尾的管道产生的空串。 */
function splitCells(line) {
  const cells = line.split("|").map((s) => s.trim());
  if (cells.length && cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

// --------------------------------------------------------------------------
// 规约归一化（读盘、写盘、外部传入统一走这里）
// --------------------------------------------------------------------------
function normalizeDoc(doc) {
  const out = emptyDoc();
  if (!doc || typeof doc !== "object") return out;
  if (typeof doc.updated_at === "string") out.updated_at = doc.updated_at;

  const map = new Map(); // collection \0 command -> note
  const list = Array.isArray(doc.notes) ? doc.notes : [];
  for (const n of list) {
    if (!n || typeof n !== "object") continue;
    const command = normalizeCommandName(n.command);
    const note = String(n.note == null ? "" : n.note).trim();
    if (!command || !note) continue;
    map.set((n.collection ? String(n.collection).trim() : "") + "\u0000" + command, {
      collection: n.collection ? String(n.collection).trim() : "",
      command,
      note,
    });
  }
  out.notes = Array.from(map.values());
  return out;
}

// --------------------------------------------------------------------------
// 读写（与分类同一套策略：原子写、损坏自动备份、失败不阻塞扫描）
// --------------------------------------------------------------------------
export function loadNotes() {
  let doc;
  migrateLegacy("notes.json");
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyDoc();
    doc = normalizeDoc(JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")));
  } catch (e) {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const bak = STORE_PATH.replace(/\.json$/i, "") + ".corrupt-" + Date.now() + ".json";
        fs.copyFileSync(STORE_PATH, bak);
      }
    } catch {
      /* 备份失败不影响主流程 */
    }
    doc = emptyDoc();
    doc.error = String(e && e.message ? e.message : e);
  }
  return doc;
}

export function saveNotes(doc) {
  const normalized = normalizeDoc(doc);
  normalized.updated_at = new Date().toISOString().replace(/\.\d+Z$/, "");
  fs.mkdirSync(STORE_DIR, { recursive: true });
  const tmp = STORE_PATH + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), "utf-8");
  try {
    if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
  } catch {
    /* 目标不存在时忽略 */
  }
  fs.renameSync(tmp, STORE_PATH);
  return normalized;
}

export function clearNotes() {
  return saveNotes(emptyDoc());
}

// --------------------------------------------------------------------------
// 粘贴解析
// --------------------------------------------------------------------------
export function parseNotesText(text, collection) {
  const coll = collection ? String(collection).trim() : "";
  const notes = [];
  const warnings = [];
  let headerSkipped = false;

  const lines = String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n");
  lines.forEach((rawLine, i) => {
    let line = rawLine.trim();
    if (!line) return;
    line = line.replace(/^\s*([-*+]|\d+[.)])\s+/, "").replace(/^\s*#+\s*/, "");
    if (!line || isSeparatorRow(line)) return;

    let name = "";
    let note = "";
    if (line.includes("|")) {
      const cells = splitCells(line);
      if (cells.length < 2) {
        warnings.push(`第 ${i + 1} 行：只有一列，已跳过`);
        return;
      }
      name = normalizeCommandName(stripEmphasis(cells[0]));
      // 说明里可能还有管道（如 `A | B`），原样拼回去
      note = cells.slice(1).join(" | ").trim();
    } else {
      const m = line.match(/^\s*(\/?[A-Za-z0-9][A-Za-z0-9._-]*)\s*[:：]\s*(.+)$/);
      const m2 = line.match(/^\s*(\/?[A-Za-z0-9][A-Za-z0-9._-]*)\s{2,}(.+)$/);
      if (m) {
        name = normalizeCommandName(m[1]);
        note = m[2].trim();
      } else if (m2) {
        name = normalizeCommandName(m2[1]);
        note = m2[2].trim();
      }
    }

    if (!name) {
      // 解析不出命令名：多半是表头行（Skill | 说明），跳过一次即可
      if (!headerSkipped) {
        headerSkipped = true;
        return;
      }
      warnings.push(`第 ${i + 1} 行：解析不出命令名，已跳过`);
      return;
    }
    if (HEADER_WORDS.has(name.toLowerCase()) || HEADER_WORDS.has(name)) return;
    if (!note) {
      warnings.push(`第 ${i + 1} 行：${name} 没有说明内容，已跳过`);
      return;
    }
    notes.push({ collection: coll, command: name, note });
  });

  // 同一 (集合, 命令) 后出现者覆盖前者，并保持出现顺序
  const map = new Map();
  for (const n of notes) map.set(n.collection + "\u0000" + n.command, n);

  return {
    notes: Array.from(map.values()),
    warnings,
    stats: { notes: map.size, lines: lines.length },
  };
}

/** 反向序列化成 Markdown 表格，回填编辑器后可直接再编辑。 */
export function serializeNotes(notes, collection) {
  const coll = collection ? String(collection).trim() : "";
  const pick = (Array.isArray(notes) ? notes : []).filter((n) => (n.collection || "") === coll);
  if (!pick.length) return "";
  return (
    pick.map((n) => "| **" + n.command + "** | " + n.note + " |").join("\n") + "\n"
  );
}

// --------------------------------------------------------------------------
// 应用：把 note 挂到记录上（保留原 description 字段，供右键信息卡附注）
// --------------------------------------------------------------------------
export function applyCustomNotes(records, doc) {
  const result = { applied: 0, notes: 0 };
  if (!doc || !Array.isArray(doc.notes) || !doc.notes.length) return result;
  result.notes = doc.notes.length;

  const exact = new Map(); // collection \0 command -> note
  const global = new Map(); // command -> note（不限集合）
  for (const n of doc.notes) {
    if (n.collection) exact.set(n.collection + "\u0000" + n.command, n.note);
    else global.set(n.command, n.note);
  }
  for (const rec of records) {
    const key = rec.collection + "\u0000" + rec.name;
    const hit = exact.has(key) ? exact.get(key) : global.get(rec.name);
    if (hit) {
      rec.note = hit;
      result.applied++;
    }
  }
  return result;
}

/**
 * 合并新解析出的说明进已有文档。
 *  mode = "replace"（默认）：先移除同集合的旧说明；
 *  mode = "merge"          ：按 (集合, 命令) 覆盖/追加。
 */
export function mergeNotes(doc, newNotes, collection, mode = "replace") {
  const coll = collection ? String(collection).trim() : "";
  const base = normalizeDoc(doc);
  let notes = base.notes.slice();
  if (mode === "replace") {
    notes = notes.filter((n) => (n.collection || "") !== coll);
  }
  for (const n of newNotes) {
    const item = { collection: coll, command: n.command, note: n.note };
    const idx = notes.findIndex(
      (x) => (x.collection || "") === coll && x.command === item.command
    );
    if (idx >= 0) notes[idx] = item;
    else notes.push(item);
  }
  base.notes = notes;
  return base;
}
