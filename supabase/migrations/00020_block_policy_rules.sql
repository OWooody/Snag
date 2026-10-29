-- Block rules reject a request when every condition matches, so the agent
-- does not modify the listed files. `blocked` is not a project default.

ALTER TABLE snag_policy_rules
  DROP CONSTRAINT IF EXISTS snag_policy_rules_kind_check;

ALTER TABLE snag_policy_rules
  ADD CONSTRAINT snag_policy_rules_kind_check CHECK (kind IN ('allow', 'escalate', 'block'));

ALTER TABLE snag_policy_rules
  DROP CONSTRAINT IF EXISTS snag_policy_rules_outcome_check;

ALTER TABLE snag_policy_rules
  ADD CONSTRAINT snag_policy_rules_outcome_check CHECK (
    (kind = 'allow' AND outcome = 'execute')
    OR (kind = 'escalate' AND outcome IN ('review_before_merge', 'review_before_execution'))
    OR (kind = 'block' AND outcome = 'blocked')
  );
