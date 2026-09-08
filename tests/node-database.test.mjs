import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/node-env.mjs";

test("Node database retains D1 bindings, duplicate counts, and atomic batches", async () => {
  const db = openDatabase(":memory:");
  try {
    await db.prepare("CREATE TABLE urls(id INTEGER PRIMARY KEY, url TEXT UNIQUE, status TEXT)").run();
    const insert = db.prepare("INSERT OR IGNORE INTO urls(url,status) VALUES (?,?)");
    const results = await db.batch([insert.bind("one", "Live"), insert.bind("two", "404"), insert.bind("one", "Live")]);
    assert.deepEqual(results.map(r => r.meta.changes), [1, 1, 0]);
    assert.equal(results[0].meta.last_row_id, 1);
    assert.equal((await db.prepare("SELECT * FROM urls WHERE url=?").bind("one").first()).status, "Live");
    assert.equal(await db.prepare("SELECT * FROM urls WHERE url=?").bind("missing").first(), null);
    await assert.rejects(db.batch([db.prepare("DELETE FROM urls"), db.prepare("INVALID SQL")]));
    assert.equal((await db.prepare("SELECT * FROM urls").all()).results.length, 2);
  } finally { db.close(); }
});
