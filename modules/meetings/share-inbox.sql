-- A project-local, OA-scoped fence also keeps older runtimes from delivering
-- retired share notifications during deployment or rollback. No live IDs here.
CREATE TABLE IF NOT EXISTS central_archive.meeting_share_delivery_policy (
 bot_id text PRIMARY KEY, push_enabled boolean NOT NULL DEFAULT false
);
CREATE OR REPLACE FUNCTION central_archive.meeting_share_no_push() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.state='pending' AND EXISTS (
  SELECT 1 FROM central_archive.meeting_workspaces w
  JOIN central_archive.conversations c ON c.key=w.conversation_key
  JOIN central_archive.meeting_share_delivery_policy p ON p.bot_id=c.bot_id
  WHERE w.id=NEW.workspace_id AND p.push_enabled=false
 ) THEN
  NEW.state='cancelled'; NEW.error_code='rich_menu_only'; NEW.lease_until=NULL;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS meeting_share_no_push ON central_archive.meeting_share_notices;
CREATE TRIGGER meeting_share_no_push BEFORE INSERT OR UPDATE OF state
 ON central_archive.meeting_share_notices FOR EACH ROW
 EXECUTE FUNCTION central_archive.meeting_share_no_push();
