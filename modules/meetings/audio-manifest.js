import {failure} from './workspace-model.js';
import {createHash} from 'node:crypto';

// A manifest is immutable for the lifetime of a generation attempt.
export const MAX_RECORDINGS = 10;
export const MAX_RECORDING_BYTES = 512 * 1024 * 1024;
export const MAX_MEETING_BYTES = 2 * 1024 * 1024 * 1024;
export const ORIGINAL_RECORDING = 'original';
const idPattern = /^[A-Za-z0-9_-]{1,200}$/;
const hashPattern = /^[a-f0-9]{64}$/;

export function validateAudioManifest(input) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_RECORDINGS) throw Error('invalid_recording_count');
  const ids = new Set(), hashes = new Set();
  let total = 0;
  const items = input.map(item => {
    if (!item || !idPattern.test(item.id || '') || typeof item.filename !== 'string' || !item.filename.trim() || item.filename.length > 180 ||
        !Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_RECORDING_BYTES || !hashPattern.test(item.hash || '')) throw Error('invalid_recording');
    if (ids.has(item.id) || hashes.has(item.hash)) throw Error('duplicate_recording');
    ids.add(item.id); hashes.add(item.hash); total += item.size;
    return {id:item.id, filename:item.filename, size:item.size, hash:item.hash};
  });
  if (total > MAX_MEETING_BYTES) throw Error('meeting_recordings_too_large');
  return items;
}

export function recordingList(workspace) {
  if (Array.isArray(workspace.receipt?.audioManifest)) return workspace.receipt.audioManifest;
  const file = workspace.receipt?.hubAudio;
  return workspace.filename ? [{id:ORIGINAL_RECORDING, filename:workspace.filename, size:Number(file?.size)||null, file}] : [];
}

export function recordingView(workspace) {
  return recordingList(workspace).map(({id, filename, size}) => ({id, filename, size}));
}

export function recordingStamp(workspace) {
  return createHash('sha256').update(JSON.stringify(recordingList(workspace).map(item=>[item.id,item.filename,item.file?.id]))).digest('hex');
}

export async function saveRecordingList({store, workspace, actor, ids, revision, folder}) {
  if (!Array.isArray(ids) || ids.length > MAX_RECORDINGS || new Set(ids).size !== ids.length ||
      ids.some(id => typeof id !== 'string' || !idPattern.test(id))) {
    throw failure(400, '請確認錄音清單，每場最多 10 份，不能重複加入。');
  }
  return store.locked(workspace.id, async (current, db) => {
    if (current.host_id !== actor.id || current.conversation_key !== workspace.conversation_key) throw failure(403, '只有原會議主持人可管理錄音。');
    if (current.receipt?.deletion?.active || !['setup','failed','review'].includes(current.state)) throw failure(409, '目前不能調整錄音清單。');
    const previous = recordingList(current);
    if (current.receipt.audioManifest && ids.length === previous.length && ids.every((id,i) => id === previous[i].id)) return;
    if (Number(current.revision) !== revision) throw failure(409, '會議已更新，請重讀錄音清單後再保存。');
    const uploads = (await db.query(`SELECT u.upload_id,u.filename,u.drive_file,s.total_bytes,s.manifest_hash,s.folder_id
      FROM central_archive.meeting_audio_uploads u JOIN central_archive.meeting_audio_streams s USING(workspace_id,upload_id)
      WHERE u.workspace_id=$1 AND u.actor_id=$2 AND u.state='saved' AND u.upload_id=ANY($3::text[])`,
      [current.id,actor.id,ids.filter(id=>id!==ORIGINAL_RECORDING)])).rows;
    const original = previous.find(item=>item.id===ORIGINAL_RECORDING);
    const items = ids.map(id => {
      if (id === ORIGINAL_RECORDING && original) return original;
      const upload = uploads.find(item=>item.upload_id===id);
      if (!upload?.drive_file?.id || folder && upload.folder_id !== folder) throw failure(409, '有錄音尚未保存，請完成上傳後再試。');
      return {id,filename:upload.filename,size:Number(upload.total_bytes),hash:upload.manifest_hash,file:upload.drive_file};
    });
    try {
      const newFiles = items.filter(item=>item.id!==ORIGINAL_RECORDING);
      if (newFiles.length) validateAudioManifest(newFiles);
      if (items.reduce((n,item)=>n+(item.size||0),0)>MAX_MEETING_BYTES) throw Error('meeting_recordings_too_large');
      if (new Set(items.flatMap(item=>item.file?.id?[item.file.id]:[])).size !== items.filter(item=>item.file?.id).length) throw Error('duplicate_recording');
    } catch (error) {
      if (error.message === 'duplicate_recording') throw failure(409, '錄音清單中有內容相同的檔案，請移除其中一份。');
      throw failure(400, '錄音大小或格式不符，每份最多 512 MB，每場總計最多 2 GB。');
    }
    const receipt={...current.receipt,audioManifest:items};
    if(current.state==='failed'&&Array.isArray(current.receipt.generationSnapshot?.recordings)){
      const omitted=current.receipt.generationSnapshot.recordings.filter(item=>!ids.includes(item.id));
      receipt.audioOmissions=[...new Set([...(receipt.audioOmissions||[]),...omitted.map(item=>item.id)])].filter(id=>!ids.includes(id));
    }
    if(current.state==='review'&&!Array.isArray(receipt.generationSnapshot?.recordings)){
      receipt.generationSnapshot={...receipt.generationSnapshot,recordings:previous};
    }
    await db.query(`UPDATE central_archive.meeting_workspaces
      SET receipt=$2::jsonb,filename=$3,revision=revision+1,updated_at=now() WHERE id=$1`,
      [current.id,JSON.stringify(receipt),items[0]?.filename||'']);
  });
}

// Labels from separate transcription jobs are never assumed to identify the
// same speaker. Preserve file-local times and source IDs for later playback.
export function combineRecordingSegments(manifest, results) {
  const files = manifest;
  if (!Array.isArray(results) || results.length !== files.length) throw Error('incomplete_transcription');
  return files.flatMap((file, index) => {
    const result = results[index];
    if (!result || result.recordingId !== file.id || !Array.isArray(result.segments) || !result.segments.length) throw Error('incomplete_transcription');
    return result.segments.map(segment => {
      if (!segment || typeof segment.speaker !== 'string' || !segment.speaker.trim() || typeof segment.text !== 'string' || !segment.text.trim() ||
          !Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end) || segment.start < 0 || segment.end < segment.start) throw Error('invalid_segment');
      return {recordingId:file.id, recordingIndex:index + 1, speaker:`第${index + 1}段講者 ${segment.speaker.trim()}`, start:segment.start, end:segment.end, text:segment.text};
    });
  });
}

export function recordingTimestamp(index, milliseconds) {
  return index+'@'+Math.floor(milliseconds/60000)+':'+String(Math.floor(milliseconds/1000)%60).padStart(2,'0');
}
