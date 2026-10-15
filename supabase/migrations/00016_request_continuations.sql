-- A follow-up request keeps its own lifecycle and points at the request it continues.
-- The earlier row stays as it was (live, finished, rejected, or still in progress).

ALTER TABLE snag_requests
  ADD COLUMN IF NOT EXISTS continues_request_id uuid REFERENCES snag_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_snag_requests_continues_request_id
  ON snag_requests (continues_request_id)
  WHERE continues_request_id IS NOT NULL;

COMMENT ON COLUMN snag_requests.continues_request_id IS
  'Earlier request this one continues. Null for a request filed on its own.';
