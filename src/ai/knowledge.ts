// Local knowledge base search (RAG) using SQLite full-text search (FTS5).
// The articles are written/reviewed by your team and shipped inside the app.
import { DB } from '@op-engineering/op-sqlite';

/** Run once at first launch (or ship a pre-built database instead). */
export async function createKnowledgeTable(db: DB) {
  await db.execute(
    `CREATE VIRTUAL TABLE IF NOT EXISTS kb USING fts5(title, body, source)`,
  );
}

export async function addArticle(db: DB, title: string, body: string, source: string) {
  await db.execute(`INSERT INTO kb (title, body, source) VALUES (?, ?, ?)`, [
    title,
    body,
    source,
  ]);
}

/** Returns the top matching passages for a question, as text for the prompt. */
export async function searchKnowledge(db: DB, question: string, limit = 3) {
  // Turn the question into an FTS query: keep words, join with OR.
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  if (!terms.length) return '';

  const res = await db.execute(
    `SELECT title, body FROM kb WHERE kb MATCH ? ORDER BY rank LIMIT ?`,
    [terms.join(' OR '), limit],
  );

  return res.rows
    .map((r: any) => `## ${r.title}\n${String(r.body).slice(0, 1200)}`)
    .join('\n\n');
}
