import assert from "node:assert/strict";
import test from "node:test";
import { categoriesForUrl } from "../app/url-category.ts";

test("categorizes monitored URLs by path", () => {
  assert.deepEqual(categoriesForUrl("https://www.stc.com.kw/en/business/product/401"), ["Business", "Product", "Number ending"]);
  assert.deepEqual(categoriesForUrl("https://www.stc.com.kw/en/disclosure/report.pdf?download=1"), ["Disclosure", "PDF"]);
  assert.deepEqual(categoriesForUrl("https://www.stc.com.kw/en/investor-relations/news"), ["News", "IR"]);
  assert.deepEqual(categoriesForUrl("https://www.stc.com.kw/en/vas"), ["VAS"]);
  assert.deepEqual(categoriesForUrl("https://www.stc.com.kw/en/help-center"), ["Others"]);
});
