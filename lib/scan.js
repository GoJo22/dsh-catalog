// scan.js — DSH 插件的 Skills 分类扫描器（Node 移植版，无第三方依赖）
//
// 作为 DeepSeek Harness 的 Cordis 插件运行时的一部分，扫描 DSH 技能根目录
// （~/.dsh/skills、~/.agents/skills），归并成三级结构：
//
//     集合 (collection)  ->  分类 (category)  ->  命令 (command / skill)
//
// 集合 = 技能根目录直下一层的每个文件名（用户原始需求：「合集读取的是该
// 客户端读取 skills 时该文件下的命名」）：
//     <root>/<name>/SKILL.md             单技能集合
//     <root>/<name>/skills/<s>/SKILL.md  技能包集合（包内技能各一条命令）
//     <root>/<name>.md                   散装技能集合
// 分类 = 显式 category 优先，否则按 name/description 动态聚类；
// 命令 = 技能名。DSH 原生支持「/」调用，本插件只负责分类与浏览。

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  UNCATEGORIZED,
  loadCustom,
  applyCustomCategories,
  storePath,
} from "./customCategories.js";
import { loadNotes, applyCustomNotes, notesPath } from "./customNotes.js";

const SELF_NAME = "dsh-catalog";
const EXCLUDE_DIRS = new Set([SELF_NAME, "node_modules", ".git", "__pycache__", ".system"]);

// 数据源（适配器）：每个来源 = 一种解析方式 + 一组扫描根目录。
// 本插件只作为 DSH 插件分发，故只扫描 DSH 自己能读到的技能：
//   client              产品名（用于 UI 标注"哪个来源"）
//   kind               解析方式: skill_md（DSH 技能根目录）
//   roots              扫描根目录（支持 ~ 展开、* 通配）。每个实际命中的 root
//                     就是「DSH 读取 skills 的那个文件」，集合名由它推导
//                     （见 collectionNameFromRoot）——不用写死名。
//   collection         仅非目录源（自定义 catalog 文件）使用：显式指定集合名。
const SKILL_MD_SOURCE = {
  client: "DeepSeek Harness",
  kind: "skill_md",
  // 对齐 DSH dsh-skill-filesystem 的用户级根（~/.dsh/skills、~/.agents/skills），
  // 只扫直下一层：<name>/SKILL.md 或 <name>.md
  roots: ["~/.dsh/skills", "~/.agents/skills"],
};

const SOURCES = [SKILL_MD_SOURCE];

/** 当前宿主。本插件只作为 DSH 插件分发，宿主恒为 dsh。 */
const CURRENT_HOST = "dsh";

/**
 * 从实际扫描命中的 root 目录推导「集合」名 —— 即 DSH 读取 skills 时，
 * 这个文件在磁盘上的命名：
 *   用户级    ~/.agents/skills、~/.dsh/skills  -> home 相对路径
 *   其它                                        -> 末两段路径
 */
function collectionNameFromRoot(root) {
  const norm = root.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  const home = os.homedir().replace(/\\/g, "/");
  if (norm.startsWith(home + "/")) return norm.slice(home.length + 1);
  return parts.slice(-2).join("/");
}

// --------------------------------------------------------------------------
// 路径工具
// --------------------------------------------------------------------------
function expand(p) {
  if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
  return p;
}

