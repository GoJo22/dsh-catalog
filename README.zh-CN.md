# dsh-skill-catalog

DeepSeek Harness（DSH）**插件**（非 skill）：把 DSH 能读到的 skills 统一扫描、
归并、可视化，解决「skills 太多、不知道哪个命令属于哪个来源」的痛点。
DSH 原生支持「/」调用，因此本插件只负责**分类与浏览**，不再生成任何斜杠命令。

[English](README.md) | 中文

## 能力

- **单一入口**：DSH 左侧边栏**底部**（设置旁）的「技能目录」按钮，点击即在右侧展开
  **窄面板**，与对话并存、**不遮蔽对话框**。
- **只扫 DSH 技能根目录下的内容**：`~/.dsh/skills`、`~/.agents/skills` 直下一层
  的每个子项各成一个合集（单技能目录、`skills/` 技能包、散装 `.md`），收录规则
  逐条对齐 DSH 源码与技能包 provider 的实载规则，DSH 不加载的绝不列。
- **刷新**：「↻ 刷新」触发真实重扫，重新读取磁盘上的 SKILL.md；端口冲突时自动顺延
  （8765→8769），客户端顺序探测候选端口、命中即停。
- **点击插入对话**：面板中点击命令卡片即把 `/命令` 直接写入**当前对话输入框**
  （经 DSH `uiSession.current.value.props.inputActions` 通道，精确命中当前激活会话的
  composer，优先 `setDraft(text)` 整段写入；若对话输入框不可用或服务缺失，则回退为复制到剪贴板）。
- **右键看说明**：在命令卡片上**点右键**弹出信息卡，显示这个命令是做什么的
  （有自定义说明时优先显示，见下节）；靠近视口边缘自动翻转；再右键同一张卡片即关闭，
  其它关闭方式：左键点别处、按 Esc、滚动列表、点卡片上的 ✕。
- **原生 tool `dsh_catalog`**：在对话里直接问「/estimate 是什么」「我装了哪些技能」，
  返回三级分类目录（集合 › 分类 › 命令）与匹配结果，并给出面板地址。
