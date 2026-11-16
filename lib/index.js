// dsh-fish-diary — 角色「日记本」：原文单独存成 .md，永不删、不进记忆衰减。
//
// 设计（和阿鱼一起定的）：
// - 原文存 <DSH_HOME>/fish-diary/YYYY-MM-DD.md，一天一篇，用「生活日」（早上 6 点起算，凌晨归前一天）。
// - 同一天再写 = 续写（追加，中间留时间分隔）；想重写就传 rewrite=true。
// - 记忆里只留一行索引（由角色自己调 remember 记，带「日记」「日期」标签）—— 本插件只负责文件读写。
// - 两个工具：diary_write（写/续写）、diary_read（读，日期可不给，默认最近一篇）。

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadDefineTool } from "./hostdeps.mjs";

export const name = "dsh-fish-diary";
export const inject = ["tools"];

// 取 defineTool：优先宿主 dsh-tools（会做 spec→JSON Schema 转换 + 校验）；拿不到就原样返回。
const defineTool = await loadDefineTool();

// ---------- 目录与日期 ----------
function dataDir() {
  return join(process.env["DSH_HOME"]?.trim() || join(homedir(), ".dsh"), "fish-diary");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// 生活日：早上 6 点起算（和过日子插件同一口径，凌晨归前一天）
function dayKey(now) {
  const d = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function filePath(date) {
  return join(dataDir(), date + ".md");
}

function listDates() {
  try {
    return readdirSync(dataDir())
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
  } catch {
    return [];
  }
}

function latestDate() {
  const ds = listDates();
  return ds.length ? ds[ds.length - 1] : "";
}

function readDiary(date) {
  try {
    return readFileSync(filePath(date), "utf8");
  } catch {
    return "";
  }
}

// 写/续写。返回 '新建' 或 '续写'。
function writeDiary(date, text, rewrite) {
  mkdirSync(dataDir(), { recursive: true });
  const old = rewrite ? "" : readDiary(date);
  if (old) {
    const stamp = new Date().toTimeString().slice(0, 5); // HH:MM
    writeFileSync(filePath(date), `${old}\n\n—— ${stamp} ——\n\n${text}`, "utf8");
    return "续写";
  }
  writeFileSync(filePath(date), text, "utf8");
  return "新建";
}

// ---------- 工具 ----------
const diaryWriteTool = defineTool({
  name: "diary_write",
  description:
    "写/续写今天的日记。原文单独存成 .md 文件，永不删、不进记忆衰减；同一天再写会自动续写（中间留时间分隔）。" +
    "写完记得调 remember 记一行索引（text 写「YYYY-MM-DD 日记已写」，tags 写 [日记, 日期]）。",
  parameters: {
    text: {
      type: "string",
      required: true,
      description: "这一篇/这一段日记的原文。想写多长写多长，不用为将来的摘要省力气。",
    },
    rewrite: {
      type: "boolean",
      description: "可选。默认 false = 续写（追加）；true = 重写（覆盖当天已有的）。",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "boolean" }, message: { type: "string" } },
    },
    render(_args, value) {
      if (value && value.ok === false) return [{ type: "text", text: "✗ " + String(value.message || "没写成") }];
      return [{ type: "text", text: String(value.message || "✓") }];
    },
  },
  async execute(args) {
    const text = String((args && args.text) || "").trim();
    if (!text) return { ok: false, message: "没写成（内容是空的）" };
    const date = dayKey(new Date());
    const kind = writeDiary(date, text, Boolean(args && args.rewrite));
    const hint =
      "（原文已存进日记本 " + date + ".md。请再调 remember 记一行索引：" +
      "text 写「" + date + " 日记已写」，tags 写 [日记, 日期]。）";
    return { ok: true, message: (kind === "新建" ? "✓ 写了今天第一篇" : "✓ 续写了今天的") + hint };
  },
});

const diaryReadTool = defineTool({
  name: "diary_read",
  description: "读日记原文。给日期（如 2026-11-16）读那一天；不给日期默认读最近一篇。",
  parameters: {
    date: {
      type: "string",
      description: "可选，格式 YYYY-MM-DD。不填就读最近一篇。",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "boolean" }, date: { type: "string" }, text: { type: "string" } },
    },
    render(_args, value) {
      if (value && value.ok === false) return [{ type: "text", text: "✗ " + String(value.message || "没读到") }];
      const t = value && value.text ? value.text : "";
      return [{ type: "text", text: t }];
    },
  },
  async execute(args) {
    const date = String((args && args.date) || "").trim() || latestDate();
    if (!date) return { ok: false, message: "还没有任何日记" };
    const text = readDiary(date);
    if (!text) return { ok: false, message: "没有 " + date + " 这篇日记" };
    return { ok: true, date, text };
  },
});

export function apply(ctx) {
  if (ctx.tools && typeof ctx.tools.register === "function") {
    ctx.tools.register(diaryWriteTool);
    ctx.tools.register(diaryReadTool);
  }
}
