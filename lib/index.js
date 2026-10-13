// index.js — DeepSeek Harness (Cordis) 插件入口
//
// 作为 DSH 插件（而非 skill）加载：注册一个原生 tool `dsh_catalog`，并在启动时
// 拉起本地可视化面板服务（侧边栏浏览 + 点击插入）。DSH 原生支持「/」调用，故
// 本插件只负责"分类与浏览"，不生成任何斜杠命令。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./server.js";
import { buildCatalog, writeCatalog } from "./scan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "..", "assets");
const DEFAULT_PORT = 8765;

export const name = "dsh-catalog";
export const inject = ["tools"];

let serverHandle = null;

export function apply(ctx) {
  const port = Number(process.env.DSH_CATALOG_PORT || process.env.SKILL_CATALOG_PORT || DEFAULT_PORT);
  const panelUrl = `http://127.0.0.1:${port}`;

  ctx.tools.register({
    name: "dsh_catalog",
    description:
      "DSH 可用的技能/命令分类目录。按「集合 › 分类 › 命令」三级结构组织：集合 = DSH 技能根目录（~/.dsh/skills、~/.agents/skills）直下一层的文件名（单技能目录、skills/ 技能包、散装 .md），命令 = 技能名。分类有三层来源，优先级由高到低：用户在面板「⚙ 分类」粘贴保存的自定义分类（存于 ~/.dsh-catalog/categories.json）> 技能 frontmatter 的 category > 按 name/description 关键词自动聚类。命令说明：若用户在面板「✎ 说明」保存过自定义说明（存于 ~/.dsh-catalog/notes.json），记录里的 note 字段即用户写的说明，回答「某个命令是做什么的」时应优先采用它。这两份自定义数据刷新/重进/增删其它插件都不影响。查询时可先用 collection 限定集合再展开其分类。当用户问某个命令是什么/怎么用、或想浏览/整理已装技能时调用。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "按命令名/标题/描述/分类模糊搜索" },
        collection: { type: "string", description: "限定某个集合（来源），如 'my-game-skills'" },
        refresh: { type: "boolean", description: "是否先重新扫描（默认 false，使用最近一次结果）" },
      },
      required: [],
    },
    timeoutMs: 60000,
    async handler(args) {
      const a = args || {};
      const cat = a.refresh
        ? writeCatalog(path.join(ASSETS, "command-catalog.json"))
        : buildCatalog();
      const q = (a.query || "").toLowerCase();
      const collFilter = a.collection || "";
      let cmds = cat.commands;
      if (collFilter) cmds = cmds.filter((c) => c.collection === collFilter);
      if (q) {
        cmds = cmds.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.title || "").toLowerCase().includes(q) ||
            (c.description || "").toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q) ||
            c.collection.toLowerCase().includes(q) ||
            (c.client || "").toLowerCase().includes(q)
        );
      }
      return {
        total_collections: cat.meta.total_collections,
        total_categories: cat.meta.total_categories,
        total_commands: cat.meta.total_commands,
        matched: cmds.length,
        panel_url: panelUrl,
        collections: Object.keys(cat.tree).sort(),
        sample: cmds.slice(0, 25).map((c) => ({
          slash: c.slash,
          title: c.title,
          category: c.category,
          collection: c.collection,
          client: c.client,
          // 用户自定义说明（有则优先于自带 description）
          note: c.note || null,
        })),
        sources: cat.meta.sources.map((s) => ({
          client: s.client,
          collection: s.collection,
          count: s.count,
          detected: s.detected,
        })),
        custom: cat.meta.custom,
        notes: cat.meta.notes,
      };
    },
    output: {
      schema: { type: "object" },
      render(_args, value) {
        const lines = [];
        lines.push(
          `技能目录：${value.total_collections} 集合 / ${value.total_categories} 分类 / ${value.total_commands} 命令；当前匹配 ${value.matched} 个。`
        );
        if (value.panel_url) {
          lines.push(`可视化面板（侧边栏浏览 + 点击插入）： ${value.panel_url}`);
        }
        if (value.sample.length) {
          lines.push("");
          lines.push("匹配示例：");
          for (const c of value.sample) {
            lines.push(`  ${c.slash}  [${c.collection} › ${c.category}]  ${c.title}（${c.client}）`);
          }
        }
        if (value.matched > value.sample.length) {
          lines.push(`  …… 共 ${value.matched} 个，完整列表见面板。`);
        }
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
  });

  // 启动可视化面板服务（侧边栏浏览 + 点击插入）
  // 端口冲突时自动顺延（8765→8769）；客户端侧顺序探测候选端口的 /api/mode，
  // 命中即停，无需落盘地址文件。自定义端口同样会顺延回标准区间。
  const PORTS = [...new Set([port, 8765, 8766, 8767, 8768, 8769])];
  let idx = 0;
  const tryStart = () => {
    if (idx >= PORTS.length) {
      ctx.logger?.error?.("[dsh-catalog] 面板启动失败：无可用端口");
      return;
    }
    const p = PORTS[idx++];
    const server = createServer(p);
    server
      .start()
      .then((url) => {
        serverHandle = { url, stop: server.stop };
        ctx.logger?.info?.(`[dsh-catalog] 面板已启动: ${url}`);
      })
      .catch((e) => {
        // EADDRINUSE -> 顺延到下一个端口
        tryStart();
      });
  };
  tryStart();

  if (typeof ctx.on === "function") {
    ctx.on("dispose", () => serverHandle?.stop?.());
  }
}