function escapeRe(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

// 支持 ~ 展开（roots 均为固定路径，无需通配）
function globRoots(pattern) {
  const abs = expand(pattern).replace(/\\/g, "/");
  const parts = abs.split("/").filter(Boolean);
  const results = [];
  function walk(i, base) {
    if (i >= parts.length) {
      if (fs.existsSync(base)) results.push(base);
      return;
    }
    const seg = parts[i];
    if (!seg.includes("*")) {
      walk(i + 1, base ? base + "/" + seg : seg);
      return;
    }
    const dir = base || process.cwd();
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    const re = new RegExp("^" + seg.split("*").map(escapeRe).join(".*") + "$");
    for (const entry of fs.readdirSync(dir)) {
      if (re.test(entry)) walk(i + 1, base ? base + "/" + entry : entry);
    }
  }
  walk(0, "");
  return results;
}

function discoverRoots(source) {
  const found = [];
  for (const r of source.roots) {
    for (const m of globRoots(r)) if (fs.existsSync(m)) found.push(m);
  }
  return found;
}

// --------------------------------------------------------------------------
// Frontmatter 解析（正则回退，兼容绝大多数 skill 的简易 frontmatter）
// --------------------------------------------------------------------------
function parseFrontmatter(text) {
  // 统一行尾：Windows 的 CRLF 会让逐行正则的 `$` 失配（JS 的 `.` 不匹配 \r）
  text = text.replace(/\r\n/g, "\n");
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return [{}, text];
  const block = m[1];
  const body = text.slice(m[0].length);
  const fm = {};
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const mm = lines[i].match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!mm) continue;
    const key = mm[1];
    let v = mm[2].trim();
    // YAML 块标量：`key: >`（折叠，空行转空格）/ `key: |`（保留换行）及其 +/- 变体
    if (/^[>|][+-]?$/.test(v)) {
      const folded = v[0] === ">";
      const parts = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.trim() === "") {
          // 空行：后续仍有缩进内容则记为分段，否则块结束
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j < lines.length && /^\s+\S/.test(lines[j])) {
            parts.push("");
            i = j - 1;
            continue;
          }
          break;
        }
        if (/^\s+\S/.test(next)) {
          parts.push(next.trim());
          i++;
          continue;
        }
        break;
      }
      v = parts.join(folded ? " " : "\n");
    }
    v = v.replace(/^["']|["']$/g, "");
    fm[key] = v;
  }
  return [fm, body];
}

function firstParagraph(body) {
  for (const para of body.trim().split(/\n\s*\n/)) {
    const p = para.trim();
    if (p && !p.startsWith("#") && !p.startsWith("```")) return p.replace(/\s+/g, " ").slice(0, 220);
  }
  return "";
}

// --------------------------------------------------------------------------
// 动态分类（无任何预置分类表）：
//   1. 显式 category frontmatter 优先；
//   2. 没有 -> 从该技能的 name + description 提取关键词（加权、去停用词），
//      与其它无显式分类的技能按「共享主话题词」聚组（并查集）；
//   3. 组名：单技能组取 desc 最高频实词（name 词降权，分类名不复述技能名）；
//      多技能组取组内累计词频最高者（共享 name 词正是分组依据，故参与计分）；
//   4. 提取不到任何实词 -> "(未分类)"。
// 新技能、新合集、新用户无需任何配置——分类完全由内容产出。
// --------------------------------------------------------------------------

