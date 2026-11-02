import { translate, type SnagLocale } from "./i18n";
import type { SnagRequestRow } from "./protocol";

export type RejectionKind = "policy_block" | "developer";

export interface RejectionCopy {
  kind: RejectionKind;
  message: string;
  rules: string[];
}

/** Requester-facing rejection text. Policy blocks never use the developer sentence. */
export function rejectionCopy(
  row: Pick<SnagRequestRow, "rejection_reason" | "rejection_note" | "blocked_rules">,
  locale: SnagLocale,
): RejectionCopy {
  if (row.rejection_reason === "policy_block") {
    const rules = (row.blocked_rules ?? []).filter((name) => name.trim() !== "");
    const parts = [translate(locale, "block.message")];
    if (rules.length > 0) {
      parts.push(translate(locale, "block.rule", { rules: rules.join(", ") }));
    }
    parts.push(translate(locale, "block.next"));
    return { kind: "policy_block", message: parts.join(" "), rules };
  }
  return {
    kind: "developer",
    message: row.rejection_note
      ? translate(locale, "reject.withNote", { note: row.rejection_note })
      : translate(locale, "reject.withoutNote"),
    rules: [],
  };
}
