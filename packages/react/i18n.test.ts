import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  ar,
  directionFor,
  en,
  placeholdersIn,
  resolveLocale,
} from "./src/i18n.ts";
import { rejectionCopy } from "./src/rejection-copy.ts";

Deno.test("resolveLocale maps ar and ar-* to Arabic, everything else to English", () => {
  assertEquals(resolveLocale(undefined), "en");
  assertEquals(resolveLocale(""), "en");
  assertEquals(resolveLocale("en"), "en");
  assertEquals(resolveLocale("ar"), "ar");
  assertEquals(resolveLocale("ar-SA"), "ar");
  assertEquals(resolveLocale("fr"), "en");
  assertEquals(directionFor("en"), "ltr");
  assertEquals(directionFor("ar"), "rtl");
});

Deno.test("every Arabic string is non-empty and keeps the same placeholders", () => {
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    const english = en[key];
    const arabic = ar[key];
    assertEquals(arabic.trim() !== "", true, `${key} is empty`);
    assertEquals(placeholdersIn(arabic), placeholdersIn(english), key);
  }
});

Deno.test("policy-block copy uses the block message, not the developer sentence", () => {
  const copy = rejectionCopy(
    {
      rejection_reason: "policy_block",
      rejection_note: "Blocked by Block admin user changes. These files must not be modified.",
      blocked_rules: ["Block admin user changes"],
    },
    "en",
  );
  assertEquals(copy.kind, "policy_block");
  assertEquals(copy.rules, ["Block admin user changes"]);
  assertEquals(
    copy.message.includes("Snag stopped this request because it would change protected files."),
    true,
  );
  assertEquals(copy.message.includes("Block admin user changes"), true);
  assertEquals(copy.message.includes("A developer decided"), false);

  const arabic = rejectionCopy(
    {
      rejection_reason: "policy_block",
      rejection_note: "Blocked by Block admin user changes. These files must not be modified.",
      blocked_rules: ["Block admin user changes"],
    },
    "ar",
  );
  assertEquals(arabic.message.includes("أوقف Snag هذا الطلب"), true);
  assertEquals(arabic.message.includes("A developer decided"), false);
});