// 分词：保留中英文、数字与 c++/c# 的 +#；连字符/下划线/点一律视为分隔符，
// 使 fundamentals-computer-graphics 拆为 fundamentals/computer/graphics，
// 同时避免 "anti-patterns." 这类标点粘连 token。
const TOKEN_SPLIT = /[^a-z0-9\u4e00-\u9fff+#]+/;

const STOPWORDS = new Set([
  // 英文通用虚词
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "to", "of", "in",
  "on", "at", "by", "with", "from", "into", "via", "as", "is", "are", "was", "were",
  "be", "been", "being", "do", "does", "did", "have", "has", "had", "can", "could",
  "should", "would", "will", "shall", "may", "might", "must", "not", "no", "nor",
  "so", "than", "that", "this", "these", "those", "it", "its", "they", "them",
  "their", "there", "here", "when", "where", "which", "who", "whom", "whose",
  "what", "how", "why", "all", "any", "both", "each", "few", "more", "most",
  "other", "some", "such", "only", "own", "same", "too", "very", "just", "also",
  "about", "against", "between", "during", "before", "after", "above", "below",
  "up", "down", "out", "off", "over", "under", "again", "further", "once",
  "you", "your", "yours", "we", "our", "ours", "i", "me", "my", "mine",
  "he", "him", "his", "she", "her", "hers", "us",
  // 两字缩略与排版残留（英文实词允许两字，如 ui/ux/ai/qa/ml/3d）
  "eg", "ie", "etc", "vs", "al", "pp", "ed", "st", "rd", "th",
  // 技能语境泛词（对区分领域无信息量，且会把所有技能聚在一起）
  "use", "used", "uses", "using", "user", "users", "want", "wants", "need",
  "needs", "needed", "anything", "something", "everything", "nothing",
  "task", "tasks", "work", "works", "working", "job", "jobs", "make", "makes",
  "made", "get", "gets", "got", "let", "lets", "like", "well", "new", "one",
  "two", "first", "last", "next", "based",
  "skill", "skills", "agent", "agents", "claude", "codebuddy", "dsh",
  "deepseek", "harness", "plugin", "plugins", "tool", "tools",
  "file", "files", "folder", "dir", "directory", "path", "paths",
  // 生态通用词：编程/技能类描述几乎都会提到，不具区分度
  "code", "coding", "github", "project", "projects", "build", "builds",
  "apply", "applies", "applied", "base", "amp", "chapter", "become",
  // 角色后缀：python-expert / rust-expert 不应因 expert 聚成一类
  "expert", "experts", "specialist", "specialists", "assistant", "helper",
  "toolkit", "suite", "generator", "creator", "cli", "sdk", "wizard", "guru",
]);

/** 停用词 + 过短词过滤。中文连续串按整体成词（无分词器，粒度由标点决定）。 */
function isStopword(w) {
  return STOPWORDS.has(w) || (w.length < 2 && !/^\p{Script=Han}+$/u.test(w));
}

/**
 * 提取技能关键词（加权词频）：desc 中的词每个 ×1；name 中的词额外加权——
 * 首个实词 ×2（等效 ×3，主话题），其余 ×1（等效 ×2，次话题）。
 * 返回 [{word, weight, first}]：
 *   first = 该词在 desc token 流中的首次出现位置（并列时先出现者胜出），
 *   仅出现在 name 里的词 first 为 Infinity。
 * 排序：权重降序 -> desc 出现位置升序 -> 字典序。
 */
function keywordsOf(name, description) {
  const nameText = String(name || "").toLowerCase();
  const descText = String(description || "").toLowerCase();
  const freq = new Map();
  const first = new Map();
  const bump = (w, weight) => freq.set(w, (freq.get(w) || 0) + weight);
  let idx = 0;
  for (const w of descText.split(TOKEN_SPLIT)) {
    if (w && !isStopword(w)) {
      bump(w, 1);
      if (!first.has(w)) first.set(w, idx);
    }
    idx++;
  }
  // name 命中加权（词可能已在 desc 出现过，直接加权重）
  let firstPartDone = false;
  for (const w of nameText.split(TOKEN_SPLIT)) {
    if (!w || isStopword(w)) continue;
    bump(w, firstPartDone ? 1 : 2); // 首个 name 词等效 ×3，其余 ×2
    firstPartDone = true;
  }
  return Array.from(freq, ([word, weight]) => ({ word, weight, first: first.get(word) ?? Infinity }))
    .sort((a, b) => b.weight - a.weight || a.first - b.first || a.word.localeCompare(b.word));
}

/**
 * 给所有无显式 category 的技能动态分配分类（原地改 record.category）。
 * 聚组规则：两个技能共享某个「在双方权重都 >= 2、且都是双方 top-1」的
 * 实词即并组——即主话题一致才同组：pdf-merge / pdf-split 共享 pdf（各自
 * top-1）同组；godot-shader 与 unity-shader 只共享次级词 shader，各自
 * top-1 是 godot / unity，故不并组；apply/base 这类各出现一次的泛词
 * 权重不够，也不会桥接。
 */
function assignDynamicCategories(records) {
  const pending = records.filter((r) => !r.category);
  if (!pending.length) return;

  // 1. 每个技能的关键词表（word -> weight）与 top-1 词集合（并列取多个）
  const kwMaps = pending.map((r) => {
    const list = keywordsOf(r.name, r.description);
    const m = new Map();
    for (const k of list) m.set(k.word, k.weight);
    const top = list.length ? list[0].weight : 0;
    const topSet = new Set(list.filter((k) => k.weight === top).map((k) => k.word));
    return { map: m, topSet };
  });

  // 2. 并查集聚类
  const parent = pending.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < pending.length; i++) {
    for (let j = i + 1; j < pending.length; j++) {
      let linked = false;
      for (const [w, weight] of kwMaps[i].map) {
        if (weight < 2 || (kwMaps[j].map.get(w) || 0) < 2) continue;
        if (kwMaps[i].topSet.has(w) && kwMaps[j].topSet.has(w)) {
          linked = true;
          break;
        }
      }
      if (linked) union(i, j);
    }
  }

  // 3. 分组
  const groups = new Map();
  pending.forEach((r, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });

  // 4. 组名
  for (const members of groups.values()) {
    let label;
    if (members.length === 1) {
      // 单技能组：desc 关键词最高者（不含 name 词——分类名不该复述技能名），
      // desc 无实词时退回 name 词，再无则 "(未分类)"
      const r = pending[members[0]];
      label = keywordsOf("", r.description)[0]?.word
        || keywordsOf(r.name, "")[0]?.word
        || "(未分类)";
    } else {
      // 多技能组：组内累计词频最高者（共享 name 词正是分组依据）
      const freq = new Map();
      for (const i of members) {
        for (const [w, weight] of kwMaps[i].map) freq.set(w, (freq.get(w) || 0) + weight);
      }
      label = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "(未分类)";
    }
    for (const i of members) pending[i].category = label;
  }
}

