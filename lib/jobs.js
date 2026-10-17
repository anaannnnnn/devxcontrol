// Long-running operations (redeploy, backup) with replayable output for SSE.
import crypto from 'node:crypto';

const jobs = new Map();

export function createJob(kind, appId, runner) {
  const id = crypto.randomBytes(6).toString('hex');
  const job = { id, kind, appId, startedAt: Date.now(), lines: [], subs: new Set(), done: false, code: null };
  const log = (text) => {
    for (const l of String(text).replace(/\r/g, '\n').split('\n')) {
      if (!l) continue;
      job.lines.push(l);
      if (job.lines.length > 3000) job.lines.shift();
      job.subs.forEach((fn) => fn({ line: l }));
    }
  };
  jobs.set(id, job);
  (async () => {
    try { job.code = await runner(log); }
    catch (e) { log(`error: ${e.message}`); job.code = 1; }
    job.done = true;
    job.subs.forEach((fn) => fn({ done: true, code: job.code }));
    setTimeout(() => jobs.delete(id), 30 * 60e3).unref?.();
  })();
  return job;
}

export const getJob = (id) => jobs.get(id);
export const runningJob = (kind, appId) => [...jobs.values()].find((j) => j.kind === kind && j.appId === appId && !j.done);
