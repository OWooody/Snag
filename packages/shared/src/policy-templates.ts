import type { PolicyOutcome, PolicyRuleCondition, PolicyRuleKind } from "./execute-policy";

export interface PolicyTemplateRule {
  name: string;
  kind: PolicyRuleKind;
  outcome: PolicyOutcome;
  condition: PolicyRuleCondition;
  /** Shown under the rule while reviewing the template. */
  note?: string;
  /** Paths are guesses about the repository layout; ask the admin to check them. */
  checkPaths?: boolean;
}

export interface PolicyTemplate {
  id: string;
  name: string;
  tagline: string;
  allows: string[];
  holds: string[];
  rules: PolicyTemplateRule[];
}

/** SQL files only: ORM snapshot/journal JSON in migration folders is not schema. */
export const MIGRATION_GLOBS = ["**/*.sql", "**/schema.prisma"];

export const ROLE_PERMISSION_GLOBS = [
  "**/*role*",
  "**/*role*/**",
  "**/*permission*",
  "**/*permission*/**",
  "**/*rbac*",
  "**/middleware.*",
];

export const FAST_LANE_TEMPLATE: PolicyTemplate = {
  id: "fast_lane",
  name: "Fast Lane",
  tagline: "Ships straight to production. Pulls over for database, roles, and deletions.",
  allows: [
    "Every change executes and merges once CI passes",
    "Adding up to two database columns or new tables",
  ],
  holds: [
    "Dropping, altering, or renaming database columns and tables",
    "Deleting data or files",
    "Role, permission, and security changes",
    "Large changes (over 15 files or 400 lines)",
  ],
  rules: [
    {
      name: "Fast Lane: allow everything",
      kind: "allow",
      outcome: "execute",
      condition: { all: [{ type: "path_glob_any", globs: ["**"] }] },
      note: "Lets any change execute. The rules below pull risky changes over for review.",
    },
    {
      name: "Deletes data",
      kind: "escalate",
      outcome: "review_before_execution",
      condition: { all: [{ type: "flag", flag: "data_deletion" }] },
      note: "A developer approves the plan before any code is written.",
    },
    {
      name: "Deletes files",
      kind: "escalate",
      outcome: "review_before_merge",
      condition: { all: [{ type: "files_removed" }] },
    },
    {
      name: "Risky database migration",
      kind: "escalate",
      outcome: "review_before_merge",
      condition: {
        all: [{ type: "risky_sql", globs: MIGRATION_GLOBS, max_added_columns: 2 }],
      },
      note: "Reads the SQL in the pull request. Adding one or two columns is fine.",
      checkPaths: true,
    },
    {
      name: "Database change rated medium risk or higher",
      kind: "escalate",
      outcome: "review_before_merge",
      condition: {
        all: [
          { type: "path_glob_any", globs: MIGRATION_GLOBS },
          { type: "risk_at_least", level: "medium" },
        ],
      },
      checkPaths: true,
    },
    {
      name: "Roles and permissions",
      kind: "escalate",
      outcome: "review_before_merge",
      condition: { all: [{ type: "flag", flag: "auth" }] },
    },
    {
      name: "Role and permission files",
      kind: "escalate",
      outcome: "review_before_merge",
      condition: { all: [{ type: "path_glob_any", globs: ROLE_PERMISSION_GLOBS }] },
      checkPaths: true,
    },
    {
      name: "Security-sensitive",
      kind: "escalate",
      outcome: "review_before_merge",
      condition: { all: [{ type: "flag", flag: "security" }] },
    },
    {
      name: "Too many files",
      kind: "escalate",
      outcome: "review_before_merge",
      condition: { all: [{ type: "max_files", max: 15 }] },
    },
    {
      name: "Too many lines",
      kind: "escalate",
      outcome: "review_before_merge",
      condition: { all: [{ type: "max_lines", max: 400 }] },
    },
  ],
};

export const POLICY_TEMPLATES: PolicyTemplate[] = [FAST_LANE_TEMPLATE];
