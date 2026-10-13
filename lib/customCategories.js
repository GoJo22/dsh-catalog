// customCategories.js — 用户自定义分类：持久化 + 粘贴解析 + 覆盖应用
//
// 设计目标（用户原话）：「可以自己添加保存分类，且不受刷新或者其他插件的
// 安装、删除影响」。拆成三条硬约束：
//
//   1. 不受刷新影响  —— 规则存在磁盘，每次 buildCatalog() 都重新读取并覆盖
//      应用，刷新只是重扫，不会丢。
//   2. 不受其它插件安装/删除影响 —— 规则按「命令名」存储，只做匹配不做
//      过滤：命令不在（插件卸了）规则照样保留，装回来自动恢复。
//   3. 与插件安装目录解耦 —— 存到 ~/.dsh-catalog/categories.json，
//      重装/更新插件、清理 assets/ 运行时产物都不会波及。
//
// 存储结构：
//   {
//     "version": 1,
//     "updated_at": "2026-01-01T00:00:00",
//     "rules": [ { "collection": "my-game-skills",
//                  "category": "Game Design",
//                  "commands": ["brainstorm", "map-systems", ...] } ],
//     "strict_collections": ["my-game-skills"]
//   }
//   collection 为空串 = 全局规则（不挑集合，按命令名匹配）。
//   strict_collections 里的集合：「未被任何规则列出的命令」归入 (未分类)，
//   不再走动态聚类——即用户说的「替换掉原本的动态聚类分类」。

import fs from "node:fs";
import path from "node:path";

import { STORE_DIR, migrateLegacy } from "./store.js";

const STORE_PATH = path.join(STORE_DIR, "categories.json");
const VERSION = 1;

/** 与 scan.js 保持一致的「未分类」兜底标签。 */
export const UNCATEGORIZED = "(未分类)";

export function storePath() {
  return STORE_PATH;
}

function emptyDoc() {
  return { version: VERSION, updated_at: null, rules: [], strict_collections: [] };
}

// --------------------------------------------------------------------------
// 规约归一化（读盘、写盘、外部传入统一走这里，保证结构干净）
// --------------------------------------------------------------------------

