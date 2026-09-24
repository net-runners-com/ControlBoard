// 管理画面アシスタント(RAG)の索引を site/rag-docs/ から作る。
// JSON / Markdown / テキストだけを対象にした簡略版(local-rag の
// scripts/build-index.mjs + extract.mjs から、PDF/DOCX/Google Drive 対応を
// 落として移植)。取得 → チャンク分割 → 埋め込み → 索引出力、の流れは同じ。
//
// 実行: サイトの作業フォルダで controlboard rag-index
// トークンを発行したくない場合: README「API トークンを発行せずに動かす」と
// 同じ手順(EMBED_ENDPOINT に一時的な embed-proxy Worker を立てる)が使える。
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { EMBED_MODEL } from "@controlboard/core/runtime/rag/config";
import { encodeLexicalIndex } from "@controlboard/core/runtime/rag/lexical";

const DOCS_DIR = join(process.cwd(), "rag-docs") + "/";
const OUT_DIR = join(process.cwd(), "public/rag-admin") + "/";

const CHUNK_CHARS = 800;
const CHUNK_OVERLAP = 150;
const BATCH = 25;

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const EMBED_ENDPOINT = process.env.EMBED_ENDPOINT;

/* ---------------- JSON → 見出し付きテキスト ---------------- */
// フィールド名は検索に意味を持つ("料金: 5000円" は裸の "5000円" より強い)ので、
// JSON は値だけに削らず、ラベル付きの行に展開する。
const TITLE_KEYS = new Set([
  "title", "name", "question", "subject", "heading", "label",
  "タイトル", "見出し", "質問", "件名", "名称", "項目",
]);
const NOISE_KEYS = new Set(["key", "version", "updated", "created", "modified", "更新日", "作成日"]);
const ID_KEYS = new Set(["id", "uuid", "slug"]);
const RELATED_KEYS = new Set(["related", "related_to", "see_also", "関連", "関連項目"]);

export const ID_LABEL = "__ID";
export const RELATED_LABEL = "__RELATED";
export const GROUP_LABEL = "__GROUP";
const MARKER_LINE = new RegExp(`^(?:${ID_LABEL}\\s*:|${RELATED_LABEL}\\s*:|${GROUP_LABEL}\\s*:).*$`, "gm");

function asScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function flatten(value, prefix, lines) {
  const scalar = asScalar(value);
  if (scalar !== null) {
    if (scalar.trim()) lines.push(prefix ? `${prefix}: ${scalar}` : scalar);
    return;
  }
  if (Array.isArray(value)) {
    const scalars = value.map(asScalar);
    if (scalars.every((item) => item !== null)) {
      const joined = scalars.filter((item) => item.trim()).join(", ");
      if (joined) lines.push(prefix ? `${prefix}: ${joined}` : joined);
      return;
    }
    value.forEach((item, i) => flatten(item, prefix ? `${prefix}[${i + 1}]` : `${i + 1}`, lines));
    return;
  }
  for (const [key, nested] of Object.entries(value)) flatten(nested, prefix ? `${prefix}.${key}` : key, lines);
}

const titleKeyOf = (record) => Object.keys(record).find((key) => TITLE_KEYS.has(key.toLowerCase()));

function collectIdentifiers(record) {
  const ids = [];
  const related = [];
  for (const [key, value] of Object.entries(record)) {
    const name = key.toLowerCase();
    if (ID_KEYS.has(name)) {
      const scalar = asScalar(value)?.trim();
      if (scalar) ids.push(scalar);
    } else if (RELATED_KEYS.has(name)) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        const scalar = asScalar(entry)?.trim();
        if (scalar) related.push(scalar);
      }
    }
  }
  return { ids, related };
}

function compose(heading, lines, ids = [], related = []) {
  const body = [...lines];
  if (ids.length) body.push(`${ID_LABEL}: ${ids.join(", ")}`);
  if (related.length) body.push(`${RELATED_LABEL}: ${related.join(", ")}`);
  return lines.length ? `## ${heading}\n${body.join("\n")}` : "";
}

