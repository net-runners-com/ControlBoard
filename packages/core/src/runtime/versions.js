/* Save history. Every admin save writes a snapshot of the resulting document,
   so any earlier state can be put back. Restoring records a snapshot of its
   own, which means a restore is itself undoable.

   KV layout:
     verindex        -> { next, items: [meta, ...] }   newest first, capped
     ver:<seq>       -> { ...meta, data }              the full document
   The index is kept as one key so the list screen is a single read. */

const INDEX = "verindex";
const MAX = 60;

const emptyIndex = () => ({ next: 1, items: [] });

export async function readIndex(env) {
  const idx = await env.CMS.get(INDEX, "json");
  if (!idx || !Array.isArray(idx.items)) return emptyIndex();
  return { next: idx.next || idx.items.length + 1, items: idx.items };
}

/* `data` is the state *after* the save, so restoring means writing it back. */
export async function recordVersion(env, { user, kind, pageId, label, data }) {
  const idx = await readIndex(env);
  const seq = idx.next;
  const meta = {
    seq,
    at: new Date().toISOString(),
    user: user || "",
    kind,
    pageId: pageId || null,
    label: label || "",
  };
  await env.CMS.put("ver:" + seq, JSON.stringify(Object.assign({}, meta, { data })));

  const items = [meta].concat(idx.items);
  const dropped = items.slice(MAX);
  await env.CMS.put(INDEX, JSON.stringify({ next: seq + 1, items: items.slice(0, MAX) }));
  // Pruning after the index write: a leftover body is harmless, a missing one is not.
  for (const d of dropped) await env.CMS.delete("ver:" + d.seq);
  return meta;
}

export async function getVersion(env, seq) {
  if (!Number.isInteger(seq) || seq < 1) return null;
  return await env.CMS.get("ver:" + seq, "json");
}

/* Puts the snapshot back where it came from. The caller records the restore. */
export async function applyVersion(env, v) {
  if (v.kind === "content") {
    await env.CMS.put("content", JSON.stringify(v.data));
    return true;
  }
  if (v.kind === "page" && v.pageId) {
    await env.CMS.put("page:" + v.pageId, JSON.stringify(v.data));
    return true;
  }
  return false;
}
