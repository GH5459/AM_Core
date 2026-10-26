import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createLoginContinuation, postgresContinuationStore} from '../core/login-continuation.js';

test('actual PostgreSQL-compatible isolated database: one concurrent exchange, source revocation, original rows preserved', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE SCHEMA central_archive; CREATE TABLE central_archive.original_business(id text PRIMARY KEY,value jsonb); INSERT INTO central_archive.original_business VALUES('original','{\"unchanged\":true}')");
    await db.exec(fs.readFileSync(new URL('../core/login-continuation.sql',import.meta.url),'utf8'));
    await db.exec('CREATE ROLE continuation_restricted; GRANT USAGE ON SCHEMA central_archive TO continuation_restricted; GRANT SELECT ON central_archive.original_business TO continuation_restricted; GRANT SELECT,INSERT,UPDATE,DELETE ON central_archive.login_continuation TO continuation_restricted; SET ROLE continuation_restricted;');
    assert.equal((await db.query("SELECT has_schema_privilege(current_user,'central_archive','CREATE') AS allowed")).rows[0].allowed,false);
    const store = postgresContinuationStore(db), reference = 'a'.repeat(64), principal = {account:'900001',reference,generation:'fixture-generation',active:true,expiresAt:Date.now()+3600000};
    const broker = createLoginContinuation({store,sources:{dailylog:{validate:async()=>principal}},targets:{uof:{origin:'https://uof.example.test',ttlMs:1800000,acceptsReturn:u=>u.pathname==='/'&&!u.search,authorize:async()=>({allowed:true,soap:false,attachments:false})}}});
    const root = await broker.register('dailylog',reference), verifier=crypto.randomBytes(32).toString('base64url'), challenge=crypto.createHash('sha256').update(verifier).digest('hex');
    const ticket=await broker.issue(root.token,{target:'uof',returnPath:'/',challenge});
    const results=await Promise.allSettled(Array.from({length:12},()=>broker.exchange({code:ticket.code,target:'uof',targetOrigin:'https://uof.example.test',verifier})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const chain=results.find(r=>r.status==='fulfilled').value;
    assert.equal((await broker.check(chain.token,'uof')).account,'900001');
    await broker.logout(root.token);
    await assert.rejects(()=>broker.check(chain.token,'uof'));
    const business=await db.query('SELECT * FROM central_archive.original_business');
    assert.deepEqual(business.rows,[{id:'original',value:{unchanged:true}}]);
    const tickets=await db.query("SELECT count(*)::int n FROM central_archive.login_continuation WHERE kind='ticket'");
    assert.equal(tickets.rows[0].n,0);
  } finally {await db.close();}
});
