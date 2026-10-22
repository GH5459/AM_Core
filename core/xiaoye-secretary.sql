CREATE TABLE IF NOT EXISTS xiaoye_operations (
 id TEXT PRIMARY KEY,
 guard INTEGER NOT NULL CHECK(guard=1),
 fingerprint TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES work_items(id)
 DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS xiaoye_draft_operations (
 id TEXT PRIMARY KEY,
 guard INTEGER NOT NULL CHECK(guard=1)
);
CREATE TABLE IF NOT EXISTS xiaoye_draft_image_chunks (
 draft_key TEXT NOT NULL,
 image_id TEXT NOT NULL,
 part INTEGER NOT NULL,
 content BLOB NOT NULL,
 PRIMARY KEY(draft_key,image_id,part)
);
