'use strict';
// Fixture only: loopback HTTP and SQLite, no production provider or keys.
const http = require('node:http');
const crypto = require('node:crypto');
const {FixtureGatewayStore}=require('./xiaoye-model-gateway-store-fixture.cjs');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const only = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => fields.includes(k));

function validBody(body) {
  if (!only(body, ['model', 'input', 'stream', 'store']) || body.model !== 'fixture-model' || body.stream !== true || body.store !== false || !Array.isArray(body.input) || body.input.length < 1 || body.input.length > 8) return false;
  return body.input.every(item => only(item, ['role', 'content']) && item.role === 'user' && Array.isArray(item.content) && item.content.length === 1 && only(item.content[0], ['type', 'text']) && item.content[0].type === 'input_text' && typeof item.content[0].text === 'string' && Buffer.byteLength(item.content[0].text) <= 4096);
}

class FixtureGateway {
  constructor({clock = Date.now, dbPath=':memory:', leaseVerifier, pollIntervalMs=100} = {}) {
    if(!Number.isSafeInteger(pollIntervalMs)||pollIntervalMs<10||pollIntervalMs>1000)throw Error('invalid fixture poll interval');this.pollIntervalMs=pollIntervalMs;
    this.clock = clock;
    this.store = new FixtureGatewayStore({clock,dbPath,leaseVerifier});
    this.grants = new Map();
    this.readers = new Map(); this.activeStreams = new Map(); this.readerCount = 0;
    this.maxReaders = 4; this.maxReadersPerGrant = 1; this.readTimeoutMs = 1000;
    this.backendCalls = 0;
    this.server = http.createServer((req, res) => { this.handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });
  }
  // Only the test supervisor can call these methods. There is no HTTP issuer.
  issue(grant) { return this.store.issue(grant); }
  abortEvent(eventId){const grant=this.grants.get(eventId);if(grant){for(const req of this.readers.get(grant)||[])req.destroy();for(const abort of this.activeStreams.get(grant)||[])abort.abort();}}
  revoke(token) { const grant=this.store.revokeToken(token);if(grant)this.abortEvent(grant.event_id); }
  revokeEvent(identity) { const ack=this.store.revokeEvent(identity);this.abortEvent(identity.eventId);return ack; }
  authorize(token) { const row=this.store.authorize(token);if(!row)return null;let grant=this.grants.get(row.event_id);if(!grant){grant={eventId:row.event_id,sourceVersion:row.source_version,generation:row.generation};this.grants.set(row.event_id,grant);}return grant; }
  claim(token,request){return this.store.claim(token,request);}
  settle(claim,state){return this.store.settle(claim,state);}
  arm(token,claim){return this.store.arm(token,claim);}
  notSent(claim){return this.store.notSent(claim);}
  watch(token,onInvalid){const check=()=>{let valid=false;try{valid=!!this.authorize(token);}catch{}if(!valid)onInvalid();};const timer=setInterval(check,this.pollIntervalMs);timer.unref();check();return ()=>clearInterval(timer);}
  trackStream(grant, abort, token) { let set=this.activeStreams.get(grant); if(!set)this.activeStreams.set(grant,set=new Set()); set.add(abort);const stopWatch=this.watch(token,()=>abort.abort());return ()=>{stopWatch();set.delete(abort);if(!set.size)this.activeStreams.delete(grant);}; }
  async readBody(req,grant,maxBytes,token) {
    let set=this.readers.get(grant);if(this.readerCount>=this.maxReaders||(set?.size||0)>=this.maxReadersPerGrant)throw Object.assign(Error('too many readers'),{status:429});
    if(!set)this.readers.set(grant,set=new Set());set.add(req);this.readerCount++;let size=0,parts=[],large=false;
    const timer=setTimeout(()=>req.destroy(Error('fixture read timeout')),this.readTimeoutMs),stopWatch=this.watch(token,()=>req.destroy(Error('fixture authority ended')));
    try{for await(const chunk of req){size+=chunk.length;if(size>maxBytes){large=true;parts=[];}else if(!large)parts.push(chunk);}if(large)throw Object.assign(Error('body too large'),{status:413});return Buffer.concat(parts);}
    finally{clearTimeout(timer);stopWatch();set.delete(req);this.readerCount--;if(!set.size)this.readers.delete(grant);}
  }
  async listen() { await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve); }); return this.server.address().port; }
  async close() { await new Promise((resolve, reject) => this.server.close(err => err ? reject(err) : resolve())); this.store.close(); }
  async handle(req, res) {
    const fail = status => { res.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end('{"error":"request_rejected"}'); };
    if (req.method !== 'POST' || req.url !== '/v1/responses') return fail(404);
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || ''), token = match?.[1];
    if (!token || !this.authorize(token)) return fail(401);
    const id = req.headers['x-fixture-request-id'];
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(id)) return fail(400);
    let raw;try{raw=await this.readBody(req,this.authorize(token),16384,token);}catch(e){if(!res.destroyed)return fail(e.status||408);return;}
    let body; try { body = JSON.parse(raw.toString('utf8')); } catch { return fail(400); }
    if (!validBody(body)) return fail(400);
    const claim=this.claim(token,{mode:'fixture',requestId:id,bodyHash:'fixture'});if(claim.status!==200)return fail(claim.status);
    if(!this.arm(token,claim)){this.notSent(claim);return fail(503);}
    // Deterministic local fixture: never forwards text, URLs or credentials.
    this.backendCalls++;
    const event = {type: 'response.completed', response: {id: 'fixture-response', status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text: 'fixture response'}]}]}};
    res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-store'});
    this.settle(claim,'terminal');res.end('event: response.completed\ndata: ' + JSON.stringify(event) + '\n\n');
  }
}
module.exports = {FixtureGateway, validBody};
