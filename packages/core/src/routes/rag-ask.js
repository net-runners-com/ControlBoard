/* 管理画面の使い方アシスタント。認証済みの管理者なら誰でも使える(コンテンツ編集の
   権限は問わない — 使い方を聞くだけの機能のため)。索引は build-rag-index.mjs が
   public/rag-admin/ に書き出した静的アセットを env.ASSETS 経由で読む。
   ベースは https://github.com/net-runners-com/local-rag の functions/api/ask.js。 */
import { getSession } from "../runtime/api.js";
import {
  EMBED_MODEL, CHAT_MODEL, TOP_K, MAX_TOKENS, TEMPERATURE, SYSTEM_PROMPT,
  MAX_HISTORY_TURNS, MAX_HISTORY_ANSWER_CHARS, FOLLOW_UP_CHARS,
  USE_RERANKER, RERANK_CANDIDATES, CANDIDATE_FLOOR, ANSWER_FLOOR, CAUTION_FLOOR, CAUTION_NOTICE,
  OUT_OF_SCOPE_REPLY,
} from "../runtime/rag/config.js";
import { topMatches, rerank, buildContext } from "../runtime/rag/search.js";
import { openLexicalIndex } from "../runtime/rag/lexical.js";
export const prerender = false;

// Survives across requests on a warm isolate, so the index is fetched once per cold start.
let cached = null;

async function loadIndex(env, requestUrl) {
  if (cached) return cached;
  const [indexResponse, vectorResponse] = await Promise.all([
    env.ASSETS.fetch(new URL("/rag-admin/rag-index.json", requestUrl)),
    env.ASSETS.fetch(new URL("/rag-admin/rag-vectors.bin", requestUrl)),
  ]);
  // A missing asset is served as the SPA fallback with a 200, so status alone proves nothing.
  const missing = !indexResponse.headers.get("content-type")?.includes("application/json");
  if (!indexResponse.ok || !vectorResponse.ok || missing) {
    throw new Error("索引が見つかりません。npm run build:rag-index を実行してください。");
  }

  const index = await indexResponse.json();
  const vectors = new Float32Array(await vectorResponse.arrayBuffer());
  if (vectors.length !== index.count * index.dim) {
    throw new Error("索引とベクトルの件数が一致しません。再ビルドしてください。");
  }

  let lexical = null;
  try {
    const response = await env.ASSETS.fetch(new URL("/rag-admin/rag-lexical.bin", requestUrl));
    if (response.ok) lexical = openLexicalIndex(await response.arrayBuffer());
  } catch {
    lexical = null;
  }

  cached = { index, vectors, lexical };
  return cached;
}

function errorResponse(message, status = 500) {
  return Response.json({ error: message }, { status });
}

// Trust nothing from the client: history is replayed into the prompt, so it is
// clamped in both length and count here rather than in the browser.
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((turn) => turn && typeof turn.question === "string" && typeof turn.answer === "string")
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      question: turn.question.slice(0, 500),
      answer: turn.answer.slice(0, MAX_HISTORY_ANSWER_CHARS),
    }));
}

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const session = await getSession(env, request);
  if (!session) return errorResponse("unauthorized", 401);

  let question;
  let history;
  try {
    ({ question, history } = await request.json());
  } catch {
    return errorResponse("リクエストの形式が不正です。", 400);
  }
  if (typeof question !== "string" || !question.trim()) {
    return errorResponse("質問が空です。", 400);
  }

  const turns = sanitizeHistory(history);
  const previous = turns.at(-1)?.question;
  const searchText =
    previous && question.trim().length <= FOLLOW_UP_CHARS ? `${previous}\n${question}` : question;

  let matches;
  let caution = false;
  try {
    const store = await loadIndex(env, request.url);
    const embedding = await env.AI.run(EMBED_MODEL, { text: [searchText] });
    const queryVector = embedding.data?.[0];
    if (!queryVector) throw new Error("埋め込みの生成に失敗しました。");

    if (!USE_RERANKER) {
      matches = topMatches(store, queryVector, searchText);
    } else {
      const wide = topMatches(store, queryVector, searchText, {
        limit: RERANK_CANDIDATES,
        floor: CANDIDATE_FLOOR,
      });
      if (wide.length === 0) {
        matches = wide;
      } else {
        const ranked = await rerank(env, searchText, wide);
        const best = Math.max(...ranked.map((row) => row.rerankScore ?? 0), 0);
        if (best < CAUTION_FLOOR) matches = [];
        else {
          matches = ranked.slice(0, TOP_K);
          caution = best < ANSWER_FLOOR;
        }
      }
    }
  } catch (error) {
    return errorResponse(`検索に失敗しました: ${error.message}`);
  }

  // Answering out of scope costs nothing and cannot hallucinate: no model call at all.
  if (matches.length === 0) {
    const encoder = new TextEncoder();
    return new Response(
      encoder.encode(
        `data: ${JSON.stringify({ sources: [] })}\n\n` +
          `data: ${JSON.stringify({ choices: [{ delta: { content: OUT_OF_SCOPE_REPLY } }] })}\n\n` +
          "data: [DONE]\n\n",
      ),
      { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" } },
    );
  }

  let aiStream;
  try {
    aiStream = await env.AI.run(CHAT_MODEL, {
      stream: true,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...turns.flatMap((turn) => [
          { role: "user", content: turn.question },
          { role: "assistant", content: turn.answer },
        ]),
        {
          role: "user",
          content: `参考ドキュメント:\n\n${buildContext(matches)}\n\n---\n\n質問: ${question}`,
        },
      ],
    });
  } catch (error) {
    return errorResponse(`回答の生成に失敗しました。無料枠の1日の上限に達した可能性があります (${error.message})`, 503);
  }

  const encoder = new TextEncoder();
  const sources = matches.map((match) => ({ ...match.chunk, score: match.score }));

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`));
      // グレー帯。モデルに「自信がないと書け」と指示しても守られないので、
      // サーバー側で本文の前に固定文を差し込む。
      if (caution) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: CAUTION_NOTICE } }] })}\n\n`),
        );
      }
      const reader = aiStream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