// --------------------------------------------------------------------------
// 解析器 1：skill_md —— <skill>/SKILL.md 或散装 <skill>.md
//
// 加载条件严格对齐 DSH 源码（@deepseek-ai/dsh-skill-filesystem 的
// discoverRoot / parseSkillFile + @deepseek-ai/dsh-skill 的 isSkillName）：
//   1. 只扫 skills root 直下一层：`<name>/SKILL.md` 或 `<name>.md`
//      （isPotentialSkillPath 限定相对 root 最多 2 段，不递归子目录）
//   2. frontmatter 必须同时含 name 和 description
//   3. name 必须匹配 /^[a-z0-9]+(?:-[a-z0-9]+)*$/（kebab-case）
// 不满足任一条 -> DSH 不会加载 -> 本目录也不列（用户原话："读取需要被客户端
// 正确加载，不然就不会载入该文件名"）。
// 注意：root 下形如 `<bundle>/skills/<skill>/SKILL.md` 的"技能包"是
// CodeBuddy/Claude Code 的插件布局（带 plugin.json），DSH 不扫，故不收录。
// --------------------------------------------------------------------------
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseSkillMd(filePath, collection, client) {
  const text = fs.readFileSync(filePath, "utf-8");
  const [fm, body] = parseFrontmatter(text);
  if (!fm.name || !fm.description) return null; // 缺 name/description -> DSH 不加载
  if (!SKILL_NAME_RE.test(String(fm.name))) return null; // 非 kebab-case -> DSH 不加载
  const name = fm.name;
  const title = fm.title || name;
  const desc = fm.description || firstParagraph(body);
  // 显式 category 优先；没有则留 null，由 buildCatalog 统一动态聚类
  // （注意：不能 String(null)，那会得到真值字符串 "null" 使聚类被跳过）
  const category = fm.category ? String(fm.category) : null;
  return {
    name: String(name),
    slash: "/" + String(name),
    title: String(title),
    description: String(desc || ""),
    category: category === null ? null : String(category),
    priority: fm.priority ?? null,
    client,
    collection,
    source_path: filePath,
  };
}

// --------------------------------------------------------------------------
// 布局解析：技能包内的一个 SKILL.md（<child>/skills/<name>/SKILL.md）
//
// 规则对齐 mattpocock 型 provider 的实载逻辑（其 src/index.js loadSkill）：
// frontmatter 必须同时含 name/description，且 name === 目录名——不一致该
// provider 会跳过。不套 kebab-case（provider 自有规则，文件系统那条不适用于此）。
// --------------------------------------------------------------------------

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function parsePackSkill(filePath, dirName, collection, client) {
  const text = fs.readFileSync(filePath, "utf-8");
  const [fm, body] = parseFrontmatter(text);
  if (!fm.name || !fm.description) return null;
  const name = String(fm.name);
  if (name !== dirName) return null;
  const desc = fm.description || firstParagraph(body);
  return {
    name,
    slash: "/" + name,
    title: fm.title || name,
    description: String(desc || ""),
    category: fm.category ? String(fm.category) : null,
    priority: fm.priority ?? null,
    client,
    collection,
    source_path: filePath,
    via: "pack",
  };
}

/**
 * 布局 C（折叠链接）：<child>/<name>/SKILL.md
 *
 * 当 junction/符号链接直接指向某个技能包的 skills/ 目录时，child 下就是一排
 * 技能子目录，既没有顶层 SKILL.md 也没有 skills/ 子目录。复用技能包的解析
 * 规则（parsePackSkill：frontmatter 需含 name/description，且 name === 目录名）；
 * 一个都解析不出来时返回空数组，交由调用方按"纯资源目录"跳过。
 */
function scanFlatPack(dir, collection, client) {
  const out = [];
  for (const sub of fs.readdirSync(dir).sort()) {
    if (EXCLUDE_DIRS.has(sub)) continue;
    const sfull = path.join(dir, sub);
    if (!isDir(sfull)) continue;
    const sk = path.join(sfull, "SKILL.md");
    if (!isFile(sk)) continue;
    const rec = parsePackSkill(sk, sub, collection, client);
    if (rec) out.push(rec);
  }
  return out;
}

