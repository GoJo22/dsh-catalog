// client.js — DeepSeek Harness 浏览器半侧入口
// 严格遵循 DSH 官方 cordis-plugin-development 模板（templates/decoration/client.js）：
// 通过 window.__ModuleLoader__.load({ id, factory(require) }) 注册，React 由
// ModuleLoader 的浏览器模块表提供（factory 内 require('react')），
// 返回 { inject, apply }；工厂无副作用，全部注册放进 apply。
//
// 布局：侧边栏图标 -> main 面板（窄条 420px，不全屏，右侧留给对话区）。
window.__ModuleLoader__.load({
  id: "dsh-skill-catalog",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useCallback = React.useCallback;

    const PANEL_ID = "dsh-catalog";
    const TITLE = "技能目录";
    const CANDIDATE_PORTS = [8765, 8766, 8767, 8768, 8769];

    // 全部使用 DSH 真实主题 token（--dsw-alias-*），随客户端亮/暗主题自动切换。
    // token 清单来源：@deepseek-ai/dsh-client-ui-primitives（经 dsh-client-ui-cordis 加载）。
    const st = {
      // 右列窄侧边栏：自适应右列轨道宽度，与对话并存
      page: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        color: "var(--dsw-alias-label-primary, #1f2329)",
        background: "var(--dsw-alias-bg-base, #ffffff)",
      },
      head: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "10px 12px",
        borderBottom: "1px solid var(--dsw-alias-border-l2, #e5e6eb)",
        flexShrink: 0,
      },
      title: { fontSize: 14, fontWeight: 600, lineHeight: 1.2 },
      sub: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, #86909c)", marginTop: 2 },
      btn: {
        border: "1px solid var(--dsw-alias-border-l2, #e5e6eb)",
        background: "var(--dsw-alias-bg-layer-2, #f7f8fa)",
        color: "var(--dsw-alias-label-primary, #1f2329)",
        borderRadius: 6,
        padding: "4px 9px",
        cursor: "pointer",
        fontSize: 12,
        whiteSpace: "nowrap",
      },
      filters: {
        display: "flex",
        gap: 6,
        padding: "10px 12px",
        flexShrink: 0,
        alignItems: "center",
        flexWrap: "wrap",
      },
      select: {
        flex: "1 1 0",
        minWidth: 0,
        border: "1px solid var(--dsw-alias-border-l2, #e5e6eb)",
        background: "var(--dsw-alias-bg-base, #ffffff)",
        color: "var(--dsw-alias-label-primary, #1f2329)",
        borderRadius: 6,
        padding: "5px 7px",
        fontSize: 12,
      },
      search: {
        flex: "1 1 100%",
        border: "1px solid var(--dsw-alias-border-l2, #e5e6eb)",
        background: "var(--dsw-alias-bg-base, #ffffff)",
        color: "var(--dsw-alias-label-primary, #1f2329)",
        borderRadius: 6,
        padding: "6px 9px",
        fontSize: 12,
        outline: "none",
      },
      list: { flex: 1, overflow: "auto", padding: "0 12px 12px" },
      card: {
        border: "1px solid var(--dsw-alias-border-l2, #e5e6eb)",
        borderRadius: 8,
        padding: "7px 9px",
        marginTop: 7,
        cursor: "pointer",
        background: "var(--dsw-alias-bg-layer-1, #ffffff)",
      },
      slash: {
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontWeight: 600,
        fontSize: 13,
      },
      meta: {
        fontSize: 11,
        color: "var(--dsw-alias-label-tertiary, #86909c)",
        marginTop: 2,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      empty: { padding: 20, textAlign: "center", color: "var(--dsw-alias-label-dimmed, #86909c)" },
      toast: { fontSize: 11, color: "var(--dsw-alias-state-success-primary, #00b42a)" },
      // ---- 自定义分类编辑器 ----
      editor: {
        padding: "10px 12px",
        borderBottom: "1px solid var(--dsw-alias-border-l2, #e5e6eb)",
        background: "var(--dsw-alias-bg-layer-2, #f7f8fa)",
        flexShrink: 0,
      },
      editorHint: {
        fontSize: 11,
        lineHeight: 1.7,
        color: "var(--dsw-alias-label-tertiary, #86909c)",
        marginBottom: 8,
      },
      editorCode: {
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontSize: 11,
        color: "var(--dsw-alias-label-secondary, #4e5969)",
      },
      textarea: {
        width: "100%",
        boxSizing: "border-box",
        minHeight: 190,
        maxHeight: 320,
        resize: "vertical",
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontSize: 11.5,
        lineHeight: 1.65,
        border: "1px solid var(--dsw-alias-border-l2, #e5e6eb)",
        background: "var(--dsw-alias-bg-base, #ffffff)",
        color: "var(--dsw-alias-label-primary, #1f2329)",
        borderRadius: 6,
        padding: "8px 9px",
        outline: "none",
        whiteSpace: "pre",
        overflowWrap: "normal",
        overflowX: "auto",
      },
      editorRow: {
        display: "flex",
        gap: 6,
        alignItems: "center",
        marginTop: 8,
        flexWrap: "wrap",
      },
      checkRow: {
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        marginTop: 8,
        fontSize: 11,
        lineHeight: 1.5,
        color: "var(--dsw-alias-label-secondary, #4e5969)",
        cursor: "pointer",
      },
      btnPrimary: {
        border: "1px solid var(--dsw-alias-state-primary, #165dff)",
        background: "var(--dsw-alias-state-primary, #165dff)",
        color: "#fff",
        borderRadius: 6,
        padding: "4px 10px",
        cursor: "pointer",
        fontSize: 12,
        whiteSpace: "nowrap",
      },
      btnDanger: {
        border: "1px solid var(--dsw-alias-state-danger-primary, #f53f3f)",
        background: "transparent",
        color: "var(--dsw-alias-state-danger-primary, #f53f3f)",
        borderRadius: 6,
        padding: "4px 10px",
        cursor: "pointer",
        fontSize: 12,
        whiteSpace: "nowrap",
      },
      editorMsg: {
        marginTop: 8,
        fontSize: 11,
        lineHeight: 1.6,
        color: "var(--dsw-alias-label-secondary, #4e5969)",
        wordBreak: "break-word",
      },
      path: {
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontSize: 10,
        color: "var(--dsw-alias-label-tertiary, #86909c)",
        marginTop: 6,
        wordBreak: "break-all",
      },
      // ---- 右键信息卡（fixed 定位，跟随右键时光标坐标） ----
      tip: {
        position: "fixed",
        zIndex: 1000,
        pointerEvents: "auto",
        border: "1px solid var(--dsw-alias-border-l2, #e5e6eb)",
        borderRadius: 8,
        background: "var(--dsw-alias-bg-layer-2, #ffffff)",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.14)",
        padding: "9px 11px",
        width: 300,
        maxHeight: "calc(100vh - 24px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      },
      tipClose: {
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: "var(--dsw-alias-label-tertiary, #86909c)",
        fontSize: 13,
        lineHeight: 1,
        padding: "2px 4px",
      },
      tipSlash: {
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontWeight: 600,
        fontSize: 13,
      },
      tipMeta: {
        fontSize: 10.5,
        color: "var(--dsw-alias-label-tertiary, #86909c)",
        whiteSpace: "nowrap",
      },
      tipBody: {
        marginTop: 6,
        fontSize: 12,
        lineHeight: 1.7,
        color: "var(--dsw-alias-label-primary, #1f2329)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflow: "auto", // 长说明卡内滚动，不把卡片撑出视口
        minHeight: 0, // flex 列布局里允许被压缩，配合 overflow:auto 内部滚动
      },
      tipOrig: {
        marginTop: 7,
        paddingTop: 7,
        borderTop: "1px dashed var(--dsw-alias-border-l2, #e5e6eb)",
        fontSize: 11,
        lineHeight: 1.6,
        color: "var(--dsw-alias-label-tertiary, #86909c)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      },
      tipFoot: {
        marginTop: 7,
        fontSize: 10.5,
        color: "var(--dsw-alias-label-dimmed, #86909c)",
      },
      noteBadge: {
        marginLeft: 6,
        fontSize: 10,
        padding: "1px 5px",
        borderRadius: 4,
        border: "1px solid var(--dsw-alias-state-primary, #165dff)",
        color: "var(--dsw-alias-state-primary, #165dff)",
        fontWeight: 400,
        verticalAlign: "middle",
      },
    };

    function CatalogIcon(props) {
      const size = props && props.size ? props.size : 20;
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.8,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: { display: "block" },
        },
        h("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }),
        h("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" }),
        h("line", { x1: 8, y1: 7, x2: 16, y2: 7 }),
        h("line", { x1: 8, y1: 12, x2: 16, y2: 12 }),
        h("line", { x1: 8, y1: 17, x2: 12, y2: 17 })
      );
    }

    // 解析到的面板地址缓存（模块级）：命中过一次就不再重复探测。
    // 抓取失败时由 load() 的 catch 清掉，允许重试时重新探测（端口可能变了）。
    let cachedBase = null;

    /**
     * 探测面板服务真实地址：顺序打候选端口的 /api/mode，命中即停。
     * 必须顺序——并行探测会在服务正常时对其余端口各产生一次
     * ERR_CONNECTION_REFUSED（DevTools 里一片红字）。顺序 + 命中即停后，
     * 默认端口（8765）有服务时只发 1 个请求，零错误日志。
     */
    function resolveBase() {
      if (cachedBase) return Promise.resolve(cachedBase);
      const tryPort = (i) => {
        if (i >= CANDIDATE_PORTS.length) return Promise.resolve(null);
        const p = CANDIDATE_PORTS[i];
        return fetch("http://127.0.0.1:" + p + "/api/mode", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
          .then((j) => (j && j.mode === "serve" ? "http://127.0.0.1:" + p : null))
          .catch(() => null)
          .then((found) => {
            if (found) {
              cachedBase = found;
              return found;
            }
            return tryPort(i + 1); // 这个端口没有服务，试下一个
          });
      };
      return tryPort(0);
    }

    /**
     * 自定义分类编辑器。
     *
     * 交互：选集合 -> 粘贴「分类名 /命令 /命令 …」-> 保存。保存在
     * ~/.dsh-catalog/categories.json（与插件安装目录分离），因此：
     *   · 刷新（重新扫描）不会丢——每次构建目录都重新读盘应用；
     *   · 其它插件安装/删除不影响——规则按命令名存储，命令暂时找不到也保留；
     *   · 重装/更新本插件不丢——不写进插件目录，也不写进 assets/ 运行时产物。
     */
    function CategoryEditor(props) {
      const base0 = props.base;
      const collections = props.collections || [];
      const onSaved = props.onSaved;
      const onClose = props.onClose;

      const [text, setText] = useState("");
      const [coll, setColl] = useState(props.defaultColl || "");
      const [strict, setStrict] = useState(true);
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      const [dirty, setDirty] = useState(false);
      const [confirmReset, setConfirmReset] = useState(false);
      const [path, setPath] = useState("");

      const withBase = useCallback(
        (fn) => (base0 ? Promise.resolve(base0) : resolveBase()).then(fn),
        [base0]
      );

      // 打开（或切换集合）时回填该集合已保存的规则，可直接在此基础上改
      useEffect(() => {
        let cancelled = false;
        setBusy(true);
        withBase((b) =>
          fetch(b + "/api/custom?collection=" + encodeURIComponent(coll), { cache: "no-store" })
        )
          .then((r) => r.json())
          .then((j) => {
            if (cancelled) return;
            setText(j.text || "");
            if (j.path) setPath(j.path);
            setDirty(false);
            setMsg(
              j.custom && j.custom.error
                ? "已保存的规则读取失败（" + j.custom.error + "），保存将覆盖它"
                : j.text
                ? "已载入该集合当前保存的分类，可直接修改"
                : "该集合还没有自定义分类，粘贴内容后保存即可"
            );
          })
          .catch((e) => {
            if (!cancelled) setMsg("读取已保存规则失败：" + (e && e.message ? e.message : e));
          })
          .finally(() => {
            if (!cancelled) setBusy(false);
          });
        return () => {
          cancelled = true;
        };
      }, [coll, withBase]);

      function switchColl(next) {
        if (dirty) setMsg("已切换集合，未保存的修改已丢弃");
        setConfirmReset(false);
        setColl(next);
      }

      function save() {
        if (!text.trim()) {
          setMsg("内容为空：请先粘贴分类，例如「Game Design /brainstorm /map-systems」");
          return;
        }
        setBusy(true);
        setMsg("保存中…");
        withBase((b) =>
          fetch(b + "/api/custom", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: text,
              collection: coll,
              strict: strict,
              mode: "replace",
            }),
          }).then((r) => r.json())
        )
          .then((j) => {
            if (!j || !j.ok) {
              setMsg("保存失败：" + ((j && j.error) || "未知错误"));
              return;
            }
            const s = j.stats || {};
            const p = j.parsed || {};
            let m =
              "已保存：" + (p.categories || 0) + " 个分类 / " + (p.commands || 0) + " 条命令";
            if (s.total) m += "；目录中匹配 " + s.matched + "/" + s.total;
            if (s.unknown && s.unknown.length) {
              m +=
                "；" +
                s.unknown.length +
                (s.unknown.length >= 15 ? "+" : "") +
                " 条当前目录里没有（规则已保留，命令出现后自动生效）";
            }
            if (j.warnings && j.warnings.length) m += "；" + j.warnings[0];
            m += "。已覆盖" + (coll || "全部集合") + "下原有的自定义分类。";
            setMsg(m);
            setDirty(false);
            setConfirmReset(false);
            if (onSaved) onSaved();
          })
          .catch((e) => setMsg("保存失败：" + (e && e.message ? e.message : e)))
          .finally(() => setBusy(false));
      }

      function reset() {
        if (!confirmReset) {
          setConfirmReset(true);
          setMsg("再点一次「清空」确认：将删除全部自定义分类（所有集合）。");
          return;
        }
        setBusy(true);
        withBase((b) =>
          fetch(b + "/api/custom/reset", { method: "POST" }).then((r) => r.json())
        )
          .then(() => {
            setText("");
            setConfirmReset(false);
            setMsg("已清空全部自定义分类，目录恢复为自动聚类。");
            if (onSaved) onSaved();
          })
          .catch((e) => setMsg("清空失败：" + (e && e.message ? e.message : e)))
          .finally(() => setBusy(false));
      }

      return h(
        "div",
        { style: st.editor },
        h(
          "div",
          { style: st.editorHint },
          "每行一个分类：先写分类名，后跟该分类下的命令。",
          h("br"),
          h(
            "span",
            { style: st.editorCode },
            "Game Design /brainstorm /map-systems /design-system"
          ),
          h("br"),
          "保存后这些命令一律使用你的分类（优先级最高）。分类名支持空格与 & 、中文；行首的 - 、1. 、# 会自动忽略。"
        ),
        h(
          "select",
          {
            style: { ...st.select, width: "100%", flex: "none" },
            value: coll,
            onChange: (e) => switchColl(e.target.value),
            title: "规则归属的集合；选「全部集合」则按命令名匹配，不限集合",
          },
          h("option", { value: "" }, "全部集合（按命令名匹配，不限集合）"),
          collections.map(([c, n]) => h("option", { key: c, value: c }, c + " (" + n + ")"))
        ),
        h("textarea", {
          style: st.textarea,
          value: text,
          spellCheck: false,
          placeholder:
            "Onboarding & Navigation /start /help /adopt\nGame Design /brainstorm /map-systems\nQA & Testing /qa-plan /smoke-check",
          onChange: (e) => {
            setText(e.target.value);
            setDirty(true);
          },
        }),
        h(
          "label",
          { style: st.checkRow },
          h("input", {
            type: "checkbox",
            checked: strict,
            style: { marginTop: 2 },
            onChange: (e) => setStrict(e.target.checked),
          }),
          h(
            "span",
            null,
            "该集合内未被列出的命令归入「",
            "(未分类)",
            "」（不勾选则保持自动聚类）"
          )
        ),
        h(
          "div",
          { style: st.editorRow },
          h(
            "button",
            { style: st.btnPrimary, onClick: save, disabled: busy },
            busy ? "处理中…" : "保存并应用"
          ),
          h(
            "button",
            {
              style: confirmReset ? st.btnDanger : st.btn,
              onClick: reset,
              disabled: busy,
            },
            confirmReset ? "确认清空？" : "清空"
          ),
          h("button", { style: st.btn, onClick: onClose }, "收起")
        ),
        msg ? h("div", { style: st.editorMsg }, msg) : null,
        path ? h("div", { style: st.path }, "保存位置：" + path) : null
      );
    }

    /**
     * 自定义命令说明编辑器。
     *
     * 粘贴 Markdown 表格（技能清单最常见的形态）批量导入，保存后：
     *   · 右键命令卡片时，信息卡优先显示你写的说明；
     *   · 技能自带的 description 降级为「原始描述」附注，不丢信息；
     *   · 与分类一样存 ~/.dsh-catalog/notes.json，刷新/重进/插件增删都不影响。
     */
    function NoteEditor(props) {
      const base0 = props.base;
      const collections = props.collections || [];
      const onSaved = props.onSaved;
      const onClose = props.onClose;

      const [text, setText] = useState("");
      const [coll, setColl] = useState(props.defaultColl || "");
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      const [dirty, setDirty] = useState(false);
      const [confirmReset, setConfirmReset] = useState(false);
      const [path, setPath] = useState("");

      const withBase = useCallback(
        (fn) => (base0 ? Promise.resolve(base0) : resolveBase()).then(fn),
        [base0]
      );

      useEffect(() => {
        let cancelled = false;
        setBusy(true);
        withBase((b) =>
          fetch(b + "/api/notes?collection=" + encodeURIComponent(coll), { cache: "no-store" })
        )
          .then((r) => r.json())
          .then((j) => {
            if (cancelled) return;
            setText(j.text || "");
            if (j.path) setPath(j.path);
            setDirty(false);
            setMsg(
              j.notes && j.notes.error
                ? "已保存的说明读取失败（" + j.notes.error + "），保存将覆盖它"
                : j.text
                ? "已载入该集合当前保存的说明，可直接修改"
                : "该集合还没有自定义说明，粘贴表格后保存即可"
            );
          })
          .catch((e) => {
            if (!cancelled) setMsg("读取已保存说明失败：" + (e && e.message ? e.message : e));
          })
          .finally(() => {
            if (!cancelled) setBusy(false);
          });
        return () => {
          cancelled = true;
        };
      }, [coll, withBase]);

      function switchColl(next) {
        if (dirty) setMsg("已切换集合，未保存的修改已丢弃");
        setConfirmReset(false);
        setColl(next);
      }

      function save() {
        if (!text.trim()) {
          setMsg("内容为空：请先粘贴说明表格，例如「| **ask-matt** | 技能路由器… |」");
          return;
        }
        setBusy(true);
        setMsg("保存中…");
        withBase((b) =>
          fetch(b + "/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text, collection: coll, mode: "replace" }),
          }).then((r) => r.json())
        )
          .then((j) => {
            if (!j || !j.ok) {
              setMsg("保存失败：" + ((j && j.error) || "未知错误"));
              return;
            }
            const s = j.stats || {};
            const p = j.parsed || {};
            let m = "已保存：" + (p.notes || 0) + " 条说明";
            if (s.total) m += "；目录中匹配 " + s.matched + "/" + s.total;
            if (s.unknown && s.unknown.length) {
              m +=
                "；" +
                s.unknown.length +
                (s.unknown.length >= 15 ? "+" : "") +
                " 条当前目录里没有（说明已保留，命令出现后自动生效）";
            }
            if (j.warnings && j.warnings.length) m += "；" + j.warnings[0];
            m += "。右键命令卡片即可看到。已覆盖" + (coll || "全部集合") + "下原有的说明。";
            setMsg(m);
            setDirty(false);
            setConfirmReset(false);
            if (onSaved) onSaved();
          })
          .catch((e) => setMsg("保存失败：" + (e && e.message ? e.message : e)))
          .finally(() => setBusy(false));
      }

      function reset() {
        if (!confirmReset) {
          setConfirmReset(true);
          setMsg("再点一次「清空」确认：将删除全部自定义说明（所有集合）。");
          return;
        }
        setBusy(true);
        withBase((b) =>
          fetch(b + "/api/notes/reset", { method: "POST" }).then((r) => r.json())
        )
          .then(() => {
            setText("");
            setConfirmReset(false);
            setMsg("已清空全部自定义说明，右键卡片恢复显示技能自带描述。");
            if (onSaved) onSaved();
          })
          .catch((e) => setMsg("清空失败：" + (e && e.message ? e.message : e)))
          .finally(() => setBusy(false));
      }

      return h(
        "div",
        { style: st.editor },
        h(
          "div",
          { style: st.editorHint },
          "每行一条：第一格命令名，第二格说明（直接粘贴 Markdown 表格即可）。",
          h("br"),
          h("span", { style: st.editorCode }, "| **ask-matt** | 技能路由器。不确定该用哪个技能时问它。 |"),
          h("br"),
          "表格表头（`| 命令 | 说明 |`）和分隔行会自动跳过；也兼容 `命令: 说明` 的写法。",
          h("br"),
          "保存后，右键列表里的命令卡片即可查看说明。"
        ),
        h(
          "select",
          {
            style: { ...st.select, width: "100%", flex: "none" },
            value: coll,
            onChange: (e) => switchColl(e.target.value),
            title: "说明归属的集合；选「全部集合」则按命令名匹配，不限集合",
          },
          h("option", { value: "" }, "全部集合（按命令名匹配，不限集合）"),
          collections.map(([c, n]) => h("option", { key: c, value: c }, c + " (" + n + ")"))
        ),
        h("textarea", {
          style: { ...st.textarea, minHeight: 210 },
          value: text,
          spellCheck: false,
          placeholder:
            "| **ask-matt** | 技能路由器。不确定该用哪个技能/流程时问它。 |\n| **code-review** | 双轴代码审查：对照编码规范 + 对照需求 spec。 |",
          onChange: (e) => {
            setText(e.target.value);
            setDirty(true);
          },
        }),
        h(
          "div",
          { style: st.editorRow },
          h(
            "button",
            { style: st.btnPrimary, onClick: save, disabled: busy },
            busy ? "处理中…" : "保存并应用"
          ),
          h(
            "button",
            { style: confirmReset ? st.btnDanger : st.btn, onClick: reset, disabled: busy },
            confirmReset ? "确认清空？" : "清空"
          ),
          h("button", { style: st.btn, onClick: onClose }, "收起")
        ),
        msg ? h("div", { style: st.editorMsg }, msg) : null,
        path ? h("div", { style: st.path }, "保存位置：" + path) : null
      );
    }

    /**
     * 右键信息卡：在命令卡片上点右键弹出，显示这个命令是做什么的。
     * 有自定义说明时优先显示说明，技能自带描述降级为「原始描述」附注。
     * fixed 定位 + 右键时的 clientX/clientY，靠近视口边缘时自动翻转，
     * 避免超出屏幕。左键点别处 / Esc / 滚动列表都会关闭。
     */
    function CommandMenu(props) {
      const c = props.cmd;
      const slash = c.slash || "/" + c.name;
      const hasNote = !!c.note;
      const W = 300; // 与 st.tip.width 保持一致，用于边缘翻转计算
      const H = 220; // 预估高度，用于底部翻转
      const vw = typeof window !== "undefined" ? window.innerWidth : W + 16;
      const vh = typeof window !== "undefined" ? window.innerHeight : H + 16;
      const left = Math.max(4, Math.min(props.x + 2, vw - W - 8));
      const below = props.y + 2 + H < vh - 8;
      const top = below ? props.y + 2 : Math.max(4, props.y - H - 4);
      return h(
        "div",
        {
          style: { ...st.tip, left: left, top: top },
          "data-cmd-menu": "1",
          // 信息卡就开在光标下方，「原地再右键」时事件目标是信息卡自己而不是
          // 卡片——所以右键自身也要关（toggle 手势的必经路径）。
          // document capture 层的 onCtx 对卡内目标直接放行，不会双重处理。
          onContextMenu: (e) => {
            e.preventDefault(); // 压掉浏览器原生菜单
            props.onClose();
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
              flexShrink: 0,
            },
          },
          h("span", { style: st.tipSlash }, slash),
          h(
            "span",
            { style: { display: "flex", alignItems: "center", gap: 4 } },
            h("span", { style: st.tipMeta }, c.collection + " › " + c.category),
            h(
              "button",
              {
                style: st.tipClose,
                title: "关闭",
                onClick: (e) => {
                  e.stopPropagation();
                  props.onClose();
                },
              },
              "✕"
            )
          )
        ),
        h(
          "div",
          { style: st.tipBody },
          hasNote ? c.note : c.description || c.title || "（该技能没有描述）"
        ),
        hasNote && c.description && c.description !== c.note
          ? h("div", { style: st.tipOrig }, "原始描述：" + c.description)
          : null,
        h(
          "div",
          { style: { ...st.tipFoot, flexShrink: 0 } },
          (hasNote ? "自定义说明 · " : "") + "左键卡片把 " + slash + " 插入当前对话"
        )
      );
    }

    function CatalogPanel(props) {
      const dshCtx = props.dshCtx;
      const [base, setBase] = useState(null);
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [loading, setLoading] = useState(false);
      const [coll, setColl] = useState("");
      const [cat, setCat] = useState("");
      const [q, setQ] = useState("");
      const [toast, setToast] = useState("");
      const [editing, setEditing] = useState(""); // "" | "cat" | "note"
      const [menu, setMenu] = useState(null); // { cmd, x, y } —— 右键信息卡

      const load = useCallback((refresh) => {
        setLoading(true);
        setError(null);
        setMenu(null); // 刷新/重取时命令对象会换掉，避免卡片挂着旧数据
        resolveBase()
          .then((b) => {
            if (!b) {
              // 所有候选端口都没有服务：插件没启用或服务没起来
              throw new Error("面板服务未运行（8765-8769 均无响应）");
            }
            setBase(b);
            return fetch(b + "/api/catalog" + (refresh ? "?refresh=1" : ""), {
              cache: "no-store",
            });
          })
          .then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then((j) => setData(j))
          .catch((e) => {
            // 端口可能变了（服务重启/顺延）：清掉缓存，下次重试会重新探测
            cachedBase = null;
            setError(String(e && e.message ? e.message : e));
          })
          .finally(() => setLoading(false));
      }, []);

      useEffect(() => {
        load(false);
      }, [load]);

      useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(""), 1800);
        return () => clearTimeout(t);
      }, [toast]);

      // 信息卡打开期间：左键点别处 / Esc / 滚动任意容器都关闭。
      // 注意：滚动监听用 capture（scroll 不冒泡），且信息卡自身滚动不关。
      useEffect(() => {
        if (!menu) return;
        const onDown = (e) => {
          if (e.button !== 0) return; // 右键由 contextmenu 处理，别在这里关
          const t = e.target;
          // 点信息卡内部（含 ✕ 按钮）不关——✕ 自己会调 onClose
          if (t && t.closest && t.closest("[data-cmd-menu]")) return;
          setMenu(null);
        };
        const onKey = (e) => {
          if (e.key === "Escape") setMenu(null);
        };
        const onScroll = (e) => {
          const t = e.target;
          if (t && t.closest && t.closest("[data-cmd-menu]")) return; // 卡内滚动
          setMenu(null);
        };
        // 右键落在空白处才关。落在卡片上时**不能**在这里 setMenu——contextmenu
        // 是离散事件，React 19 派发前会先 flush 挂起的更新，capture 层的
        // setMenu(null) 会抢先落地，卡片 handler 再跑时看到的就是“没菜单”，
        // toggle 判错反而重新打开（真实浏览器实测，jsdom 时序不同测不出来）。
        // 卡片与信息卡上的右键各自处理，这里放行。
        const onCtx = (e) => {
          const t = e.target;
          if (!t || !t.closest) return;
          if (t.closest("[data-cmd-menu]") || t.closest("[data-cmd-card]")) return;
          setMenu(null);
        };
        // click 兜底：正常浏览器 mousedown 必先于 click，但合成/脚本分发的
        // click 可能没有伴随的 mousedown，这里双保险
        const onClick = (e) => {
          const t = e.target;
          if (t && t.closest && t.closest("[data-cmd-menu]")) return;
          setMenu(null);
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        document.addEventListener("scroll", onScroll, true);
        document.addEventListener("contextmenu", onCtx, true);
        document.addEventListener("click", onClick, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
          document.removeEventListener("scroll", onScroll, true);
          document.removeEventListener("contextmenu", onCtx, true);
          document.removeEventListener("click", onClick, true);
        };
      }, [menu]);

      // 筛选条件变化会让被右键的卡片直接被卸载，主动清掉。
      useEffect(() => {
        setMenu(null);
      }, [coll, cat, q]);

      const commands = (data && data.commands) || [];
      const collections = useMemo(() => {
        const m = new Map();
        for (const c of commands) m.set(c.collection, (m.get(c.collection) || 0) + 1);
        return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      }, [commands]);
      // 分类跟随集合联动：未选集合时没有可显示的分类（用户要求"选择对应合集后，
      // 才开启这个合集下的分类"）
      const categories = useMemo(
        () =>
          coll
            ? Array.from(
                new Set(commands.filter((c) => c.collection === coll).map((c) => c.category))
              ).sort()
            : [],
        [commands, coll]
      );

      const visible = commands.filter((c) => {
        if (coll && c.collection !== coll) return false;
        if (cat && c.category !== cat) return false;
        if (q) {
          const s = (
            c.name +
            " " +
            (c.title || "") +
            " " +
            (c.description || "") +
            " " +
            (c.note || "") +
            " " +
            c.category +
            " " +
            c.collection +
            " " +
            (c.client || "")
          ).toLowerCase();
          if (!s.includes(q.toLowerCase())) return false;
        }
        return true;
      });

      function copy(cmd) {
        const text = cmd.slash || "/" + cmd.name;
        const done = () => setToast("已复制 " + text);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
          fallbackCopy(text, done);
        }
      }

      function fallbackCopy(text, done) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          done();
        } catch (e) {
          setToast("复制失败：" + text);
        }
        document.body.removeChild(ta);
      }

      // 点击技能：优先把 slash 命令插入当前激活会话的对话输入框；
      // 失败（无会话 / 输入框不可编辑 / 服务缺失）时退化为复制到剪贴板。
      // DSH 通道（源自 app.asar 源码 dsh-client-ui-session）：
      //   uiSession.current 是 BindingSource，.value 已经是活动会话的「物化对象」，
      //   其 .props.inputActions 即该会话 facade —— 含 setDraft(text)/captureInsertion()/insertText(text, span)。
      //   （注意：不要再对 .value 调 materialize()，那是把物化结果当 binding 传回，会解析失败。）
      function insertToComposer(cmd) {
        const text = (cmd.slash || "/" + cmd.name) + " ";
        try {
          const uiSession = dshCtx && dshCtx.uiSession;
          let ia = null;
          // 主路径：活动会话的物化 facade
          if (uiSession && uiSession.current && uiSession.current.value) {
            const cur = uiSession.current.value;
            ia = cur.props && cur.props.inputActions;
          }
          // 兜底路径：直接在 app 域取（可能落到无会话的 resident shell，多数情况仍可用）
          if (!ia && uiSession && uiSession.inputActions) ia = uiSession.inputActions;
          if (ia) {
            // setDraft(text) 最稳：直接把整段草稿写入当前对话输入框，无需 span
            if (typeof ia.setDraft === "function") {
              ia.setDraft(text);
              setToast("已插入对话：" + text.trim());
              return;
            }
            // 兼容：caret 处插入（保留已有内容）
            if (typeof ia.captureInsertion === "function" && typeof ia.insertText === "function") {
              const span = ia.captureInsertion();
              if (span && ia.insertText(text, span)) {
                setToast("已插入对话：" + text.trim());
                return;
              }
            }
          }
        } catch (e) {
          console.warn("[dsh-catalog] insert to composer failed:", e);
        }
        copy(cmd);
      }


      const meta = data && data.meta ? data.meta : {};
      const metaCustom = meta.custom || null;
      const metaNotes = meta.notes || null;

      return h(
        "div",
        { style: st.page },
        h(
          "div",
          { style: st.head },
          h(
            "div",
            { style: { minWidth: 0 } },
            h("div", { style: st.title }, TITLE),
            h(
              "div",
              { style: st.sub },
              data
                ? (meta.total_collections || 0) +
                  " 集合 / " +
                  (meta.total_categories || 0) +
                  " 分类 / " +
                  (meta.total_commands || 0) +
                  " 命令（DSH）" +
                  (metaCustom && metaCustom.rules
                    ? " · 自定义分类 " + metaCustom.rules + " 组生效"
                    : "") +
                  (metaNotes && metaNotes.applied
                    ? " · 说明 " + metaNotes.applied + " 条"
                    : "")
                : "加载中…"
            )
          ),
          h(
            "div",
            { style: { display: "flex", gap: 6, alignItems: "center" } },
            toast ? h("span", { style: st.toast }, toast) : null,
            h(
              "button",
              {
                style: {
                  ...st.btn,
                  ...(editing === "cat"
                    ? {
                        borderColor: "var(--dsw-alias-state-primary, #165dff)",
                        color: "var(--dsw-alias-state-primary, #165dff)",
                      }
                    : null),
                },
                onClick: () => setEditing(editing === "cat" ? "" : "cat"),
                title: "自定义分类：粘贴「分类名 /命令 …」批量导入，保存后刷新也不丢",
              },
              editing === "cat" ? "✕ 收起" : "⚙ 分类"
            ),
            h(
              "button",
              {
                style: {
                  ...st.btn,
                  ...(editing === "note"
                    ? {
                        borderColor: "var(--dsw-alias-state-primary, #165dff)",
                        color: "var(--dsw-alias-state-primary, #165dff)",
                      }
                    : null),
                },
                onClick: () => setEditing(editing === "note" ? "" : "note"),
                title: "自定义命令说明：粘贴「| **命令** | 说明 |」表格，右键命令时优先显示",
              },
              editing === "note" ? "✕ 收起" : "✎ 说明"
            ),
            h(
              "button",
              { style: st.btn, onClick: () => load(true), disabled: loading, title: "重新扫描技能目录" },
              loading ? "刷新中…" : "↻ 刷新"
            )
          )
        ),
        editing === "cat"
          ? h(CategoryEditor, {
              base: base,
              collections: collections,
              defaultColl: coll,
              onSaved: () => load(false),
              onClose: () => setEditing(""),
            })
          : null,
        editing === "note"
          ? h(NoteEditor, {
              base: base,
              collections: collections,
              defaultColl: coll,
              onSaved: () => load(false),
              onClose: () => setEditing(""),
            })
          : null,
        h(
          "div",
          { style: st.filters },
          h(
            "select",
            {
              style: st.select,
              value: coll,
              onChange: (e) => {
                setColl(e.target.value);
                setCat(""); // 换集合后重置分类（分类依赖集合）
              },
            },
            h("option", { value: "" }, "全部集合"),
            collections.map(([c, n]) => h("option", { key: c, value: c }, c + " (" + n + ")"))
          ),
          h(
            "select",
            {
              style: { ...st.select, opacity: coll ? 1 : 0.55, cursor: coll ? "pointer" : "not-allowed" },
              value: cat,
              disabled: !coll,
              title: coll ? "该集合下的分类" : "请先选择集合",
              onChange: (e) => setCat(e.target.value),
            },
            coll
              ? [h("option", { key: "", value: "" }, "全部分类")].concat(
                  categories.map((c) => h("option", { key: c, value: c }, c))
                )
              : [h("option", { key: "none", value: "" }, "请先选择集合")]
          ),
          h("input", {
            style: st.search,
            placeholder: "搜索命令 / 标题 / 描述…",
            value: q,
            onChange: (e) => setQ(e.target.value),
          })
        ),
        error
          ? h(
              "div",
              { style: { padding: 16, fontSize: 12, lineHeight: 1.6 } },
              h("div", { style: { fontWeight: 600, marginBottom: 6 } }, "无法连接面板服务"),
              h("div", { style: { opacity: 0.75 } }, "请确认 DSH 插件已启用（宿主半侧会自动拉起本地服务）。"),
              h("div", { style: { opacity: 0.6, marginTop: 6 } }, "错误：" + error),
              h("button", { style: { ...st.btn, marginTop: 10 }, onClick: () => load(false) }, "重试")
            )
          : h(
              "div",
              { style: st.list },
              visible.length === 0
                ? h("div", { style: st.empty }, data ? "没有匹配的命令" : "加载中…")
                : visible.slice(0, 500).map((c, i) =>
                    h(
                      "div",
                      {
                        key: (c.slash || c.name) + i,
                        style: {
                          ...st.card,
                          // 有自定义说明的卡片左侧加一条主色标记，一眼可辨
                          ...(c.note
                            ? {
                                borderLeft:
                                  "3px solid var(--dsw-alias-state-primary, #165dff)",
                                paddingLeft: 7,
                              }
                            : null),
                        },
                        onClick: () => insertToComposer(c),
                        "data-cmd-card": c.name,
                        onContextMenu: (e) => {
                          e.preventDefault(); // 压掉浏览器原生菜单
                          // toggle：再右键同一张卡片 = 关闭；右键别的卡片 = 换内容。
                          // 用函数式更新读最新 state——闭包值可能已被 capture 层
                          // 的更新冲刷掉（见 onCtx 注释），不能信。
                          setMenu((prev) =>
                            prev && prev.cmd === c
                              ? null
                              : { cmd: c, x: e.clientX, y: e.clientY }
                          );
                        },
                      },
                      h(
                        "div",
                        { style: st.slash },
                        c.slash || "/" + c.name,
                        c.note ? h("span", { style: st.noteBadge }, "已备注") : null
                      ),
                      h(
                        "div",
                        { style: st.meta },
                        "[" + c.collection + " › " + c.category + "] " + (c.title || "") + (c.client ? " · " + c.client : "")
                      )
                    )
                  ),
              menu ? h(CommandMenu, { cmd: menu.cmd, x: menu.x, y: menu.y, onClose: () => setMenu(null) }) : null
            )
      );
    }

    function apply(ctx) {
      // 「在右侧打开」动作在拿到对应服务后构造（可选服务，缺失则底部按钮不注册）
      let openRightFn = null;

      // ---- 唯一入口：侧边栏底部按钮 -> 右列窄侧边栏，与对话并存、不遮蔽对话框 ----
      // layout / sidebarRightTabs / sidebarRight 均按可选服务注入：
      // 缺失时（如未装 ui-sidebar-right 的 profile）整个插件静默不注册 UI。
      try {
        ctx.inject(["layout", "sidebarRightTabs", "sidebarRight"], (injected) => {
          const layout = injected.get("layout");
          const tabs = injected.get("sidebarRightTabs");
          const sidebarRight = injected.get("sidebarRight");
          const disposers = [];
          console.log(
            "[dsh-catalog] services:",
            "layout=" + !!layout,
            "sidebarRightTabs=" + !!tabs,
            "sidebarRight=" + !!sidebarRight
          );

          // 构造「在右侧打开」动作（面板内按钮与侧边栏底部按钮共用）
          if (
            layout &&
            typeof layout.openRightbar === "function" &&
            sidebarRight &&
            typeof sidebarRight.openTab === "function"
          ) {
            openRightFn = () => {
              layout.openRightbar(420, false);
              sidebarRight.openTab("dsh-catalog");
            };
          } else {
            console.warn(
              "[dsh-catalog] 右列服务不完整：",
              "layout=" + !!layout,
              "sidebarRight=" + !!sidebarRight
            );
          }

          if (tabs && typeof tabs.register === "function") {
            disposers.push(
              tabs.register({
                id: "dsh-catalog",
                kind: "dsh-catalog",
                keepMounted: true,
                priority: "extension",
                title: () => TITLE,
                guide: [
                  {
                    id: "dsh-catalog",
                    order: 100,
                    title: () => TITLE,
                  },
                ],
              })
            );
          }

          // 右列 tab 体：自适应右列轨道宽度
          disposers.push(
              ctx.slots.inject("sidebar.right.pane.tab", () =>
                ctx.slots.register(
                  {
                    name: "sidebar.right.pane.tab",
                    key: "dsh-catalog",
                  },
                  function RightPanel() {
                    return h(CatalogPanel, { dshCtx: ctx });
                  }
                )
              )
          );

          // 侧边栏底部动作按钮：点击即展开右列并打开技能目录 tab
          if (openRightFn) {
            disposers.push(
              ctx.slots.inject("sidebar.footer.action", () =>
                ctx.slots.register(
                  {
                    name: "sidebar.footer.action",
                    id: "dsh-catalog",
                    order: 100,
                    label: () => TITLE,
                  },
                  function FooterAction(props) {
                    const wide = !!(props && props.wide);
                    return h(
                      "button",
                      {
                        type: "button",
                        title: TITLE,
                        onClick: () => {
                          try {
                            openRightFn();
                          } catch (e) {
                            console.error("[dsh-catalog] footer action failed:", e);
                          }
                        },
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          padding: wide ? "6px 8px" : 6,
                          borderRadius: 6,
                          fontSize: 13,
                          width: wide ? "100%" : 32,
                          height: 32,
                        },
                      },
                      h(CatalogIcon, { size: 18 }),
                      wide ? h("span", null, TITLE) : null
                    );
                  }
                )
              )
            );
          }

          return () => {
            for (const d of disposers) {
              try {
                d();
              } catch (e) {
                // ignore
              }
            }
          };
        });
      } catch (e) {
        // 右列不可用时静默跳过
      }
    }

    return {
      // inject 规则（两次踩坑后定论）：
      // 1) 不能写 "uiSession?" —— DSH boot loader 无可选语法，会把带问号的字符串
      //    当字面服务名永久等待 -> 插件 pending -> web boot 失败；
      // 2) 也不能完全不声明 —— cordis 禁止未 inject 的属性访问，
      //    运行时抛 "cannot get property 'uiSession' without inject"。
      // uiSession 是真实核心服务（UiSession 构造器 super(ctx, "uiSession")），正常注入即可。
      inject: ["slots", "uiSession"],
      apply,
    };
  },
});
