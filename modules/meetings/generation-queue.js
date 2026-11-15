import { randomUUID } from 'node:crypto';

export const GENERATION_CONTRACT = 'meeting-generation-checkpoints-v1';
const LEASE = "now()+interval '2 minutes'";
let running = false;

// Shared by all conversation service instances in this Node process, including
// pre-cutover LINE jobs. Callers leave the source job waiting when busy.
export function reserveMeetingGeneration() {
  if (running) return null;
  running = true;
  return () => { running = false; };
}

export class GenerationWait extends Error {
  constructor(seconds) {
    super('meeting_generation_wait');
    this.seconds = seconds;
  }
}

export async function claimGeneration(pool, id) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // The transaction lock serializes claims across OA services and overlapping
    // Render deployments. No database connection is held during provider calls.
    const lock = await db.query("SELECT pg_try_advisory_xact_lock(hashtext('am-meeting-generation-v1')) AS acquired");
    let job;
    if (lock.rows[0].acquired) {
      const token = randomUUID();
      const result = await db.query(`UPDATE central_archive.meeting_workspaces AS w
         SET lease_until=${LEASE}, receipt=w.receipt||jsonb_build_object('generationLease',$2::text)
         WHERE w.id=$1 AND w.state='processing' AND (w.lease_until IS NULL OR w.lease_until<=now())
           AND NOT EXISTS (SELECT 1 FROM central_archive.meeting_workspaces AS a
             WHERE a.state='processing' AND a.lease_until>now()
               AND (a.receipt?'generationLease' OR NOT (a.receipt?'generationProgress')))
         RETURNING w.*`, [id,token]);
      job = result.rows[0];
    }
    await db.query('COMMIT');
    return job;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export function generationCheckpoint(pool, job) {
  const token = job.receipt.generationLease;
  let progress = job.receipt.generationProgress || {};
  async function update(sql, params=[]) {
    const result = await pool.query(`UPDATE central_archive.meeting_workspaces SET ${sql}
      WHERE id=$1 AND state='processing' AND receipt->>'generationLease'=$2 RETURNING id`, [job.id,token,...params]);
    if (!result.rows.length) throw Error('meeting_generation_lease_lost');
  }
  return {
    get value() { return progress; },
    heartbeat: () => update(`lease_until=${LEASE}`),
    async save(patch) {
      const next = {...progress,...patch};
      await update(`receipt=jsonb_set(receipt,'{generationProgress}',$3::jsonb),lease_until=${LEASE}`,[JSON.stringify(next)]);
      progress = next;
    },
    defer: (seconds,message='') => update(
      `receipt=receipt-'generationLease',lease_until=now()+$3::integer*interval '1 second',error_code=$4`,[seconds,message]),
    fail: message => update("receipt=receipt-'generationLease',state='failed',lease_until=NULL,error_code=$3,updated_at=now()",[message]),
    finish: (fields,versions,result) => update(
      `fields=$3::jsonb,field_versions=$4::jsonb,record_blocks='[]'::jsonb,result=$5::jsonb,
       receipt=receipt-'generationLease'-'generationProgress',state='review',revision=revision+1,lease_until=NULL,error_code='',updated_at=now()`,
      [JSON.stringify(fields),JSON.stringify(versions),JSON.stringify(result)]),
  };
}
