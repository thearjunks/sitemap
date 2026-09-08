import assert from "node:assert/strict";
import test from "node:test";
import { isSoft404 } from "../app/api/check-url.ts";

test("detects a soft 404 from the HTML title without flagging a live page", () => {
  assert.equal(isSoft404("<title>Page Not Found - 404</title>"), true);
  assert.equal(isSoft404("<title>stc Kuwait | Discover 5G Advanced Speed</title>"), false);
});
