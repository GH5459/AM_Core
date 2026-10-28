import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const base=require('../versions/AM-IMP-2026.1028.04/build.cjs');
const compact=require('../versions/AM-IMP-2026.1028.05/build.cjs');
const quick=require('../versions/AM-IMP-2026.1028.06/build.cjs');
const cancel=require('../versions/AM-IMP-2026.1028.07/build.cjs');
const speed=require('../versions/AM-IMP-2026.1028.08/build.cjs');
test('embedded meeting uses its own shell and the journal Calendar without an initial remote calendar read',()=>{
 const source=cancel.patchClient(quick.patchClient(compact.patchClient(base.clientSource().replace(/\r\n/g,'\n'))));
 const updated=speed.patchClient(source);
 assert.doesNotThrow(()=>new Function(updated));
 assert.match(updated,/dailylogCalendarEvents/);
 assert.match(updated,/target\.pathname==='\/meetings\/review\/hub'\?null:await fetch/);
 assert.match(updated,/dailylogMeetingEmbedded&&!new URLSearchParams\(location\.search\)\.get\('event'\)/);
 assert.match(updated,/cancelDailylogCalendarEntry/,'The newer cancellation feature remains installed');
 assert.throws(()=>speed.patchClient('unexpected current client'));
});
test('gateway keeps the daily journal display scoped to one day while reading one week',()=>{
 const gateway=readFileSync(new URL('../versions/AM-IMP-2026.1028.04/dailylog-meetings.mjs',import.meta.url),'utf8');
 const updated=speed.patchGateway(gateway);
 assert.match(updated,/calendarState\.loadedKey===key\?eventsForDate\(calendarState\.events,selectedDate\)/);
 assert.match(updated,/timeMax:addDays\(date,7\)/);
 assert.throws(()=>speed.patchGateway('unexpected gateway'));
});
