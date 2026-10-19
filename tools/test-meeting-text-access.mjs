import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {meetingMultilingual,MEETING_TEXT_SCHEMA} from '../modules/meetings/multilingual.js';
const db=new PGlite();try{
 await db.exec('CREATE SCHEMA central_archive;'+MEETING_TEXT_SCHEMA+'CREATE ROLE meeting_restricted;GRANT USAGE ON SCHEMA central_archive TO meeting_restricted;GRANT SELECT,INSERT,UPDATE ON central_archive.meeting_text_translations_v1,central_archive.meeting_text_replies_v1 TO meeting_restricted;SET ROLE meeting_restricted;');
 const locale=meetingMultilingual({pool:db,platform:{},tenantFor:()=>({})});
 assert.deepEqual(await locale.list({id:'synthetic-meeting'}),[]);
 await assert.rejects(()=>db.query('CREATE INDEX IF NOT EXISTS meeting_text_replies_v1_order ON central_archive.meeting_text_replies_v1(workspace_id,created_at)'),{code:'42501'});
 console.log('Installed meeting text reads work with the restricted runtime role; existing tables require no schema/index creation, and schema creation remains denied.');
}finally{await db.close();}
