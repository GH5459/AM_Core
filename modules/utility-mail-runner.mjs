import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const utilityMailPath = '/integrations/utility-bill-mail';

export function createUtilityMailRunner(env) {
  const origin = env.UTILITY_MAIL_PORTAL;
  const jobs = [];
  let working = false;
  let checking = 0;

  async function run({lease, job}) {
    const temp = await mkdtemp(join(tmpdir(), 'utility-mail-'));
    try {
      const script = join(temp, 'reader.pyz');
      const bundle = await readFile('/etc/secrets/utility-mail.pyz.b64', 'ascii');
      await writeFile(script, Buffer.from(bundle, 'base64'), {mode:0o600, flag:'wx'});
      await new Promise((resolve,reject) => {
        const child = spawn('python3', ['-B', script, origin, '/etc/secrets/utility-mail-settings.env'],
          {stdio:['pipe','ignore','ignore'], env:{PATH:process.env.PATH, PYTHONUTF8:'1'}});
        const timer = setTimeout(() => child.kill('SIGKILL'), 18 * 60000);
        child.stdin.on('error', () => {});
        child.on('error', error => {clearTimeout(timer); reject(error);});
        child.on('close', code => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error('reader failed'));
        });
        child.stdin.end(JSON.stringify({lease, job}) + '\n');
      });
    } finally {
      await rm(temp,{recursive:true,force:true});
    }
  }

  async function drain() {
    if (working) return;
    working = true;
    try {
      while (jobs.length) {
        try { await run(jobs.shift()); }
        catch { console.error('Utility mail job failed'); }
      }
    } finally {
      working = false;
    }
  }

  return async function utilityMail(req, res) {
    const lease = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    let code = 404;
    if (origin && req.method === 'POST' && lease) {
      code = 429;
      if (checking < 4 && jobs.length < 3) {
        checking++;
        try {
          const endpoint = new URL('/internal/mail-sync/claim',origin);
          const claim = await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${lease}`},
            redirect:'error',signal:AbortSignal.timeout(6000)});
          code = 403;
          if (claim.ok) {
            jobs.push({lease,job:await claim.json()});
            void drain();
            code = 202;
          }
        } catch {
          code = 503;
        } finally {
          checking--;
        }
      }
    }
    res.writeHead(code,{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({accepted:code === 202}));
  };
}