/** 命令名归一：去 / 前缀、去反引号与收尾标点、转小写（技能名恒为 kebab-case）。 */
function normalizeCommandName(raw) {
  let s = String(raw == null ? "" : raw).trim().replace(/`/g, "");
  s = s.replace(/^\/+/, "");
  s = s.replace(/[.,;:!?)"'\u3002\uff0c\uff1b\uff1a]+$/, "");
  s = s.trim().toLowerCase();
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(s) ? s : "";
}

/**
 * 归一化整份文档：
 *  - 丢弃空分类 / 空命令列表的规则；
 *  - 同一 (collection, category) 去重合并；
 *  - 命令名归一 + 去重；
 *  - **保持原始顺序**——分类顺序就是用户的工作流顺序（Onboarding 在第一条），
 *    命令顺序同理，回填到编辑器时要和粘贴进来时一模一样。
 * 注意：这里刻意**不**按"命令是否真实存在"过滤——插件卸了再装回来要能恢复。
 */
function normalizeDoc(doc) {
  const out = emptyDoc();
  if (!doc || typeof doc !== "object") return out;
  if (typeof doc.updated_at === "string") out.updated_at = doc.updated_at;

  const merged = new Map(); // key: collection \0 category -> { category, collection, list, seen }
  const order = []; // 保持分类的首次出现顺序
  const rules = Array.isArray(doc.rules) ? doc.rules : [];
  for (const r of rules) {
    if (!r || typeof r !== "object") continue;
    const category = String(r.category || "").trim();
    if (!category) continue;
    const collection = r.collection ? String(r.collection).trim() : "";
    const raw = Array.isArray(r.commands) ? r.commands : [];
    const names = [];
    for (const c of raw) {
      const n = normalizeCommandName(c);
      if (n) names.push(n);
    }
    if (!names.length) continue;
    const key = collection + "\u0000" + category;
    let slot = merged.get(key);
    if (!slot) {
      slot = { collection, category, list: [], seen: new Set() };
      merged.set(key, slot);
      order.push(key);
    }
    for (const n of names) {
      if (slot.seen.has(n)) continue;
      slot.seen.add(n);
      slot.list.push(n);
    }
  }
  for (const key of order) {
    const slot = merged.get(key);
    out.rules.push({
      collection: slot.collection,
      category: slot.category,
      commands: slot.list,
    });
  }

  const strict = Array.isArray(doc.strict_collections) ? doc.strict_collections : [];
  const seen = new Set();
  for (const s of strict) {
    const v = String(s || "").trim();
    if (v) seen.add(v);
  }
  out.strict_collections = Array.from(seen).sort((a, b) => a.localeCompare(b));
  return out;
}

// --------------------------------------------------------------------------
// 读写
// --------------------------------------------------------------------------

/** 读盘。文件不存在/损坏都不阻塞扫描——损坏时备份原文件并返回空文档。 */
export function loadCustom() {
  let doc;
  migrateLegacy("categories.json");
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

/** 写盘（先写临时文件再改名，避免半截文件；updated_at 由本函数维护）。 */
export function saveCustom(doc) {
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

/** 清空（保留文件，内容置空，便于用户查看/手工编辑）。 */
export function clearCustom() {
  return saveCustom(emptyDoc());
}

// --------------------------------------------------------------------------
// 粘贴解析
//   输入形如（每行一个分类，分类名后跟若干 /命令）：
//     Onboarding & Navigation /start /help /project-stage-detect
//     Game Design /brainstorm /map-systems
//   解析规则：
//     - 以 / 开头的 token = 命令；否则 = 分类名的一部分
//       （当前分类还没收到命令时，普通词持续追加成 "Onboarding & Navigation"）
//     - 收到命令后再遇到普通词 -> 视为同一行内的下一个分类名
//     - 行首的 markdown 列表符/序号/标题符/反引号一律剥离
//     - 空行忽略；命令在整个分类内去重
// --------------------------------------------------------------------------

function cleanLine(raw) {
  return String(raw)
    .replace(/\r$/, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/, "") // 列表符 / 序号
    .replace(/^\s*#+\s*/, "") // markdown 标题
    .replace(/`/g, "")
    .trim();
}

export function parseCategoryText(text, collection) {
  const coll = collection ? String(collection).trim() : "";
  const rules = [];
  const warnings = [];
  let current = null;
  let categories = 0;

  const lines = String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n");
  lines.forEach((rawLine, i) => {
    const line = cleanLine(rawLine);
    if (!line) return;
    const tokens = line.split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (t.startsWith("/")) {
        const n = normalizeCommandName(t);
        if (!current) {
          warnings.push(`第 ${i + 1} 行：命令 ${t} 前面没有分类名，已跳过`);
          continue;
        }
        if (n && !current.commands.includes(n)) current.commands.push(n);
        continue;
      }
      // 非命令 token：分类名
      if (current && current.commands.length === 0) {
        current.category = (current.category ? current.category + " " : "") + t;
      } else {
        current = { collection: coll, category: t, commands: [] };
        rules.push(current);
        categories++;
      }
    }
    // 行末收束：下一行若以普通词开头，应开新分类而不是续写本行分类名
    current = null;
  });

  // 合并同名（同集合 + 同分类名）并丢掉只有名字没有命令的条目
  const merged = new Map();
  for (const r of rules) {
    if (!r.commands.length) {
      warnings.push(`分类「${r.category}」没有任何命令，已忽略`);
      continue;
    }
    const key = r.collection + "\u0000" + r.category;
    let set = merged.get(key);
    if (!set) {
      set = new Set();
      merged.set(key, set);
    }
    for (const c of r.commands) set.add(c);
  }
  // 按粘贴时的出现顺序输出（不重排，保持用户的工作流语序）
  const out = [];
  for (const [key, set] of merged) {
    const idx = key.indexOf("\u0000");
    out.push({
      collection: key.slice(0, idx),
      category: key.slice(idx + 1),
      commands: Array.from(set),
    });
  }

  return {
    rules: out,
    warnings,
    stats: {
      categories: out.length,
      commands: out.reduce((s, r) => s + r.commands.length, 0),
      lines: lines.length,
    },
  };
}

