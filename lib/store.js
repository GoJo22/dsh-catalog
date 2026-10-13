// store.js — 用户数据的存储目录与旧版迁移。
//
// 目录名跟随插件名：现为 ~/.dsh-catalog/。插件曾用名 skill-catalog，旧数据在
// ~/.skill-catalog/；首次读写时自动把旧文件搬到新目录（只搬不删、绝不覆盖
// 新目录已有文件），用户可自行清理旧目录。
//
// 放在这里而不是插件安装目录里，是为了让自定义分类/说明在「重装插件、清理
// assets/ 运行时产物、增删其它插件」之后都完好无损。

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LEGACY_DIR = path.join(os.homedir(), ".skill-catalog");
export const STORE_DIR = path.join(os.homedir(), ".dsh-catalog");

const migrated = new Set(); // 已处理过的文件名（每个文件只迁移一次）

/** 把旧目录里的指定文件搬到新目录；新目录已有同名文件则跳过（不覆盖）。 */
export function migrateLegacy(fileName) {
  if (migrated.has(fileName)) return;
  migrated.add(fileName);
  try {
    const from = path.join(LEGACY_DIR, fileName);
    const to = path.join(STORE_DIR, fileName);
    if (!fs.existsSync(from) || fs.existsSync(to)) return;
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.copyFileSync(from, to);
  } catch {
    /* 迁移失败不影响主流程：按空数据跑，用户可在面板里重新保存 */
  }
}
