import assert from "node:assert/strict";
import test from "node:test";
import { duplicateKey } from "../app/url-duplicates.ts";

test("matches duplicate URL variants without merging meaningful filters", () => {
  assert.equal(duplicateKey("https://www.stc.com.kw/en/"), duplicateKey("http://www.stc.com.kw/EN"));
  assert.equal(duplicateKey("https://www.stc.com.kw/en/all?filter=APPLE"), duplicateKey("https://www.stc.com.kw/en/all?FILTER=apple"));
  assert.notEqual(duplicateKey("https://www.stc.com.kw/en/all?filter=Apple"), duplicateKey("https://www.stc.com.kw/en/all?filter=Samsung"));
});