// レコード1件を1チャンクにする(このコーパスは配列の要素がすべて葉レコードで、
// ネストした配列に分けて展開する必要が無いため、local-rag の extract.mjs
// にある groups 展開は落としてある)。
function sectionOf(value, fallbackHeading) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const lines = [];
    flatten(value, "", lines);
    return compose(fallbackHeading, lines);
  }
  const titleKey = titleKeyOf(value);
  const heading = titleKey ? asScalar(value[titleKey]) : fallbackHeading;
  const { ids, related } = collectIdentifiers(value);
  const lines = [];
  for (const [key, nested] of Object.entries(value)) {
    const name = key.toLowerCase();
    if (key === titleKey || NOISE_KEYS.has(name) || ID_KEYS.has(name) || RELATED_KEYS.has(name)) continue;
    flatten(nested, key, lines);
  }
  return compose(heading, lines, ids, related);
}

function fromJson(raw, name) {
  const data = JSON.parse(raw);
  const title = basename(name, extname(name));
  const sections = Array.isArray(data) ? data.map((item, i) => sectionOf(item, `${title} ${i + 1}`)) : [sectionOf(data, title)];
  return [`# ${title}`, ...sections.filter(Boolean)].join("\n\n");
}

function stripFrontmatter(text) {
  return text.startsWith("---") ? text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") : text;
}

/* ---------------- 見出し単位のチャンク分割 ---------------- */
function splitBySection(text) {
  const sections = [];
  const trail = [];
  let heading = "";
  let buffer = [];
  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ heading, body, path: trail.slice(0, -1).map((h) => h.title) });
    buffer = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      flush();
      const level = match[1].length;
      heading = match[2].trim();
      while (trail.length && trail.at(-1).level >= level) trail.pop();
      trail.push({ level, title: heading });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function splitLongText(text) {
  if (text.length <= CHUNK_CHARS) return [text];
  const pieces = [];
  const step = CHUNK_CHARS - CHUNK_OVERLAP;
  for (let start = 0; start < text.length; start += step) {
    pieces.push(text.slice(start, start + CHUNK_CHARS));
    if (start + CHUNK_CHARS >= text.length) break;
  }
  return pieces;
}

const ID_PATTERN = new RegExp(`^${ID_LABEL}\\s*:\\s*(.+)$`, "m");
const RELATED_PATTERN = new RegExp(`^${RELATED_LABEL}\\s*:\\s*(.+)$`, "m");
// "category: 概要" のような行はビルド側の flatten() が汎用ルールで書き出したもの
// (extract 専用の予約フィールドではない)。ここから拾って構造化メタデータにする
// ことで、実行側(rag-ask.js)が「該当ページを開く」リンクの行き先を判定できる。
const CATEGORY_PATTERN = /^category\s*:\s*(.+)$/im;
const listOf = (match) => (match ? match[1].split(",").map((v) => v.trim()).filter(Boolean) : []);

function buildChunks({ source, text: raw }) {
  const text = stripFrontmatter(raw);
  const titleMatch = /^#\s+(.*)$/m.exec(text);
  const title = titleMatch ? titleMatch[1].trim() : basename(source, extname(source));
  const chunks = [];
  for (const section of splitBySection(text)) {
    const ids = listOf(ID_PATTERN.exec(section.body));
    const related = listOf(RELATED_PATTERN.exec(section.body)).filter((id) => !ids.includes(id));
    const category = CATEGORY_PATTERN.exec(section.body)?.[1]?.trim();
    const prose = section.body.replace(MARKER_LINE, "").replace(/\n{2,}/g, "\n").trim();

    for (const piece of splitLongText(prose)) {
      const body = piece.trim();
      if (body.length < 20) continue;
      const chunk = { source, title, heading: section.heading, text: body };
      if (ids.length) chunk.ids = ids;
      if (related.length) chunk.related = related;
      if (category) chunk.category = category;
      if (section.path.length) chunk.path = section.path;
      // 見出しは最も検索に効く語を持つので、埋め込みの入力に必ず含める。
      // src/lib/rag/search.js の rerankInput() と同じ組み立てにすること。
      chunk.embedInput = [title, ...section.path, section.heading, body].filter(Boolean).join("\n");
      chunks.push(chunk);
    }
  }
  return chunks;
}

