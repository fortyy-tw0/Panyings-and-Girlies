// TEST STUB: opens the database and seeds one sample article so the chat can be tested.
// Before release: get the encryption key from expo-secure-store instead of hard-coding it.
import { open, DB } from '@op-engineering/op-sqlite';
import { createKnowledgeTable, addArticle } from './ai/knowledge';

let db: DB | null = null;

export function getDb(): DB {
  if (!db) {
    db = open({ name: 'pushy.db', encryptionKey: 'TEST-ONLY-change-me' });
    seedForTesting(db).catch(e => console.warn('seed failed', e));
  }
  return db;
}

async function seedForTesting(d: DB) {
  await createKnowledgeTable(d);
  const res = await d.execute('SELECT count(*) AS n FROM kb');
  if (Number((res.rows[0] as any).n) > 0) return;

  await addArticle(
    d,
    'Period cramps',
    'Period cramps (dysmenorrhea) are a common, dull or throbbing pain in the lower belly, usually in the first one to three days of a period. ' +
      'Heat on the lower belly, gentle movement, and rest can help. See a healthcare professional if the pain is severe, ' +
      'stops you from doing daily activities, or suddenly gets worse than usual.',
    'Test article written by the team',
  );
}
