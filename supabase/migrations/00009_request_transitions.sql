-- ============================================================
-- Request transition log: one row per status or phase change, so the admin
-- dashboard can measure how long requests wait in each status.
--
-- Written by a trigger rather than by application code: the relay, webhook,
-- delivery worker, and admin panel all update snag_requests, and several of
-- those writes bypass the lifecycle helpers.
-- ============================================================

CREATE TABLE IF NOT EXISTS snag_request_transitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES snag_requests(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES snag_projects(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  phase text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snag_request_transitions_request
  ON snag_request_transitions (request_id, at, id);

CREATE INDEX IF NOT EXISTS idx_snag_request_transitions_project_at
  ON snag_request_transitions (project_id, at DESC);

ALTER TABLE snag_request_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on snag_request_transitions" ON snag_request_transitions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Org members can read their request transitions" ON snag_request_transitions
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM snag_projects
      WHERE organization_id IN (SELECT public.user_org_ids())
    )
  );

CREATE OR REPLACE FUNCTION public.log_snag_request_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO snag_request_transitions (request_id, project_id, from_status, to_status, phase)
    VALUES (NEW.id, NEW.project_id, NULL, NEW.status, NEW.phase);
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.phase IS DISTINCT FROM OLD.phase THEN
    INSERT INTO snag_request_transitions (request_id, project_id, from_status, to_status, phase)
    VALUES (NEW.id, NEW.project_id, OLD.status, NEW.status, NEW.phase);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snag_requests_log_transition ON snag_requests;
CREATE TRIGGER snag_requests_log_transition
  AFTER INSERT OR UPDATE OF status, phase ON snag_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.log_snag_request_transition();

COMMENT ON TABLE snag_request_transitions IS
  'Status/phase history for snag_requests, written by trigger. Starts empty for requests filed before this migration.';