function buildIdMap(chunks) {
  const byId = {};
  chunks.forEach((chunk, index) => {
    for (const id of chunk.ids ?? []) (byId[id] ??= []).push(index);
  });
  return byId;
}

function buildSiblingMap(chunks) {
  const bySibling = {};
  chunks.forEach((chunk, index) => {
    if (!chunk.group || !chunk.ids?.length) return;
    const key = `${chunk.ids[0]}::${chunk.group}`;
    (bySibling[key] ??= []).push(index);
  });
  for (const [key, list] of Object.entries(bySibling)) if (list.length < 2) delete bySibling[key];
  return bySibling;
}

/* ---------------- 読み込み ---------------- */
const TEXT_EXT = new Set([".md", ".markdown", ".txt"]);

async function loadDocuments() {
  const all = (await readdir(DOCS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();

  const documents = [];
  for (const name of all) {
    const ext = extname(name).toLowerCase();
    const raw = await readFile(join(DOCS_DIR, name), "utf8");
    if (ext === ".json") documents.push({ source: name, text: fromJson(raw, name) });
    else if (TEXT_EXT.has(ext)) documents.push({ source: name, text: raw });
    else console.warn(`skip (未対応の形式): ${name}`);
  }
  return documents;
}

/* ---------------- 埋め込み ---------------- */
async function embed(texts) {
  // Local development can point at a `wrangler dev` worker that owns the AI binding,
  // which avoids needing an API token on the machine at all.
  if (EMBED_ENDPOINT) {
    const response = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texts }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`埋め込みプロキシ (${response.status}): ${payload.error ?? ""}`);
    return payload.data;
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
    { method: "POST", headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: texts }) },
  );
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`Workers AI embedding failed (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`);
  }
  const vectors = payload.result?.data;
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new Error(`Unexpected embedding response: ${JSON.stringify(payload.result)?.slice(0, 200)}`);
  }
  return vectors;
}

function normalize(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum) || 1;
  return vector.map((value) => value / length);
}

if (!EMBED_ENDPOINT && (!ACCOUNT_ID || !API_TOKEN)) {
  console.error(
    "索引の作成には CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN、または EMBED_ENDPOINT が必要です。\n" +
      "トークンを発行したくない場合は README(local-rag)の「API トークンを発行せずに動かす」と同じ手順で\n" +
      "embed-proxy Worker を立て、EMBED_ENDPOINT=http://127.0.0.1:4188/ node scripts/build-rag-index.mjs のように実行してください。",
  );
  process.exit(1);
}

const documents = await loadDocuments();
if (documents.length === 0) throw new Error("読み込めるドキュメントが1件もありませんでした。");

const chunks = documents.flatMap(buildChunks);
console.log(`${documents.length} documents -> ${chunks.length} chunks`);

if (chunks.length > 2000) {
  console.warn(`⚠ チャンク数が ${chunks.length} 件です。無料プランの CPU 制限(10ms)を超える可能性があります。`);
}

const embedded = [];
for (let i = 0; i < chunks.length; i += BATCH) {
  const batch = chunks.slice(i, i + BATCH);
  embedded.push(...(await embed(batch.map((chunk) => chunk.embedInput))));
  process.stdout.write(`\rembedding ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
}
process.stdout.write("\n");

const dim = embedded[0].length;
const vectors = new Float32Array(chunks.length * dim);
embedded.forEach((vector, i) => vectors.set(normalize(vector), i * dim));

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  join(OUT_DIR, "rag-index.json"),
  JSON.stringify({
    model: EMBED_MODEL,
    dim,
    count: chunks.length,
    byId: buildIdMap(chunks),
    bySibling: buildSiblingMap(chunks),
    chunks: chunks.map(({ embedInput, ...chunk }) => chunk),
  }),
);
await writeFile(join(OUT_DIR, "rag-vectors.bin"), Buffer.from(vectors.buffer));
const lexical = encodeLexicalIndex(chunks.map((chunk) => chunk.embedInput));
await writeFile(join(OUT_DIR, "rag-lexical.bin"), Buffer.from(lexical));
console.log(`wrote ${chunks.length} chunks, ${dim} dims (${(vectors.byteLength / 1024).toFixed(0)} KB of vectors)`);
