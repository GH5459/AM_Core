-- Install with the project-local schema owner. Runtime credentials do not
-- require DDL privileges. This does not modify any existing business row.
CREATE OR REPLACE FUNCTION central_archive.guard_meeting_publication_route()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='publishing'
    AND NEW.receipt->'publicationTarget'->>'key' IS NOT NULL
    AND NEW.receipt->'publicationTarget'->>'key'<>NEW.conversation_key THEN
  -- Old workers recover only finite/empty lease_until values and must never
  -- deliver an alternate-destination publication to its original source.
  NEW.lease_until := 'infinity'::timestamptz;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS meeting_publication_route_guard ON central_archive.meeting_workspaces;
CREATE TRIGGER meeting_publication_route_guard
BEFORE INSERT OR UPDATE ON central_archive.meeting_workspaces
FOR EACH ROW EXECUTE FUNCTION central_archive.guard_meeting_publication_route();
