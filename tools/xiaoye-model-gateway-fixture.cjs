'use strict';
// Fixture only: loopback HTTP, in-memory state, no production provider or keys.
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const only = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => fields.includes(k));

function validBody(body) {
  if (!only(body, ['model', 'input', 'stream', 'store']) || body.model !== 'fixture-model' || body.stream !== true || body.store !== false || !Array.isArray(body.input) || body.input.length < 1 || body.input.length > 8) return false;
  return body.input.every(item => only(item, ['role', 'content']) && item.role === 'user' && Array.isArray(item.content) && item.content.length === 1 && only(item.content[0], ['type', 'text']) && item.content[0].type === 'input_text' && typeof item.content[0].text === 'string' && Buffer.byteLength(item.content[0].text) <= 4096);
}

class FixtureGateway {
  constructor({clock = Date.now} = {}) {
    this.clock = clock;
    this.grants = new Map();
    this.issuedEvents = new Set();
    this.requests = new Set();
    this.backendCalls = 0;
    this.server = http.createServer((req, res) => { this.handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });
  }
  // Only the test supervisor can call these methods. There is no HTTP issuer.
  issue({eventId, sourceVersion, generation, expiresAt, maxRequests}) {
    assert(/^[a-f0-9]{64}$/.test(eventId) && Number.isSafeInteger(sourceVersion) && sourceVersion >= 0 && Number.isSafeInteger(generation) && generation > 0);
    assert(Number.isSafeInteger(expiresAt) && expiresAt > this.clock() && expiresAt <= this.clock() + 300000 && Number.isSafeInteger(maxRequests) && maxRequests > 0 && maxRequests <= 8);
    const eventKey = JSON.stringify([eventId, sourceVersion, generation]);
    assert(!this.issuedEvents.has(eventKey), 'Event generation already issued');
    const token = crypto.randomBytes(32).toString('base64url');
    this.issuedEvents.add(eventKey);
    this.grants.set(digest(token), {eventId, sourceVersion, generation, expiresAt, maxRequests, used: 0, revoked: false});
    return token;
  }
  revoke(token) { const grant = this.grants.get(digest(token)); if (grant) grant.revoked = true; }
  authorize(token) { const grant = this.grants.get(digest(token)); return grant && !grant.revoked && grant.expiresAt > this.clock() ? grant : null; }
  async listen() { await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve); }); return this.server.address().port; }
  async close() { await new Promise((resolve, reject) => this.server.close(err => err ? reject(err) : resolve())); }
  async handle(req, res) {
    const fail = status => { res.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end('{"error":"request_rejected"}'); };
    if (req.method !== 'POST' || req.url !== '/v1/responses') return fail(404);
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || ''), token = match?.[1];
    if (!token || !this.authorize(token)) return fail(401);
    const id = req.headers['x-fixture-request-id'];
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(id)) return fail(400);
    let size = 0, parts = [], tooLarge = false;
    for await (const chunk of req) { size += chunk.length; if (size > 16384) { tooLarge = true; parts = []; } else if (!tooLarge) parts.push(chunk); }
    if (tooLarge) return fail(413);
    let body; try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return fail(400); }
    if (!validBody(body)) return fail(400);
    // Re-check after potentially slow body upload. This atomic synchronous
    // section enforces the in-memory request limit in this single process.
    const grant = this.authorize(token); if (!grant) return fail(401);
    const requestKey = digest(JSON.stringify([grant.eventId, grant.sourceVersion, grant.generation, id]));
    if (this.requests.has(requestKey)) return fail(409);
    if (grant.used >= grant.maxRequests) return fail(429);
    this.requests.add(requestKey); grant.used++;
    // Deterministic local fixture: never forwards text, URLs or credentials.
    this.backendCalls++;
    const event = {type: 'response.completed', response: {id: 'fixture-response', status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text: 'fixture response'}]}]}};
    res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-store'});
    res.end('event: response.completed\ndata: ' + JSON.stringify(event) + '\n\n');
  }
}
module.exports = {FixtureGateway, validBody};