// --------------------------------------------------------------------------
// 单来源扫描。skill_md 源的模型（用户原始需求：「合集读取的是该客户端读取
// skills 时该文件下的命名」）：root 直下一层每个子项 = 一个「集合」——
//   <root>/<name>/SKILL.md            单技能集合（命令名取 frontmatter name）
//   <root>/<name>/skills/<s>/SKILL.md 技能包集合（dsh-mattpocock-skills 等
//                                      同一布局；包内每个技能一条命令）
//   <root>/<name>.md                  散装技能集合（集合名取文件干名）
// 集合内技能显式 category 优先，否则动态聚类（assignDynamicCategories）。
// 同名子项出现在多个 root 时，后出现者以 <root>/<name> 限定，避免混淆。
// --------------------------------------------------------------------------
function scanSource(source) {
  const roots = discoverRoots(source);
  const records = [];
  const perCollection = []; // [{root, collection, count, skipped}]
  const bucket = (collection, root) => {
    let b = perCollection.find((p) => p.collection === collection);
    if (!b) {
      b = { root: root ?? null, collection, count: 0, skipped: 0 };
      perCollection.push(b);
    }
    return b;
  };
  const owner = new Map(); // 集合名 -> 首次占用它的 root（跨 root 同名限定用）
  for (const root of roots) {
    if (source.kind === "skill_md") {
      if (!isDir(root)) continue;
      for (const entry of fs.readdirSync(root).sort()) {
        if (EXCLUDE_DIRS.has(entry)) continue;
        const full = path.join(root, entry);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (st.isDirectory()) {
          const top = path.join(full, "SKILL.md");
          const pack = path.join(full, "skills");
          // 布局 A/B 都没有：可能是"折叠链接"（junction 直接指向某个技能包的
          // skills/ 目录，形如 <child>/<name>/SKILL.md）。先试着按扁平技能包解析，
          // 一个都解析不出来才当纯资源目录跳过——否则用户换个链接形态，整个合集
          // 就会静默消失（刷新和重进都救不回来）。
          const flat = !isFile(top) && !isDir(pack) ? scanFlatPack(full, entry, source.client) : [];
          if (!isFile(top) && !isDir(pack) && flat.length === 0) continue;
          // 集合名 = 子目录名（「该文件下的文件名」）
          let coll = entry;
          if (owner.has(coll) && owner.get(coll) !== root) {
            coll = collectionNameFromRoot(root) + "/" + entry;
          }
          owner.set(coll, root);
          const b = bucket(coll, root);
          // 布局 A：<child>/SKILL.md —— DSH 文件系统提供方原生命中的单技能
          if (isFile(top)) {
            const rec = parseSkillMd(top, coll, source.client);
            if (rec) { records.push(rec); b.count++; } else b.skipped++;
          }
          // 布局 C：<child>/<name>/SKILL.md —— 折叠链接（junction 直指 skills/ 目录）。
          // DSH 文件系统扫描器不递归故不直接加载，但这类技能通常由 provider 型插件
          // （技能包经 registerProvider 型插件注入 DSH），故本插件仍收录。
          if (flat.length) {
            for (const rec of flat) {
              records.push({ ...rec, via: "flat-pack" });
              b.count++;
            }
          }
          // 布局 B：<child>/skills/<s>/SKILL.md —— 技能包，包内每个技能一条命令
          if (isDir(pack)) {
            for (const se of fs.readdirSync(pack).sort()) {
              const sfull = path.join(pack, se);
              let sst;
              try { sst = fs.statSync(sfull); } catch { continue; }
              if (sst.isDirectory()) {
                const sk = path.join(sfull, "SKILL.md");
                if (!isFile(sk)) { b.skipped++; continue; }
                const rec = parsePackSkill(sk, se, coll, source.client);
                if (rec) { records.push(rec); b.count++; } else b.skipped++;
              } else if (se.toLowerCase().endsWith(".md")) {
                const rec = parseSkillMd(sfull, coll, source.client);
                if (rec) { records.push(rec); b.count++; } else b.skipped++;
              }
            }
          }
        } else if (entry.toLowerCase().endsWith(".md")) {
          // root 级散装技能 = 单技能集合（集合名取文件干名）
          const coll = entry.replace(/\.md$/i, "");
          const b = bucket(coll, root);
          const rec = parseSkillMd(full, coll, source.client);
          if (rec) { records.push(rec); b.count++; } else b.skipped++;
        }
      }
    }
  }
  // 源已配置条目但一个 root 都没命中：
  // 仍报状态行，便于 UI/tool 显示"未配置/为空"而不是静默消失。
  if (!perCollection.length) {
    if (source.collection) {
      // 非目录源已配置但未命中任何路径（如路径为空 / 未设置）
      perCollection.push({ root: null, collection: source.collection, count: 0, skipped: 0 });
    } else if (source.kind === "skill_md" && source.roots.length) {
      // 目录源：按配置的 root 模式逐条报"扫了但为空"（新用户装机时能自解释）
      for (const pattern of source.roots) {
        perCollection.push({
          root: null,
          collection: collectionNameFromRoot(expand(pattern).replace(/\\/g, "/")),
          count: 0,
          skipped: 0,
        });
      }
    }
  }
  return [roots, records, perCollection];
}

