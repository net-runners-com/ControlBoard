// Japanese has no word boundaries, so the lexical index is built on character
// bigrams instead of the camelCase-aware tokenizer a code search would use.
// The build script and the Worker must tokenise identically or scores go wrong.
//
// The index ships as a binary blob rather than JSON: JSON.parse of a few MB costs
// 12-19 ms, and that lands on the first request of a cold isolate — more than the
// entire free-plan CPU budget for that request. Typed-array views cost nothing.

const K1 = 1.2;
const B = 0.75;
const MAGIC = 0x4c455831; // "LEX1"
const HEADER_WORDS = 4;

export function bigrams(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i < normalized.length - 1; i++) out.push(normalized.slice(i, i + 2));
  return out;
}

// A bigram is two UTF-16 code units, so it packs losslessly into one uint32 and
// the term table can be searched without materialising any strings.
const packGram = (gram) => ((gram.charCodeAt(0) << 16) >>> 0) + gram.charCodeAt(1);

export function encodeLexicalIndex(texts) {
  const lengths = new Int32Array(texts.length);
  const postings = new Map();

  texts.forEach((text, docIndex) => {
    const grams = bigrams(text);
    lengths[docIndex] = grams.length;
    const counts = new Map();
    for (const gram of grams) counts.set(gram, (counts.get(gram) ?? 0) + 1);
    for (const [gram, frequency] of counts) {
      const key = packGram(gram);
      if (!postings.has(key)) postings.set(key, []);
      postings.get(key).push(docIndex, frequency);
    }
  });

  const terms = [...postings.keys()].sort((a, b) => a - b);
  const totalPairs = [...postings.values()].reduce((sum, list) => sum + list.length, 0);
  const totalLength = lengths.reduce((sum, value) => sum + value, 0);

  const words = HEADER_WORDS + texts.length + terms.length + (terms.length + 1) + totalPairs;
  const buffer = new ArrayBuffer(words * 4);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, texts.length, true);
  view.setFloat32(8, totalLength / (texts.length || 1), true);
  view.setUint32(12, terms.length, true);

  let offset = HEADER_WORDS;
  new Int32Array(buffer, offset * 4, texts.length).set(lengths);
  offset += texts.length;
  new Uint32Array(buffer, offset * 4, terms.length).set(terms);
  offset += terms.length;

  const offsets = new Uint32Array(buffer, offset * 4, terms.length + 1);
  offset += terms.length + 1;
  const postingView = new Int32Array(buffer, offset * 4, totalPairs);

  let cursor = 0;
  terms.forEach((term, i) => {
    offsets[i] = cursor;
    const list = postings.get(term);
    postingView.set(list, cursor);
    cursor += list.length;
  });
  offsets[terms.length] = cursor;

  return buffer;
}

export function openLexicalIndex(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < HEADER_WORDS * 4 || view.getUint32(0, true) !== MAGIC) {
    throw new Error('語彙インデックスの形式が不正です。再ビルドしてください。');
  }
  const count = view.getUint32(4, true);
  const avgLength = view.getFloat32(8, true);
  const termCount = view.getUint32(12, true);

  let offset = HEADER_WORDS;
  const lengths = new Int32Array(buffer, offset * 4, count);
  offset += count;
  const terms = new Uint32Array(buffer, offset * 4, termCount);
  offset += termCount;
  const offsets = new Uint32Array(buffer, offset * 4, termCount + 1);
  offset += termCount + 1;
  const postings = new Int32Array(buffer, offset * 4);

  return { count, avgLength, lengths, terms, offsets, postings };
}

function findTerm(index, key) {
  let low = 0;
  let high = index.terms.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = index.terms[mid];
    if (value === key) return mid;
    if (value < key) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

// Returns a Map of docIndex -> BM25 score. Only documents sharing a bigram with
// the query are touched, so cost tracks the query length, not the corpus size.
export function bm25Scores(index, query) {
  const scores = new Map();
  if (!index) return scores;

  for (const gram of new Set(bigrams(query))) {
    const term = findTerm(index, packGram(gram));
    if (term === -1) continue;

    const start = index.offsets[term];
    const end = index.offsets[term + 1];
    const documentFrequency = (end - start) / 2;
    const idf = Math.log(
      1 + (index.count - documentFrequency + 0.5) / (documentFrequency + 0.5),
    );

    for (let i = start; i < end; i += 2) {
      const docIndex = index.postings[i];
      const frequency = index.postings[i + 1];
      const norm = 1 - B + (B * index.lengths[docIndex]) / index.avgLength;
      const contribution = (idf * (frequency * (K1 + 1))) / (frequency + K1 * norm);
      scores.set(docIndex, (scores.get(docIndex) ?? 0) + contribution);
    }
  }

  return scores;
}
