-- ============================================================
-- Execute-mode metrics for the admin dashboard. One call returns every card
-- as aggregates only (counts, durations, rule names): no prompts, summaries,
-- or requester ids.
--
-- SECURITY INVOKER: under a user session, RLS limits it to the caller's
-- organizations. The admin panel calls it with the service role after its own
-- project access check.
-- ============================================================

CREATE OR REPLACE FUNCTION public.snag_execute_metrics(p_project_id uuid, p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90))) AS since
),
reqs AS (
  SELECT
    r.id,
    r.status,
    r.policy_decision,
    r.handoff_reason,
    r.created_at,
    r.merged_at,
    CASE
      WHEN r.status = 'rejected' THEN 'rejected'
      WHEN r.policy_decision->'plan'->>'outcome' = 'review_before_execution'
        THEN 'review_before_execution'
      ELSE coalesce(
        r.policy_decision->>'final_outcome',
        r.policy_decision->'plan'->>'outcome',
        'undecided'
      )
    END AS outcome
  FROM snag_requests r, bounds b
  WHERE r.project_id = p_project_id
    AND r.phase IS NOT NULL
    AND r.created_at >= b.since
),
rule_hits AS (
  SELECT r.id AS request_id, m->>'id' AS rule_id, m->>'name' AS rule_name, m->>'kind' AS kind
  FROM reqs r
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements(coalesce(r.policy_decision->'plan'->'matched', '[]'::jsonb)) AS m
    UNION ALL
    SELECT jsonb_array_elements(coalesce(r.policy_decision->'diff'->'matched', '[]'::jsonb))
  ) matched
  WHERE m->>'kind' IS DISTINCT FROM 'allow'
    AND coalesce((m->>'shadow')::boolean, false) = false
),
waits AS (
  SELECT
    t.to_status,
    extract(epoch FROM lead(t.at) OVER (PARTITION BY t.request_id ORDER BY t.at, t.id) - t.at)
      AS seconds
  FROM snag_request_transitions t, bounds b
  WHERE t.project_id = p_project_id
    AND t.at >= b.since
)
SELECT jsonb_build_object(
  'range_days', greatest(1, least(coalesce(p_days, 7), 90)),
  'total', (SELECT count(*) FROM reqs),
  'outcomes', coalesce(
    (SELECT jsonb_object_agg(outcome, n) FROM (
      SELECT outcome, count(*) AS n FROM reqs GROUP BY outcome
    ) o),
    '{}'::jsonb
  ),
  'merged', jsonb_build_object(
    'by_snag', (SELECT count(*) FROM reqs
      WHERE status = 'merged' AND policy_decision->>'final_outcome' = 'execute'),
    'by_developer', (SELECT count(*) FROM reqs
      WHERE status = 'merged' AND policy_decision->>'final_outcome' IS DISTINCT FROM 'execute')
  ),
  'top_escalations', coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', rule_id, 'name', rule_name, 'kind', kind, 'requests', requests
      ) ORDER BY requests DESC, rule_name)
     FROM (
      SELECT rule_id, max(rule_name) AS rule_name, max(kind) AS kind,
        count(DISTINCT request_id) AS requests
      FROM rule_hits
      GROUP BY rule_id
      ORDER BY requests DESC, max(rule_name)
      LIMIT 5
    ) top),
    '[]'::jsonb
  ),
  'shadow', jsonb_build_object(
    'decided', (SELECT count(*) FROM reqs
      WHERE policy_decision ? 'plan' OR policy_decision ? 'diff'),
    'disagreements', (SELECT count(*) FROM reqs r WHERE EXISTS (
      SELECT 1
      FROM (VALUES (r.policy_decision->'plan'), (r.policy_decision->'diff')) AS stage(d)
      WHERE d IS NOT NULL
        AND (d->>'shadow_outcome' IS DISTINCT FROM d->>'outcome'
          OR d->>'computed_outcome' IS DISTINCT FROM d->>'outcome')
    ))
  ),
  'handoff_reasons', coalesce(
    (SELECT jsonb_agg(jsonb_build_object('reason', handoff_reason, 'requests', n)
        ORDER BY n DESC, handoff_reason)
     FROM (
      SELECT handoff_reason, count(*) AS n
      FROM reqs
      WHERE handoff_reason IS NOT NULL
      GROUP BY handoff_reason
      ORDER BY n DESC, handoff_reason
      LIMIT 5
    ) h),
    '[]'::jsonb
  ),
  'waits', coalesce(
    (SELECT jsonb_object_agg(to_status, jsonb_build_object(
        'count', n, 'p50_seconds', p50, 'p90_seconds', p90
      ))
     FROM (
      SELECT to_status, count(*) AS n,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) AS p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY seconds) AS p90
      FROM waits
      WHERE seconds IS NOT NULL
        AND to_status IN ('awaiting_approval', 'awaiting_review', 'awaiting_confirmation')
      GROUP BY to_status
    ) w),
    '{}'::jsonb
  ),
  'submit_to_merge', (
    SELECT jsonb_build_object(
      'count', count(*),
      'p50_seconds', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM merged_at - created_at)),
      'p90_seconds', percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM merged_at - created_at))
    )
    FROM reqs
    WHERE merged_at IS NOT NULL
  ),
  'history_started_at', (
    SELECT min(at) FROM snag_request_transitions WHERE project_id = p_project_id
  )
);
$$;

REVOKE ALL ON FUNCTION public.snag_execute_metrics(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snag_execute_metrics(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.snag_execute_metrics(uuid, integer) IS
  'Aggregated execute-mode metrics for one project over the last p_days (1-90) days. Counts and durations only.';