/** 反向序列化：把规则渲染回「可直接编辑」的粘贴格式，供编辑器回填。 */
export function serializeRules(rules, collection) {
  const coll = collection ? String(collection).trim() : "";
  const pick = (Array.isArray(rules) ? rules : []).filter(
    (r) => (r.collection || "") === coll
  );
  if (!pick.length) return "";
  return pick.map((r) => r.category + " " + r.commands.map((c) => "/" + c).join(" ")).join("\n") + "\n";
}

// --------------------------------------------------------------------------
// 应用：覆盖动态聚类结果
//   优先级：自定义分类  >  SKILL.md 的 category  >  动态聚类
//   严格集合（strict_collections）：集合内未被任何规则命中的命令统一归入
//   (未分类)，不再保留动态聚类结果。
// --------------------------------------------------------------------------
export function applyCustomCategories(records, doc) {
  const result = { applied: 0, strict_applied: 0, rules: 0 };
  if (!doc || !Array.isArray(doc.rules) || !doc.rules.length) return result;
  result.rules = doc.rules.length;

  const globalMap = new Map(); // 命令名 -> 分类（不限集合）
  const collMaps = new Map(); // 集合 -> Map(命令名 -> 分类)
  for (const r of doc.rules) {
    if (!r.collection) {
      for (const c of r.commands) globalMap.set(c, r.category);
      continue;
    }
    let m = collMaps.get(r.collection);
    if (!m) {
      m = new Map();
      collMaps.set(r.collection, m);
    }
    for (const c of r.commands) m.set(c, r.category);
  }

  const strict = new Set(Array.isArray(doc.strict_collections) ? doc.strict_collections : []);
  // 严格模式只在这些集合上生效：确实存在适用于它的规则
  const strictActive = new Set();
  for (const s of strict) {
    if (collMaps.has(s) || globalMap.size) strictActive.add(s);
  }

  for (const rec of records) {
    const cm = collMaps.get(rec.collection);
    let hit = null;
    if (cm && cm.has(rec.name)) hit = cm.get(rec.name);
    else if (globalMap.has(rec.name)) hit = globalMap.get(rec.name);
    if (hit) {
      rec.category = hit;
      rec.category_source = "custom";
      result.applied++;
    } else if (strictActive.has(rec.collection)) {
      rec.category = UNCATEGORIZED;
      rec.category_source = "custom-strict";
      result.strict_applied++;
    }
  }
  return result;
}

/**
 * 合并新解析出的规则进已有文档。
 *  mode = "replace"（默认）：先移除同集合（全局规则则移除全部全局规则）的旧规则；
 *  mode = "merge"          ：按 (集合, 分类名) 合并命令。
 *  strict：置位/清除该集合的严格模式（全局规则不设严格模式）。
 */
export function mergeRules(doc, newRules, collection, strict, mode = "replace") {
  const coll = collection ? String(collection).trim() : "";
  const base = normalizeDoc(doc);
  let rules = base.rules.slice();
  if (mode === "replace") {
    rules = rules.filter((r) => (r.collection || "") !== coll);
  }
  for (const r of newRules) {
    const target = { collection: coll, category: r.category, commands: r.commands.slice() };
    const existing = rules.find(
      (x) => (x.collection || "") === coll && x.category === target.category
    );
    if (existing) {
      // 已存在的分类：新命令追加在后面，不打乱既有顺序
      const seen = new Set(existing.commands);
      for (const c of target.commands) {
        if (seen.has(c)) continue;
        seen.add(c);
        existing.commands.push(c);
      }
    } else {
      rules.push(target);
    }
  }
  base.rules = rules;

  const set = new Set(base.strict_collections);
  if (coll) {
    if (strict) set.add(coll);
    else set.delete(coll);
  }
  base.strict_collections = Array.from(set).sort((a, b) => a.localeCompare(b));
  return base;
}

export { emptyDoc, normalizeDoc, normalizeCommandName };
