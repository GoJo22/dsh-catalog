# dsh-skill-catalog

A **DeepSeek Harness (DSH) plugin** (not a skill): scan every skill your DSH can
load, merge them into one browsable catalog, and put it in a sidebar panel —
solving "too many skills, no idea which command comes from which source".
DSH natively supports `/` invocation, so this plugin only does **cataloging and
browsing** — it registers no slash commands of its own.

English | [中文](README.zh-CN.md)

## Features

- **Single entry point**: a button at the **bottom of the DSH left sidebar**
  (next to Settings) opens a **narrow panel** on the right that sits beside the
  conversation instead of covering it.
- **Scans exactly what DSH can load**: every direct child of `~/.dsh/skills`
  and `~/.agents/skills` becomes a collection (single-skill directory,
  `skills/` skill pack, or loose `.md`). Inclusion rules mirror DSH's own
  source and skill-pack provider loading rules — if DSH won't load it, it is
  not listed.
- **Refresh**: the ↻ button re-scans `SKILL.md` from disk.
- **Click to insert**: clicking a command card writes `/command` straight into
  the **current conversation input** (via DSH's
  `uiSession.current.value.props.inputActions`, preferring `setDraft(text)`);
  falls back to copying to the clipboard when the composer is unavailable.
- **Right-click for details**: right-click a command card for an info card
  explaining what it does (your custom note takes precedence — see below).
  The card flips away from viewport edges; it closes on left-click elsewhere,
  Esc, list scroll, the ✕ button, or right-clicking the same card again.
- **Native tool `dsh_catalog`**: ask in chat "what is /estimate" or "which
  skills do I have" and get the three-level catalog (collection › category ›
  command) plus the panel address.
