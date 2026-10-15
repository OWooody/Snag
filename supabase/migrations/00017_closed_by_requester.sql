-- ============================================================
-- Requesters can close a request that is still open. The row
-- stays for history, and Snag stops merging it or asking a
-- developer to review it.
-- ============================================================

ALTER TABLE snag_requests
  ADD COLUMN IF NOT EXISTS close_note text,
  ADD CONSTRAINT snag_requests_close_note_length CHECK (
    close_note IS NULL OR char_length(close_note) <= 500
  );

ALTER TABLE snag_requests
  DROP CONSTRAINT IF EXISTS snag_requests_status_check;

ALTER TABLE snag_requests
  ADD CONSTRAINT snag_requests_status_check CHECK (
    status IN (
      'queued',
      'running',
      'finished',
      'error',
      'needs_input',
      'awaiting_requester',
      'awaiting_approval',
      'awaiting_review',
      'awaiting_confirmation',
      'merged',
      'rejected',
      'closed_by_requester'
    )
  );

COMMENT ON COLUMN snag_requests.close_note IS
  'Optional note from the requester who closed the request. Shown to developers.';

CREATE OR REPLACE FUNCTION public.snag_impact_metrics(p_project_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT greatest(1, least(coalesce(p_days, 30), 90)) AS days
),
range AS (
  SELECT
    b.days,
    (date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => b.days - 1)) AT TIME ZONE 'UTC'
      AS since
  FROM bounds b
),
reqs AS (
  SELECT
    r.id,
    r.status,
    r.created_at,
    r.merged_at,
    r.pr_url,
    r.context,
    coalesce(r.requester, 'ip:' || r.requester_ip) AS who,
    CASE
      WHEN r.status IN ('merged', 'finished', 'error', 'rejected', 'closed_by_requester') THEN r.status
      ELSE 'in_progress'
    END AS outcome
  FROM snag_requests r, range g
  WHERE r.project_id = p_project_id
    AND r.created_at >= g.since
),
daily AS (
  SELECT
    (g.since AT TIME ZONE 'UTC')::date + i AS day,
    count(r.id) FILTER (WHERE r.outcome = 'merged') AS merged,
    count(r.id) FILTER (WHERE r.outcome = 'finished') AS finished,
    count(r.id) FILTER (WHERE r.outcome = 'in_progress') AS in_progress,
    count(r.id) FILTER (WHERE r.outcome = 'error') AS error,
    count(r.id) FILTER (WHERE r.outcome = 'rejected') AS rejected,
    count(r.id) FILTER (WHERE r.outcome = 'closed_by_requester') AS closed_by_requester
  FROM range g
  CROSS JOIN generate_series(0, g.days - 1) AS i
  LEFT JOIN reqs r ON (r.created_at AT TIME ZONE 'UTC')::date = (g.since AT TIME ZONE 'UTC')::date + i
  GROUP BY 1
),
trans AS (
  SELECT
    t.request_id,
    t.to_status,
    t.at,
    lead(t.at) OVER (PARTITION BY t.request_id ORDER BY t.at, t.id) AS next_at
  FROM snag_request_transitions t
  WHERE t.project_id = p_project_id
    AND t.request_id IN (SELECT id FROM reqs)
),
per_req AS (
  SELECT
    r.id,
    r.created_at,
    r.merged_at,
    (SELECT min(t.at) FROM trans t
      WHERE t.request_id = r.id
        AND t.to_status IN ('finished', 'awaiting_review', 'awaiting_confirmation', 'merged'))
      AS agent_done_at,
    (SELECT sum(extract(epoch FROM t.next_at - t.at)) FROM trans t
      WHERE t.request_id = r.id AND t.to_status = 'running' AND t.next_at IS NOT NULL)
      AS running_seconds,
    (SELECT count(*) FROM trans t
      WHERE t.request_id = r.id AND t.to_status IN ('needs_input', 'awaiting_requester'))
      AS followups,
    EXISTS (SELECT 1 FROM trans t WHERE t.request_id = r.id) AS has_history
  FROM reqs r
),
pages AS (
  SELECT
    r.id,
    r.outcome,
    snag_normalize_path(coalesce(
      r.context->'snag_auto'->>'pathname',
      r.context->'snag_auto'->>'screenName'
    )) AS key
  FROM reqs r
),
elements AS (
  SELECT r.id, r.outcome, e
  FROM reqs r
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r.context->'snag_elements') = 'array'
      THEN r.context->'snag_elements' ELSE '[]'::jsonb END
  ) e
),
components AS (
  SELECT DISTINCT id, outcome, left(btrim(e->>'component'), 120) AS key
  FROM elements
  WHERE nullif(btrim(e->>'component'), '') IS NOT NULL
),
files AS (
  SELECT DISTINCT id, outcome, left(btrim(e->'source'->>'file'), 200) AS key
  FROM elements
  WHERE nullif(btrim(e->'source'->>'file'), '') IS NOT NULL
)
SELECT jsonb_build_object(
  'range_days', (SELECT days FROM range),
  'since', (SELECT since FROM range),
  'total', (SELECT count(*) FROM reqs),
  'outcomes', coalesce(
    (SELECT jsonb_object_agg(outcome, n) FROM (
      SELECT outcome, count(*) AS n FROM reqs GROUP BY outcome
    ) o),
    '{}'::jsonb
  ),
  'funnel', jsonb_build_object(
    'submitted', (SELECT count(*) FROM reqs),
    'agent_done', (SELECT count(*) FROM reqs
      WHERE status IN ('finished', 'awaiting_review', 'awaiting_confirmation', 'merged')),
    'pr_opened', (SELECT count(*) FROM reqs WHERE pr_url IS NOT NULL),
    'merged', (SELECT count(*) FROM reqs WHERE status = 'merged')
  ),
  'daily', coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
        'day', to_char(day, 'YYYY-MM-DD'),
        'merged', merged,
        'finished', finished,
        'in_progress', in_progress,
        'error', error,
        'rejected', rejected,
        'closed_by_requester', closed_by_requester
      ) ORDER BY day)
     FROM daily),
    '[]'::jsonb
  ),
  'hotspots', jsonb_build_object(
    'pages', coalesce(
      (SELECT jsonb_agg(jsonb_build_object('key', key, 'requests', n, 'merged', m)
          ORDER BY n DESC, key)
       FROM (
        SELECT key, count(*) AS n, count(*) FILTER (WHERE outcome = 'merged') AS m
        FROM pages WHERE key IS NOT NULL
        GROUP BY key ORDER BY n DESC, key LIMIT 8
      ) p),
      '[]'::jsonb
    ),
    'components', coalesce(
      (SELECT jsonb_agg(jsonb_build_object('key', key, 'requests', n, 'merged', m)
          ORDER BY n DESC, key)
       FROM (
        SELECT key, count(*) AS n, count(*) FILTER (WHERE outcome = 'merged') AS m
        FROM components
        GROUP BY key ORDER BY n DESC, key LIMIT 8
      ) c),
      '[]'::jsonb
    ),
    'files', coalesce(
      (SELECT jsonb_agg(jsonb_build_object('key', key, 'requests', n, 'merged', m)
          ORDER BY n DESC, key)
       FROM (
        SELECT key, count(*) AS n, count(*) FILTER (WHERE outcome = 'merged') AS m
        FROM files
        GROUP BY key ORDER BY n DESC, key LIMIT 8
      ) f),
      '[]'::jsonb
    ),
    'with_page', (SELECT count(*) FROM pages WHERE key IS NOT NULL),
    'with_elements', (SELECT count(DISTINCT id) FROM elements)
  ),
  'speed', jsonb_build_object(
    'submit_to_agent_done', (
      SELECT jsonb_build_object(
        'count', count(*),
        'p50_seconds', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM agent_done_at - created_at)),
        'p90_seconds', percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM agent_done_at - created_at))
      )
      FROM per_req WHERE agent_done_at IS NOT NULL
    ),
    'submit_to_merge', (
      SELECT jsonb_build_object(
        'count', count(*),
        'p50_seconds', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM merged_at - created_at)),
        'p90_seconds', percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM merged_at - created_at))
      )
      FROM per_req WHERE merged_at IS NOT NULL
    )
  ),
  'effort', jsonb_build_object(
    'agent_run', (
      SELECT jsonb_build_object(
        'count', count(*),
        'p50_seconds', percentile_cont(0.5) WITHIN GROUP (ORDER BY running_seconds),
        'p90_seconds', percentile_cont(0.9) WITHIN GROUP (ORDER BY running_seconds)
      )
      FROM per_req WHERE running_seconds IS NOT NULL
    ),
    'total_agent_seconds', coalesce((SELECT sum(running_seconds) FROM per_req), 0),
    'tracked_requests', (SELECT count(*) FROM per_req WHERE has_history),
    'with_followups', (SELECT count(*) FROM per_req WHERE has_history AND followups > 0),
    'followup_rounds', coalesce((SELECT sum(followups) FROM per_req WHERE has_history), 0)
  ),
  'requesters', jsonb_build_object(
    'active', (SELECT count(DISTINCT who) FROM reqs)
  ),
  'history_started_at', (
    SELECT min(at) FROM snag_request_transitions WHERE project_id = p_project_id
  )
);
$$;


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
      WHEN r.status = 'closed_by_requester' THEN 'closed_by_requester'
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