// --------------------------------------------------------------------------
// 构建统一目录（只含 DSH 可读的技能源，无宿主过滤）
// --------------------------------------------------------------------------
function buildCatalog() {
  const tree = {};
  const sourcesStatus = [];
  const allRecords = [];
  for (const source of SOURCES) {
    const [, recs, perCollection] = scanSource(source);
    for (const pr of perCollection) {
      sourcesStatus.push({
        client: source.client,
        collection: pr.collection,
        kind: source.kind,
        detected: pr.count + pr.skipped > 0,
        root: pr.root,
        count: pr.count,
        skipped: pr.skipped,
      });
    }
    allRecords.push(...recs);
  }

  // 无显式 category 的技能统一动态聚类（数据驱动，新技能/新合集/新用户零配置）
  // 聚类后再统一入树，避免 null category 与动态分类重复计数
  assignDynamicCategories(allRecords);

  // 用户自定义分类：最高优先级，覆盖上面两步的结果。
  // 每次构建都重新读盘（~/.dsh-catalog/categories.json），故刷新/重进/插件
  // 增删都不影响——规则按命令名存储，命令暂时不存在也原样保留。
  const customDoc = loadCustom();
  const customStats = applyCustomCategories(allRecords, customDoc);

  // 用户自定义「命令说明」：同上，每次构建重新读盘
  // （~/.dsh-catalog/notes.json）。只额外挂 .note 字段，不动 description——
  // 右键信息卡优先显示 note，原 description 作为「原始描述」附注保留。
  const notesDoc = loadNotes();
  const notesStats = applyCustomNotes(allRecords, notesDoc);

  for (const r of allRecords) {
    if (!r.category) r.category = UNCATEGORIZED;
    (tree[r.collection] ??= {})[r.category] ??= [];
    tree[r.collection][r.category].push(r);
  }

  const treeSorted = {};
  for (const coll of Object.keys(tree).sort()) {
    const cats = tree[coll];
    treeSorted[coll] = {};
    for (const c of Object.keys(cats).sort()) {
      treeSorted[coll][c] = cats[c].slice().sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  const meta = {
    host: CURRENT_HOST,
    total_collections: Object.keys(treeSorted).length,
    total_categories: Object.values(treeSorted).reduce((s, c) => s + Object.keys(c).length, 0),
    total_commands: allRecords.length,
    uncategorized: UNCATEGORIZED,
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, ""),
    sources: sourcesStatus,
    // 自定义分类状态（供面板/工具展示"当前有几条规则在生效"）
    custom: {
      path: storePath(),
      rules: customDoc.rules.length,
      mappings: customDoc.rules.reduce((s, r) => s + r.commands.length, 0),
      applied: customStats.applied,
      strict_applied: customStats.strict_applied,
      strict_collections: customDoc.strict_collections,
      updated_at: customDoc.updated_at || null,
      error: customDoc.error || null,
    },
    // 自定义命令说明状态（右键信息卡展示用）
    notes: {
      path: notesPath(),
      notes: notesDoc.notes.length,
      applied: notesStats.applied,
      updated_at: notesDoc.updated_at || null,
      error: notesDoc.error || null,
    },
  };
  return { meta, tree: treeSorted, commands: allRecords.slice().sort((a, b) => a.collection.localeCompare(b.collection) || a.name.localeCompare(b.name)) };
}

// --------------------------------------------------------------------------
// 落盘（被插件/面板服务复用）
// --------------------------------------------------------------------------
function writeCatalog(outPath) {
  const cat = buildCatalog();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(cat, null, 2), "utf-8");
  return cat;
}

export {
  SOURCES,
  buildCatalog,
  writeCatalog,
  scanSource,
  discoverRoots,
  CURRENT_HOST,
  keywordsOf,
  assignDynamicCategories,
  UNCATEGORIZED,
};