- **Custom categories (saved, persistent)**: paste "category + commands" in
  the panel's ⚙ Categories editor — saved once, effective forever. See
  [Custom categories](#custom-categories).
- **Custom command notes (saved, persistent)**: paste a Markdown table in the
  panel's ✎ Notes editor; right-clicking a command then shows your note (the
  skill's own description is kept as an "original description" footnote), and
  noted commands carry a blue marker and a "noted" badge. See
  [Custom command notes](#custom-command-notes).

## Scan sources

| Source | Skill location (scan roots) | Parser |
|---|---|---|
| DeepSeek Harness | `~/.dsh/skills`, `~/.agents/skills` (each direct child = one collection) | skill_md |

Three-level structure: **collection › category › command**. Core rules
(mirroring "how DSH reads skills"):

- **Collection = the file name one level below a skills root.** DSH reads
  skills from `~/.dsh/skills` and `~/.agents/skills` (project-level
  `<project>/.dsh/skills` and `<project>/.agents/skills` exist too; this
  plugin does not scan those yet). Each direct child is a collection:
  - `<root>/<name>/SKILL.md` — single-skill collection
  - `<root>/<name>/skills/<s>/SKILL.md` — skill-pack collection, one command
    per skill inside the pack
  - `<root>/<name>.md` — loose skill collection (name = file stem)
  - pure resource directories (neither layout) are skipped entirely
- **Category** has three sources, highest priority first:
  1. **Custom categories** saved in the panel (see below)
  2. the skill frontmatter's `category`
  3. **Auto-categorization** — keyword extraction from name + description
     (weighted, stop-worded), grouped by "same primary topic". Zero config,
     zero rule tables.
  The category dropdown is **linked to the collection**: pick a collection
  first, then its categories appear.
- **Command** = the skill name (`/name`). Inclusion rules mirror DSH's source
  (`isPotentialSkillPath`, max 2 path segments below the root) plus the
  skill-pack provider's loading rules.

## Custom categories

Auto-categorization is the zero-config fallback, but if you have **your own
taxonomy** for a skill library (e.g. 74 commands split into Onboarding /
Game Design / QA & Testing), paste it once in the panel and it sticks.

### How to

1. Click **⚙ Categories** at the top right of the panel;
2. pick the **collection** the rules belong to (defaults to the current
   filter; "All collections" matches by command name across collections);
3. paste lines of the form **category name followed by its commands**:

```
Onboarding & Navigation /start /help /project-stage-detect /adopt /settings
Game Design /brainstorm /map-systems /design-system /quick-design
QA & Testing /qa-plan /smoke-check /soak-test /regression-suite
```

4. Click **Save & apply**. The panel reports how many categories/commands
   were parsed and how many matched the current catalog.

Parsing is lenient: tokens starting with `/` are commands, everything else
merges into the category name (so names with spaces and `&` like
`Onboarding & Navigation` work as-is); leading `-`, `1.`, `#` and backticks
are stripped; commands dedupe within a category; **order is preserved** —
what you paste is what the editor shows when you reopen it.

### Why refresh / plugin installs & removals never lose it

| Scenario | Mechanism |
|---|---|
| Click ↻ Refresh | Refresh only re-scans `SKILL.md`; every catalog build re-reads and re-applies your rules |
| Reopen the client / restart DSH | Rules live on disk, independent of any process |
| Uninstall/update this plugin | Rules live in `~/.dsh-catalog/`, **not** in the plugin directory and not in the `assets/` runtime artifact |
| Another plugin is removed | Rules are stored **by command name** and only match, never filter: a missing command keeps its rule and recovers automatically when the plugin returns |
| Install a new plugin | Commands not in any rule go to `(Uncategorized)` in strict mode, otherwise auto-categorization |

### Storage location and format

`~/.dsh-catalog/categories.json` (created on first save):

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

- `collection` empty = global rule (matches by command name, any collection).
- `strict_collections`: commands in these collections that no rule lists all
  go to `(Uncategorized)`, dropping auto-categorization (the checkbox in the
  editor). Uncheck to let new skills keep auto-categorizing.
- If the file is corrupted it is backed up as `*.corrupt-<timestamp>.json`
  and scanning continues with empty rules.

### HTTP API

The panel talks to these endpoints (the server listens on `127.0.0.1` only):

| Method | Path | Description |
|---|---|---|
| GET | `/api/custom?collection=X` | Read saved rules; also returns an editable paste-format text |
| POST | `/api/custom` | Save. body: `{ text \| rules, collection, strict, mode }`, `mode` = `replace` (default) or `merge` |
| POST | `/api/custom/reset` | Clear all custom categories |

## Custom command notes

A skill's own description is often one English sentence that doesn't tell you
how to use it. This feature lets you **write your own note**, shown on
right-click.

### How to

1. Click **✎ Notes** at the top right of the panel;
2. pick a collection and paste a table like this (the most common shape of a
   skill list — copy it straight in):

```
| Command | Note |
|---|---|
| **ask-matt** | Skill router. Ask it when unsure which skill/flow to use. |
| **code-review** | Dual-axis code review: repo standards + requirement spec, parallel subagents, side-by-side report. |
```

3. Click **Save & apply**; right-clicking a command card now shows your note.

Parsing: split on `|`, the first cell is the command name (`**`, backticks
and a leading `/` are stripped), the rest merges into the note; **header rows
(`| Command | Note |`) and `|---|---|` separator rows are skipped
automatically**; `name: note` and `name␣␣note` (two or more spaces) also
work. Order is preserved and round-trips into the same table format.

### Display rules

| Case | Right-click info card shows |
|---|---|
| Custom note exists | Your note (body); the skill's description as an "original description" footnote |
| No custom note | The skill's own description (as before) |

The info card is `position: fixed`, follows the cursor, and flips back inside
the viewport near edges; long notes scroll inside the card. **Right-click the
same card again to close** (toggle); right-clicking a different card switches
content. Other ways to close: left-click elsewhere, Esc, scroll the list, or
the ✕ on the card.

Noted commands carry a **blue left marker** and a **"noted" badge**, and the
search box matches note text too.

### Persistence

Same mechanism as custom categories: stored in `~/.dsh-catalog/notes.json`
(**not** in the plugin directory, **not** in `assets/`), re-read on every
catalog build — refresh, reopen, reinstall, and other plugins' installs or
removals don't affect it. Notes are stored **by command name** and kept while
a command is missing.

```json
{
  "version": 1,
  "updated_at": "2026-01-01T00:00:00",
  "notes": [
    { "collection": "dsh-mattpocock-skills", "command": "ask-matt", "note": "Skill router…" }
  ]
}
```

`collection` empty = global (matches by command name, any collection).

### HTTP API

| Method | Path | Description |
|---|---|---|
| GET | `/api/notes?collection=X` | Read saved notes; also returns an editable table text |
| POST | `/api/notes` | Save. body: `{ text \| notes, collection, mode }` |
| POST | `/api/notes/reset` | Clear all custom notes |

## Install (DSH plugin)

```bash
# From npm (once published):
dsh plugin --profile web      add dsh-skill-catalog
dsh plugin --profile desktop  add dsh-skill-catalog

# Or from a local checkout (any profile; web = dsh web, desktop = DSH desktop client):
dsh plugin --profile web      add "link:/absolute/path/to/dsh-skill-catalog"
dsh plugin --profile desktop  add "link:/absolute/path/to/dsh-skill-catalog"

# Verify registration
dsh web --dump-config | findstr dsh-skill-catalog
dsh web                      # restart the harness
```

Uninstall: `dsh plugin --profile web remove dsh-skill-catalog`

The panel UI needs the right-sidebar services
(`@deepseek-ai/dsh-client-ui-sidebar-right`). Profiles without them still get
the tool and the HTTP service — only the panel stays hidden.

## Configuration

| Env var | Default | Description |
|---|---|---|
| `DSH_CATALOG_PORT` | `8765` | Preferred port for the panel server (falls back 8765→8769 on conflict). The sidebar panel auto-discovers ports in the **8765–8769** range only; moving the server outside that range (e.g. 9000) breaks panel discovery, though the API stays reachable at that port directly |

Custom data locations are documented under
[Custom categories](#custom-categories) (`~/.dsh-catalog/categories.json`,
edited in the panel, not by hand).

### Including skill libraries from elsewhere

Scan roots are fixed to DSH's own two skills roots: `~/.dsh/skills` and
`~/.agents/skills`. To bring a library from elsewhere (e.g. `D:\path\to\skills`)
into the catalog, link it in — no code changes needed:

```powershell
# Recommended shape: real parent directory, skills inside points at the target
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills\MyLib"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.agents\skills\MyLib\skills" `
                            -Target "D:\path\to\skills"
```

All three link shapes are recognized (the scanner detects the layout, so a
link can no longer make a whole entry vanish):

| Shape | Structure | Result |
|---|---|---|
| Skill pack | `<name>/skills/<s>/SKILL.md` | one command per skill in the pack |
| Folded link | `<name>/<s>/SKILL.md` (link points directly at `skills/`) | same, validated by directory name |
| Single skill | `<name>/SKILL.md` | one command |

## Using it in DSH

- Sidebar: click the book icon at the bottom of the DSH left sidebar to open
  the visual catalog.
- Chat: call `dsh_catalog` (accepts `query` / `collection` / `refresh`).
- Click-to-insert: clicking a command card writes `/command` into the current
  conversation input (or copies it); press Enter to invoke.

## Privacy

- The panel server listens on `127.0.0.1` loopback only, never exposed.
- The scan artifact `assets/command-catalog.json` contains local absolute
  paths; it is a runtime artifact and excluded via `.gitignore`. The
  repository contains no hardcoded local paths or personal data.
- Personalization lives **outside the repository**: custom categories in
  `~/.dsh-catalog/categories.json` (local collection and command names, not
  distributed with the repo).
- Auto-categorization is driven entirely by each skill's own
  name/description; nothing is uploaded and no external service is contacted.

## Structure

```
dsh-catalog/
  package.json          Plugin manifest (dsh.bundle.patch / dsh.client)
  cordis.patch.yml      Plugin registration (bundle insert)
  lib/index.js          Cordis host entry: registers the tool + starts the panel server
  lib/scan.js           DSH skill scanner (no third-party deps, Node port):
                        direct children of skills roots = collections
                        (single skill / skill pack / loose), auto-categorization
                        + custom category application
  lib/customCategories.js  Custom categories: persistence
                        (~/.dsh-catalog/categories.json), paste parsing,
                        override application
  lib/customNotes.js    Custom command notes: persistence
                        (~/.dsh-catalog/notes.json), table parsing,
                        right-click info card display
  lib/store.js          User-data directory + legacy-location migration
  lib/server.js         Panel data HTTP service (/api/catalog, /api/refresh,
                        /api/mode, /api/custom R/W, /api/custom/reset,
                        /api/notes R/W, /api/notes/reset)
  client.js             DSH browser entry: registers via window.__ModuleLoader__.load
                        sidebar icon (sidebar.footer.action) + right panel
                        (sidebarRight), native React components, data via
                        /api/catalog
  assets/icon.svg       Plugin/sidebar icon
  assets/command-catalog.json  Scan artifact (runtime-generated, gitignored)
```

## Extending: add a scan source

Append one record to the `SOURCES` list in `lib/scan.js`; no parsing logic
changes needed. `collection` is usually **omitted** — collection names are
derived from the directories the roots actually hit:

```js
{
  client: "My Source",
  kind: "skill_md",            // DSH skills-root source
  roots: ["~/.mysource/skills"],
  // collection: "explicit name", // only for non-directory sources
}
```

## License

[MIT](LICENSE)
