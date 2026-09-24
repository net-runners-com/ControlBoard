// 検索(ベクトル+BM25+リランカー)。local-rag の functions/api/ask.js から移植。
// この管理画面向けには「システム設定」文書とメタ質問の特別扱いを持たない
// (自己紹介用の生成ドキュメントを作っていないため)。
import { RELEVANCE_FLOOR, TOP_K, MAX_PER_DOCUMENT, LEXICAL_WEIGHT, GRAPH_EXPANSION, SIBLING_EXPANSION, RERANK_MODEL, RERANK_WEIGHT } from './config.js';
import { bm25Scores } from './lexical.js';

// Scores stay in typed arrays and only the handful of returned rows become objects.
export function topMatches({ index, vectors, lexical }, queryVector, queryText, options = {}) {
  const { dim, count, chunks } = index;
  const limit = options.limit ?? TOP_K;
  const floor = options.floor ?? RELEVANCE_FLOOR;

  let sum = 0;
  for (const value of queryVector) sum += value * value;
  const norm = Math.sqrt(sum) || 1;

  const keyword = bm25Scores(lexical, queryText);
  let keywordBest = 0;
  for (const value of keyword.values()) if (value > keywordBest) keywordBest = value;
  if (keywordBest <= 0) keywordBest = 1;

  const scores = new Float32Array(count);
  let semanticBest = 0;
  for (let i = 0; i < count; i++) {
    const offset = i * dim;
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += queryVector[d] * vectors[offset + d];
    const value = dot / norm;
    scores[i] = value;
    if (value > semanticBest) semanticBest = value;
  }
  // Nothing in the corpus is actually about this question. Returning the least-bad
  // chunks would only give the model licence to answer from its own knowledge.
  if (semanticBest < floor) return [];
  const vectorTop = semanticBest;
  if (semanticBest <= 0) semanticBest = 1;

  const lexicalWeight = lexical ? LEXICAL_WEIGHT : 0;
  for (let i = 0; i < count; i++) {
    const vectorPart = scores[i] / semanticBest;
    const keywordPart = (keyword.get(i) ?? 0) / keywordBest;
    scores[i] = (1 - lexicalWeight) * vectorPart + lexicalWeight * keywordPart;
  }

  const order = new Int32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  order.sort((a, b) => scores[b] - scores[a]);

  // Take the best matches, but stop any single procedure from filling every slot so
  // that competing procedures stay visible as branches the model can ask about.
  const picked = [];
  const taken = new Set();
  const perTitle = new Map();
  for (const pass of [MAX_PER_DOCUMENT, Infinity]) {
    for (const at of order) {
      if (picked.length >= limit) break;
      if (taken.has(at)) continue;
      const key = chunks[at].title ?? chunks[at].source;
      const used = perTitle.get(key) ?? 0;
      if (used >= pass) continue;
      perTitle.set(key, used + 1);
      taken.add(at);
      picked.push(at);
    }
  }

  const row = (at, viaGraph) => ({ score: scores[at], chunk: chunks[at], at, viaGraph, vectorTop });
  // リランカーに渡すために広げているときは、拡張を足すと件数が読めなくなる。
  if (options.limit) return picked.map((at) => row(at, false));
  return [
    ...picked.map((at) => row(at, false)),
    ...expandBySibling(picked, taken, scores, index).map((at) => row(at, true)),
    ...expandByGraph(picked, taken, scores, index).map((at) => row(at, true)),
  ];
}

// Pulls in the neighbouring rows of the same set as the best hit, highest scoring
// first. Scoped to the top hit so a long table cannot flood the context.
function expandBySibling(picked, taken, scores, index) {
  const bySibling = index.bySibling;
  if (!bySibling || SIBLING_EXPANSION <= 0 || picked.length === 0) return [];

  const best = picked[0];
  const chunk = index.chunks[best];
  if (!chunk.group || !chunk.ids?.length) return [];

  const candidates = (bySibling[`${chunk.ids[0]}::${chunk.group}`] ?? [])
    .filter((at) => !taken.has(at))
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, SIBLING_EXPANSION);

  for (const at of candidates) taken.add(at);
  return candidates;
}

// Follows each hit's `related` ids to the procedures a human would look up next,
// adding the single best-scoring chunk of each so the extra context stays small.
function expandByGraph(picked, taken, scores, index) {
  const byId = index.byId;
  if (!byId || GRAPH_EXPANSION <= 0) return [];

  const chunks = index.chunks;
  const seenTargets = new Set(picked.flatMap((at) => chunks[at].ids ?? []));
  const additions = [];

  for (const at of picked) {
    for (const id of chunks[at].related ?? []) {
      if (additions.length >= GRAPH_EXPANSION) break;
      if (seenTargets.has(id)) continue;
      seenTargets.add(id);

      let best = -1;
      for (const candidate of byId[id] ?? []) {
        if (taken.has(candidate)) continue;
        if (best === -1 || scores[candidate] > scores[best]) best = candidate;
      }
      if (best === -1) continue;

      taken.add(best);
      additions.push(best);
    }
    if (additions.length >= GRAPH_EXPANSION) break;
  }

  return additions;
}

// 索引を作ったときの embedInput と同じ組み立て。見出しとパンくずを外して本文だけを
// 渡すと精度が落ちる(local-rag での実測)。見出しが最も情報量のある語を持つ。
const rerankInput = (match) =>
  [match.chunk.title, ...(match.chunk.path ?? []), match.chunk.heading, match.chunk.text]
    .filter(Boolean)
    .join('\n');

// 候補をリランカーのスコア順に並べ替えて返す。score はリランカーのもの(0..1)で
// 置き換える。呼び出し側はこの先頭のスコアで3段しきい値を判定する。
export async function rerank(env, query, matches) {
  const result = await env.AI.run(RERANK_MODEL, {
    query,
    contexts: matches.map((match) => ({ text: rerankInput(match) })),
  });
  const rows = result.response ?? [];
  if (rows.length === 0) return matches;

  let hybridBest = 0;
  for (const match of matches) if (match.score > hybridBest) hybridBest = match.score;
  if (hybridBest <= 0) hybridBest = 1;

  return rows
    .map((row) => {
      const match = matches[row.id];
      const blended = RERANK_WEIGHT * row.score + (1 - RERANK_WEIGHT) * (match.score / hybridBest);
      return { ...match, score: blended, rerankScore: row.score };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildContext(matches) {
  return matches
    .map((match, i) => {
      const { source, heading, text } = match.chunk;
      return `[${i + 1}] ${heading ? `${source} > ${heading}` : source}\n${text}`;
    })
    .join('\n\n');
}
