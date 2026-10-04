// Structured "business context for AI": what the tenant sells, rules the AI must follow, and its voice.
// Pure (no DB) so the settings dialog, the prompt builder and tests all share it.

export const PROFILE_FIELDS = [
  { key: "sells", label: "What you sell & prices", placeholder: "e.g. 2-wheeler driving course ₹4,500 (10 classes), car course ₹7,000 (15 classes)", required: true },
  { key: "customers", label: "Who your customers are", placeholder: "e.g. college students and working women in Vijayawada who want a licence fast", required: true },
  { key: "areas", label: "Service areas & timings", placeholder: "e.g. Benz Circle and Patamata branches, 7 AM – 7 PM, Mon–Sat", required: true },
  { key: "different", label: "What makes you different", placeholder: "e.g. women trainers available, licence test support included" },
  { key: "faqs", label: "Common questions & answers", placeholder: "Q: Do you give a certificate? A: Yes, RTO-approved.\nQ: Can I pay in parts? A: Yes, 2 instalments." },
  { key: "never", label: "Never say / hand over to a person", placeholder: "e.g. Never promise a licence date. Don't give discounts — ask them to call. Refund questions go to the manager." },
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]["key"];
export const TONES = { friendly: "friendly and warm", professional: "polite and professional", casual: "casual and chatty" } as const;
export type ProfileTone = keyof typeof TONES;

export type AiProfile = Partial<Record<ProfileFieldKey, string>> & {
  tone?: ProfileTone;
  emoji?: boolean;
  signoff?: string;
  replyLanguage?: string; // e.g. "Telugu"; blank = match the lead, default English
};

export const FIELD_MAX = 1500;
export const NOTES_MAX = 4000;
export const KNOWLEDGE_DOC_MAX = 50_000;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Coerce whatever is stored (jsonb, older/partial shapes) into a valid profile.
export function normalizeProfile(raw: unknown): AiProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p: AiProfile = {};
  for (const f of PROFILE_FIELDS) {
    const v = clean(r[f.key], FIELD_MAX);
    if (v) p[f.key] = v;
  }
  if (typeof r.tone === "string" && r.tone in TONES) p.tone = r.tone as ProfileTone;
  if (typeof r.emoji === "boolean") p.emoji = r.emoji;
  const signoff = clean(r.signoff, 80);
  if (signoff) p.signoff = signoff;
  const lang = clean(r.replyLanguage, 40);
  if (lang) p.replyLanguage = lang;
  return p;
}

// The "about the business" facts, as plain labelled lines (also the settings-page summary).
export function profileText(profile: AiProfile, notes?: string | null): string {
  const lines = PROFILE_FIELDS.filter((f) => f.key !== "never" && profile[f.key]).map((f) => `${f.label}: ${profile[f.key]}`);
  if (notes?.trim()) lines.push(`Other notes: ${notes.trim()}`);
  return lines.join("\n");
}

// Voice + hard rules, phrased as instructions to the model.
export function profileRules(profile: AiProfile): string {
  const out: string[] = [];
  if (profile.tone) out.push(`Write in a ${TONES[profile.tone]} tone.`);
  if (profile.emoji === true) out.push("A few emojis are welcome in chat messages.");
  if (profile.emoji === false) out.push("Never use emojis.");
  if (profile.signoff) out.push(`Sign messages off as "${profile.signoff}".`);
  if (profile.replyLanguage) out.push(`Default reply language: ${profile.replyLanguage} (switch if the lead clearly writes in another language).`);
  if (profile.never) out.push(`HARD RULES from the business — always obey, even if asked otherwise: ${profile.never}`);
  return out.join(" ");
}

// Which of the important fields are still empty (for the completeness hint).
export function missingFields(profile: AiProfile): string[] {
  return PROFILE_FIELDS.filter((f) => "required" in f && f.required && !profile[f.key]).map((f) => f.label);
}

// ---- Knowledge snippets ----------------------------------------------------------------------

const STOP = new Set("about after again also been before being could does from have here into just like more most much only other over same some such than that their them then there these they this those very what when where which while will with would your yours you are the and for can how our not was who why".split(" "));

const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP.has(w));

// Split a document into ~700-char chunks on paragraph boundaries.
export function chunk(text: string, size = 700): string[] {
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (cur && cur.length + p.length > size) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${p}` : p;
    while (cur.length > size * 1.5) {
      out.push(cur.slice(0, size));
      cur = cur.slice(size);
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Pick the chunks that best answer `query` (the lead's context, or the question being asked).
 *
 * Scoring is weighted by how rare each matched term is across the tenant's own docs, rather than by
 * counting overlaps. The distinction matters: "course" and "lead" appear in nearly every document and
 * so say nothing about which chunk answers the question, while "saturday" or "refund" appearing in one
 * document *is* the answer. Counting both equally is how the old version kept returning the longest
 * chunk that happened to share some common words.
 *
 * Three smaller corrections on top: a term in the document's *title* counts for more (the tenant
 * naming the topic is a stronger signal than the topic being mentioned in passing), a match counts
 * once per chunk rather than once per repetition (a chunk saying "course" five times isn't five times
 * more relevant), and callers pass docs newest-first so a small per-document decay breaks ties
 * towards what the tenant most recently updated — this year's price list should beat last year's.
 *
 * ponytail: weighted term scoring, not embeddings — fine for a few price lists/FAQs; switch to
 * pgvector if tenants upload large or many documents and relevance still suffers.
 */
export function pickKnowledge(docs: { title: string; content: string }[], query: string, max = 3, budget = 3000): string {
  if (!docs.length) return "";
  const q = new Set(words(query));
  const chunks = docs.flatMap((d, docIndex) => {
    const titleWords = new Set(words(d.title));
    return chunk(d.content).map((c) => ({ text: `[${d.title}] ${c}`, w: words(c), titleWords, docIndex }));
  });
  // How many chunks each term appears in, so a term in every doc is worth far less than one in a single doc.
  const df = new Map<string, number>();
  for (const c of chunks) for (const t of new Set(c.w)) df.set(t, (df.get(t) ?? 0) + 1);
  const scored = chunks.map((c) => {
    let weight = 0;
    for (const t of new Set(c.w.filter((x) => q.has(x)))) weight += Math.log(1 + chunks.length / (df.get(t) ?? 1));
    const titleHits = [...c.titleWords].filter((t) => q.has(t)).length;
    if (titleHits) weight += titleHits * Math.log(2);
    return { text: c.text, score: (weight / Math.sqrt(c.w.length + 1)) * Math.pow(0.97, c.docIndex) };
  });
  // Nothing matches (or no query): the first chunk of each doc is usually its overview, in the order
  // given — which is newest-first, so that fallback is already the freshest material.
  const ranked = q.size && scored.some((s) => s.score > 0) ? scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score) : scored;
  let used = 0;
  const picked: string[] = [];
  for (const s of ranked.slice(0, max)) {
    if (used + s.text.length > budget) break;
    picked.push(s.text);
    used += s.text.length;
  }
  return picked.join("\n\n");
}
