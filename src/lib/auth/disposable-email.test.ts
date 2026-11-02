import assert from "node:assert/strict";
import { isDisposableEmail } from "./disposable-email";

assert.equal(isDisposableEmail("person@mailinator.com"), true);
assert.equal(isDisposableEmail("person@MAILINATOR.COM"), true);
assert.equal(isDisposableEmail("person@sub.mailinator.com"), true);
assert.equal(isDisposableEmail("person@mailinator.com."), true);
assert.equal(isDisposableEmail("person@gmail.com"), false);
assert.equal(isDisposableEmail("person@company-mailinator.com"), false);
assert.equal(isDisposableEmail(""), false);

console.log("Disposable email domain tests passed.");
