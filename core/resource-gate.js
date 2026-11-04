// Admission precedes binary/Base64/JSON allocation and is shared across tenants.
export function createResourceGate(limit, maxPending = 64) {
  let active = 0;
  const pending = [];
  const failure = () => Object.assign(new Error('Resource queue unavailable; retry later.'), { kind: 'transient' });
  function release() {
    const next = pending.shift();
    if (next) { clearTimeout(next.timer); next.resolve(release); }
    else active -= 1;
  }
  return {
    snapshot: () => ({ active, pending: pending.length }),
    acquire(timeoutMs = 300000) {
      if (active < limit) { active += 1; return Promise.resolve(release); }
      if (pending.length >= maxPending || timeoutMs <= 0) return Promise.reject(failure());
      return new Promise((resolve, reject) => {
        const item = { resolve, timer: null };
        item.timer = setTimeout(() => {
          const index = pending.indexOf(item);
          if (index >= 0) pending.splice(index, 1);
          reject(failure());
        }, timeoutMs);
        pending.push(item);
      });
    },
  };
}
export const llmGate = createResourceGate(2);
export const previewGate = createResourceGate(1, 16);
export function singleFlight(fn) {
  let running;
  return (...args) => {
    if (!running) running = Promise.resolve().then(() => fn(...args)).finally(() => { running = null; });
    return running;
  };
}
