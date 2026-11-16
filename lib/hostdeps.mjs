// lib/hostdeps.mjs — 取 defineTool。
// 照 fish-memory 的做法：优先从「宿主那棵树」里找 @deepseek-ai/dsh-tools（它不在 profile 的 node_modules 里，
// 裸 import 会拿不到 → 工具注册成错的格式 → 报错）；拿不到再裸 import，再拿不到用本地等价实现（原样返回）。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF_MODULES = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "@deepseek-ai");

function candidateRoots() {
  const out = [];
  const push = (p) => { if (p && !out.includes(p)) out.push(p); };
  push(process.env["DSH_HOST_MODULES"]);
  const appdata = process.env["APPDATA"];
  if (appdata) {
    const npm = join(appdata, "npm", "node_modules");
    push(join(npm, "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai"));
    push(join(npm, "@deepseek-ai"));
    try {
      for (const n of readdirSync(join(npm, "@deepseek-ai"))) {
        push(join(npm, "@deepseek-ai", n, "node_modules", "@deepseek-ai"));
      }
    } catch {}
  }
  push("/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai");
  push("/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai");
  push("/usr/local/lib/node_modules/@deepseek-ai");
  push("/usr/lib/node_modules/@deepseek-ai");
  try {
    const dshHome = process.env["DSH_HOME"] || join(homedir(), ".dsh");
    for (const p of readdirSync(join(dshHome, "profiles"))) {
      push(join(dshHome, "profiles", p, "node_modules", "@deepseek-ai"));
    }
  } catch {}
  push(SELF_MODULES);
  return out;
}

function entryUrlFor(root, name) {
  try {
    const dir = join(root, name);
    const pkgFile = join(dir, "package.json");
    if (!existsSync(pkgFile)) return null;
    const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
    const dot = pkg.exports?.["."];
    const rel = typeof dot === "string" ? dot : (dot?.import || dot?.default || pkg.module || pkg.main);
    if (!rel) return null;
    const file = join(dir, String(rel).replace(/^\.\//, ""));
    return existsSync(file) ? pathToFileURL(file).href : null;
  } catch {
    return null;
  }
}

async function fromHostTree(name) {
  for (const root of candidateRoots()) {
    if (root === SELF_MODULES) continue;
    const url = entryUrlFor(root, name);
    if (!url) continue;
    try {
      return await import(url);
    } catch {}
  }
  return null;
}

function localDefineTool(options) {
  return options;
}

export async function loadDefineTool() {
  let dtMod = await fromHostTree("dsh-tools");
  if (!dtMod) {
    try {
      dtMod = await import("@deepseek-ai/dsh-tools");
    } catch {
      dtMod = null;
    }
  }
  return (dtMod && dtMod.defineTool) || localDefineTool;
}
