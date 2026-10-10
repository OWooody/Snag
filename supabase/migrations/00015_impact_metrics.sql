-- ============================================================
-- Impact metrics for the admin Insights pages: where requests come from,
-- how far they get, how fast they ship, and how much agent effort they take.
-- Aggregates only (counts, durations, page paths, component and file names):
-- no prompts, summaries, or requester ids.
--
-- snag_impact_metrics is SECURITY INVOKER like snag_execute_metrics; the admin
-- panel calls it with the service role after its own project access check.
-- snag_platform_impact_metrics spans every tenant and is service-role only.
-- ============================================================

-- Collapse record ids out of a page path so /orders/8812 and /orders/9931
-- count as one page: UUIDs, all-digit segments, and long tokens containing a
-- digit become :id. Query strings and fragments are dropped.
CREATE OR REPLACE FUNCTION public.snag_normalize_path(p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_path IS NULL OR btrim(p_path) = '' THEN NULL
    ELSE left(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            split_part(split_part(btrim(p_path), '?', 1), '#', 1),
            '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=/|$)',
            '/:id', 'g'),
          '/[0-9]+(?=/|$)', '/:id', 'g'),
        '/(?=[A-Za-z_-]*[0-9])[A-Za-z0-9_-]{16,}(?=/|$)', '/:id', 'g'),
      200)
  END;
$$;

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
      WHEN r.status IN ('merged', 'finished', 'error', 'rejected') THEN r.status
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
    count(r.id) FILTER (WHERE r.outcome = 'rejected') AS rejected
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
        'rejected', rejected
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

CREATE OR REPLACE FUNCTION public.snag_platform_impact_metrics(p_days integer DEFAULT 30)
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
    r.project_id,
    r.status,
    r.created_at,
    r.merged_at,
    r.pr_url,
    coalesce(r.requester, 'ip:' || r.requester_ip) AS who
  FROM snag_requests r, range g
  WHERE r.created_at >= g.since
),
run AS (
  SELECT request_id, sum(extract(epoch FROM next_at - at)) AS seconds
  FROM (
    SELECT
      t.request_id,
      t.to_status,
      t.at,
      lead(t.at) OVER (PARTITION BY t.request_id ORDER BY t.at, t.id) AS next_at
    FROM snag_request_transitions t
    WHERE t.request_id IN (SELECT id FROM reqs)
  ) s
  WHERE to_status = 'running' AND next_at IS NOT NULL
  GROUP BY request_id
),
daily AS (
  SELECT
    (g.since AT TIME ZONE 'UTC')::date + i AS day,
    count(r.id) AS requests,
    count(r.id) FILTER (WHERE r.status = 'merged') AS merged
  FROM range g
  CROSS JOIN generate_series(0, g.days - 1) AS i
  LEFT JOIN reqs r ON (r.created_at AT TIME ZONE 'UTC')::date = (g.since AT TIME ZONE 'UTC')::date + i
  GROUP BY 1
),
tenants AS (
  SELECT
    p.slug,
    p.name,
    p.enabled,
    o.name AS organization_name,
    count(r.id) AS total,
    count(r.id) FILTER (WHERE r.pr_url IS NOT NULL) AS pr_opened,
    count(r.id) FILTER (WHERE r.status = 'merged') AS merged,
    count(r.id) FILTER (WHERE r.status = 'error') AS errored,
    count(r.id) FILTER (WHERE r.status = 'rejected') AS rejected,
    count(DISTINCT r.who) AS requesters,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.merged_at - r.created_at))
      FILTER (WHERE r.merged_at IS NOT NULL) AS p50_submit_to_merge_seconds,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY run.seconds)
      FILTER (WHERE run.seconds IS NOT NULL) AS p50_agent_run_seconds,
    coalesce(sum(run.seconds), 0) AS total_agent_seconds
  FROM snag_projects p
  LEFT JOIN snag_organizations o ON o.id = p.organization_id
  LEFT JOIN reqs r ON r.project_id = p.id
  LEFT JOIN run ON run.request_id = r.id
  GROUP BY p.id, p.slug, p.name, p.enabled, o.name
)
SELECT jsonb_build_object(
  'range_days', (SELECT days FROM range),
  'since', (SELECT since FROM range),
  'totals', jsonb_build_object(
    'requests', (SELECT count(*) FROM reqs),
    'pr_opened', (SELECT count(*) FROM reqs WHERE pr_url IS NOT NULL),
    'merged', (SELECT count(*) FROM reqs WHERE status = 'merged'),
    'errored', (SELECT count(*) FROM reqs WHERE status = 'error'),
    'active_tenants', (SELECT count(DISTINCT project_id) FROM reqs),
    'requesters', (SELECT count(DISTINCT project_id::text || ':' || who) FROM reqs),
    'total_agent_seconds', coalesce((SELECT sum(seconds) FROM run), 0)
  ),
  'daily', coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
        'day', to_char(day, 'YYYY-MM-DD'),
        'requests', requests,
        'merged', merged
      ) ORDER BY day)
     FROM daily),
    '[]'::jsonb
  ),
  'tenants', coalesce(
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.total DESC, t.slug) FROM tenants t),
    '[]'::jsonb
  )
);
$$;

REVOKE ALL ON FUNCTION public.snag_impact_metrics(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snag_impact_metrics(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.snag_platform_impact_metrics(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snag_platform_impact_metrics(integer) TO service_role;

COMMENT ON FUNCTION public.snag_normalize_path(text) IS
  'Page path with record ids collapsed to :id, for grouping requests by page.';
COMMENT ON FUNCTION public.snag_impact_metrics(uuid, integer) IS
  'Impact metrics for one project over the last p_days (1-90) UTC days: volume, funnel, hotspots, speed, agent effort. Aggregates only.';
COMMENT ON FUNCTION public.snag_platform_impact_metrics(integer) IS
  'Cross-tenant impact rollup over the last p_days (1-90) UTC days. Service role only.';
