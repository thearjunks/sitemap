import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../server/passwords.mjs";

test("password hashes are salted and reject incorrect passwords", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});