- **自定义分类（可保存、持久化）**：面板「⚙ 分类」里粘贴「分类名 + 命令」批量导入，
  一次保存长期生效——详见下方[「自定义分类」](#自定义分类)。
- **自定义命令说明（可保存、持久化）**：面板「✎ 说明」里粘贴 Markdown 表格批量导入，
  之后**右键命令卡片**弹出的信息卡就显示你写的说明（技能自带描述降级为「原始描述」
  附注），有说明的命令会带蓝色标记和「已备注」角标——详见[「自定义命令说明」](#自定义命令说明)。

## 扫描来源

| 来源 | 技能位置（扫描根） | 解析方式 |
|---|---|---|
| DeepSeek Harness | `~/.dsh/skills`、`~/.agents/skills`（root 直下一层每个子项 = 一个集合） | skill_md |

三级结构：**集合 › 分类 › 命令**。核心规则（对齐「DSH 怎么读 skills」）：

- **集合 = 技能根目录直下一层的文件名**。DSH 读取 skills 的根是 `~/.dsh/skills`、
  `~/.agents/skills`（另有项目级 `<project>/.dsh/skills`、`<project>/.agents/skills`，
  本插件暂不扫项目级），根下每个子项各成一个集合：
  - `<root>/<name>/SKILL.md` —— 单技能集合（如 `agent-reach`）
  - `<root>/<name>/skills/<s>/SKILL.md` —— 技能包集合，包内每个技能一条命令
  - `<root>/<name>.md` —— 散装技能集合（集合名取文件干名）
  - 纯资源目录（两种布局都没有）整个跳过
- **分类** 有三层来源，**优先级由高到低**：
  1. **自定义分类**（用户在面板「⚙ 分类」粘贴保存，见下节）
  2. 技能 frontmatter 的 `category`
  3. **自动分类**——从 name + description 提取关键词（加权、去停用词），按「主话题
     一致」自动聚类：两个技能共享某个在双方都是 top-1 的实词即归为一组，组名取该
     共享词；只有一个技能的组取其 description 最高频实词，分类名不复述技能名。
     **零配置、零规则表**。
  分类下拉**联动集合**：必须先选集合，才会展开该集合下的分类。
  命令说明另有独立来源：用户保存的自定义说明（见下节）。
- **命令** = 技能名（`/name`）。收录规则对齐 DSH 源码（`isPotentialSkillPath`
  限定相对 root 最多 2 段）+ 技能包 provider 的实载规则：
  - 单技能/散装：frontmatter 必须同时含 `name` 和 `description`，且 `name` 必须
    kebab-case（`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`）
  - 技能包内：frontmatter 必须含 `name` 和 `description`，且 `name` === 目录名

## 自定义分类

自动聚类是零配置的兜底，但如果你对某个技能库有**自己想要的分类口径**（例如某个
74 命令的技能库分成 Onboarding / Game Design / QA & Testing 等 12 组），可以在面板里
**粘贴一次，长期生效**。

### 怎么用

1. 面板右上角点 **「⚙ 分类」** 展开编辑器；
2. 选择分类归属的**集合**（默认跟随当前筛选的集合；选「全部集合」则按命令名匹配、
   不限集合）；
3. 粘贴下面的格式，**每行一个分类**：分类名写前面，后面跟该分类下的命令；

```
Onboarding & Navigation /start /help /project-stage-detect /setup-engine /adopt /settings
Game Design /brainstorm /map-systems /design-system /quick-design
QA & Testing /qa-plan /smoke-check /soak-test /regression-suite
```

4. 点 **「保存并应用」**。保存后会提示解析了多少分类/命令、其中多少条在当前目录中命中。

解析规则很宽松：以 `/` 开头的 token 视为命令，其余合并成分类名（所以
`Onboarding & Navigation`、`艺术与资产` 这类带空格和 `&` 的名字直接写即可）；行首的
`-`、`1.`、`#`、反引号会自动忽略；命令在整个分类内自动去重；顺序按你粘贴的顺序保留，
回填到编辑器时和原文一致。

### 为什么刷新 / 插件增删都不会丢

| 场景 | 机制 |
|---|---|
| 点「↻ 刷新」 | 刷新只是重新扫 SKILL.md；每次构建目录都会**重新读盘**应用自定义分类 |
| 重进客户端 / 重启 DSH | 规则在磁盘上，与进程无关 |
| 卸载/更新本插件 | 规则存在 `~/.dsh-catalog/`，**不在插件安装目录**，也不在 `assets/` 运行时产物里 |
| 其它插件被删除 | 规则按**命令名**存储，只做匹配不做过滤：命令暂时找不到时规则原样保留，插件装回来自动恢复 |
| 安装新插件 | 新命令不在规则里：严格模式下归入 `(未分类)`，否则走自动聚类 |

> 插件早期版本（名 skill-catalog）的数据存在 `~/.skill-catalog/`，首次读写时会
> **自动搬迁**到 `~/.dsh-catalog/`（只搬不删、不覆盖已有文件），旧目录可自行清理。

### 存储位置与格式

`~/.dsh-catalog/categories.json`（首次保存自动创建）：

```json
{
  "version": 1,
  "updated_at": "2026-01-01T00:00:00",
  "rules": [
    {
      "collection": "my-game-skills",
      "category": "Game Design",
      "commands": ["brainstorm", "map-systems", "design-system"]
    }
  ],
  "strict_collections": ["my-game-skills"]
}
```

- `collection` 为空串 = 全局规则，按命令名匹配、不限集合。
- `strict_collections`：这些集合里**未被任何规则列出的命令**统一归入 `(未分类)`，
  不再保留自动聚类的结果（对应编辑器里的勾选框）。想让新技能继续走自动聚类，取消勾选即可。
- 文件损坏时自动备份为 `*.corrupt-<时间戳>.json` 并按空规则继续运行，不会卡住扫描。

### HTTP API

面板走的就是这几个接口（服务只监听 `127.0.0.1`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/custom?collection=X` | 读取已保存规则，并回传可编辑的粘贴格式文本 |
| POST | `/api/custom` | 保存。body: `{ text \| rules, collection, strict, mode }`，`mode` 为 `replace`（默认，覆盖同集合旧规则）或 `merge`（合并） |
| POST | `/api/custom/reset` | 清空全部自定义分类 |

## 自定义命令说明

技能自带的 description 常常是英文一句话，看不出到底该怎么用。这个功能让你**自己写
一份说明**，右键命令卡片时优先显示。

### 怎么用

1. 面板右上角点 **「✎ 说明」**；
2. 选集合，粘贴下面这种表格（技能清单最常见的形态，直接复制即可）：

```
| 命令 | 说明 |
|---|---|
| **ask-matt** | 技能路由器。不确定该用哪个技能/流程时问它。 |
| **code-review** | 双轴代码审查：对照编码规范 + 对照需求 spec，并行子代理审查后并排报告。 |
```

3. 点 **「保存并应用」**，之后右键命令卡片就会弹出信息卡显示你写的说明。

解析规则：按 `|` 分格，第一格取命令名（自动去掉 `**`、反引号、`/` 前缀），
其余合并为说明；**表头行（`| 命令 | 说明 |`）和 `|---|---|` 分隔行自动跳过**；
也兼容 `命令: 说明` 与 `命令␣␣说明`（两个以上空格）的写法。顺序按粘贴顺序保留，
回填到编辑器时是同样的表格格式，可直接改。

### 显示规则

| 情况 | 右键信息卡显示 |
|---|---|
| 有自定义说明 | 你的说明（正文）；技能自带 description 作为「原始描述」附注在下方 |
| 无自定义说明 | 技能自带的 description（与之前一致） |

信息卡为 fixed 定位，跟随右键时的光标坐标弹出，靠近视口右/下边缘时自动翻转；
长说明在卡内滚动。**再右键同一张卡片即关闭**（toggle）；右键别的卡片直接换内容。
其他关闭方式：左键点别处、按 Esc、滚动列表，或点卡片上的 ✕。

有说明的命令在列表里会带**左侧蓝色标记**和 **「已备注」角标**；搜索框也会把
自定义说明纳入匹配范围。

### 持久化

与自定义分类完全同一套机制：存在 `~/.dsh-catalog/notes.json`（**不在插件安装目录、
不在 `assets/` 里**），每次构建目录重新读盘应用，所以刷新、重进、重装本插件、
增删其它插件都不影响。说明按**命令名**存储，命令暂时找不到时原样保留，插件装回来
自动恢复。

```json
{
  "version": 1,
  "updated_at": "2026-01-01T00:00:00",
  "notes": [
    { "collection": "dsh-mattpocock-skills", "command": "ask-matt", "note": "技能路由器…" }
  ]
}
```

`collection` 为空串 = 全局，按命令名匹配、不限集合。

### HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/notes?collection=X` | 读取已保存说明，并回传可编辑的表格文本 |
| POST | `/api/notes` | 保存。body: `{ text \| notes, collection, mode }` |
| POST | `/api/notes/reset` | 清空全部自定义说明 |

## 安装（DSH 插件）

```bash
# 发布到 npm 后（推荐）：
dsh plugin --profile web      add dsh-skill-catalog
dsh plugin --profile desktop  add dsh-skill-catalog

# 或本地链接（任选 profile；web 对应 dsh web，desktop 对应 DSH 桌面客户端）：
dsh plugin --profile web      add "link:/绝对路径/dsh-skill-catalog"
dsh plugin --profile desktop  add "link:/绝对路径/dsh-skill-catalog"

# 验证已注册
dsh web --dump-config | findstr dsh-skill-catalog
dsh web                      # 重启 harness
```

卸载：`dsh plugin --profile web remove dsh-skill-catalog`

面板 UI 依赖右侧边栏服务（`@deepseek-ai/dsh-client-ui-sidebar-right`）；
没有该服务的 profile 仍可使用 tool 与 HTTP 服务，只是不显示面板。

## 配置

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `DSH_CATALOG_PORT` | `8765` | 面板服务首选端口（冲突时自动顺延：8765→8769）。侧边栏面板只自动发现 **8765–8769** 区间内的端口；把服务挪到区间外（如 9000）时面板连不上，但可直接浏览器访问该端口调 API |

自定义分类的保存位置见[「自定义分类」](#自定义分类)（`~/.dsh-catalog/categories.json`，
在面板里编辑，不用手改）。

### 纳入其它位置的技能库

扫描根固定为 DSH 自己的两个技能根：`~/.dsh/skills`、`~/.agents/skills`。
要把别处的技能库（例如 `D:\path\to\skills`）纳入进来，用**链接**挂进去即可，无需改代码：

```powershell
# 形态一（推荐）：父目录真实、里面 skills 指向目标
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills\MyLib"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.agents\skills\MyLib\skills" `
                            -Target "D:\path\to\skills"
```

三种链接形态都能被识别（扫描器会自动判断，**不会再因为形态不对而整项消失**）：

| 形态 | 结构 | 识别结果 |
|---|---|---|
| 技能包 | `<name>/skills/<s>/SKILL.md` | 包内每个技能一条命令 |
| 折叠链接 | `<name>/<s>/SKILL.md`（链接直指 `skills/` 目录） | 同上，按目录名校验 |
| 单技能 | `<name>/SKILL.md` | 一条命令 |

## 在 DSH 里使用

- 侧边栏：点击 DSH 左侧边栏的「技能目录」书本图标，主面板即打开可视化目录。
- 对话：调用 `dsh_catalog`（可传 `query` / `collection` / `refresh`）。
- 点击插入：面板中点击命令卡片会把 `/命令` 直接写入当前对话输入框（失败则复制到剪贴板），
  写入后直接回车即可调用。

## 隐私说明

- 面板服务只监听 `127.0.0.1` 回环地址，不对外暴露。
- 扫描产物 `assets/command-catalog.json` 含本机绝对路径，属运行时产物，已在
  `.gitignore` 中排除；仓库中不含任何本机路径或个人信息的硬编码。
- 个性化入口在**仓库外**按需设置：自定义分类保存在 `~/.dsh-catalog/categories.json`，
  含本机集合名与命令名，不随仓库分发。
- 自动分类完全由技能自身的 name/description 驱动，不上传、不请求任何外部服务。

## 结构

```
dsh-catalog/
  package.json          DSH 插件清单（含 dsh.bundle.patch / dsh.client）
  cordis.patch.yml      插件注册（bundle insert）
  lib/index.js          Cordis 宿主入口：注册 tool + 启动面板服务
  lib/scan.js           DSH 技能扫描器（无第三方依赖，Node 移植版）：
                         技能根目录直下一层子项 = 合集（单技能/技能包/散装），
                         动态聚类分类 + 应用自定义分类
  lib/customCategories.js  自定义分类：持久化（~/.dsh-catalog/categories.json）、
                         粘贴解析、覆盖应用
  lib/customNotes.js    自定义命令说明：持久化（~/.dsh-catalog/notes.json）、
                         表格解析、右键信息卡展示
  lib/store.js          用户数据目录 + 旧位置（~/.skill-catalog）自动迁移
  lib/server.js         面板数据 HTTP 服务（/api/catalog、/api/refresh、/api/mode、
                         /api/custom 读写、/api/custom/reset、
                         /api/notes 读写、/api/notes/reset）
  client.js             DSH 浏览器半侧入口：window.__ModuleLoader__.load 注册
                         侧边栏图标（sidebar.footer.action）+ 右列面板（sidebarRight），
                         React 组件原生渲染，数据经 /api/catalog 获取
  assets/icon.svg       插件/侧边栏图标
  assets/command-catalog.json  扫描产物（运行时生成，已 gitignore）
```

## 扩展：新增一个扫描来源

在 `lib/scan.js` 的 `SOURCES` 列表里追加一条记录，无需改动解析逻辑。
`collection` 一般**不写**——集合名由 roots 实际命中的目录自动推导（见上节）：

```js
{
  client: "My Source",
  kind: "skill_md",            // DSH 技能根目录源
  roots: ["~/.mysource/skills"],
  // collection: "显式集合名", // 仅非目录源（自定义 catalog 文件）需要
}
```

## 许可证

[MIT](LICENSE)
