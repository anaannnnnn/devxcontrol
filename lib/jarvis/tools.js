// Jarvis tool registry: a FIXED allowlist of functions the model may call. Each has a risk tier
// and a permission check against the real user session + app visibility (seen). No shell, no
// arbitrary file/SQL/vault access. T0 runs immediately; T1/T2 only mint a confirmation (see
// confirm.js) and execute later via execute(); T3 is refused outright.
export const TIER = { READ: 0, REVERSIBLE: 1, CONSEQUENTIAL: 2, FORBIDDEN: 3 };

export function makeJarvisTools({ registry, monitor, ops, autopilot, confirm, seen = () => true }) {
  const apps = () => (registry.apps || []);
  const appById = (id) => apps().find((a) => a.id === id) || null;
  const visible = (user, id) => { try { return !!seen(user, id); } catch { return false; } };

  // name -> { tier, app?, desc, summarize?(args,app), run(args,ctx) }
  const TOOLS = {
    'fleet.status': {
      tier: TIER.READ, desc: 'Status, health and incident counts for every app the user can see.',
      run: (_a, { user }) => ({
        source: 'registry+monitor',
        apps: apps().filter((a) => visible(user, a.id)).map((a) => ({
          id: a.id, name: a.name,
          health: monitor.health ? monitor.health(a.id) : undefined,
          containers: a.containers,
        })),
      }),
    },
    'reviews.list': {
      tier: TIER.READ, desc: 'Pending Autopilot reviews awaiting approval.',
      run: (_a, { user }) => ({ source: 'autopilot', reviews: (autopilot.reviewsList ? autopilot.reviewsList(user) : []) }),
    },
    'fleet.incidents': {
      tier: TIER.READ, desc: 'Recent incidents and warnings across the fleet.',
      run: () => ({ source: 'monitor', incidents: (monitor.incidents ? monitor.incidents(8) : []) }),
    },
    'brief': {
      tier: TIER.READ, desc: 'A short situational briefing: apps, pending reviews, recent incidents.',
      run: (_a, { user }) => {
        const vis = apps().filter((a) => visible(user, a.id));
        const reviews = autopilot.reviewsList ? autopilot.reviewsList(user) : [];
        const inc = monitor.incidents ? monitor.incidents(6) : [];
        return { source: 'monitor+autopilot', apps: vis.length, reviewsPending: reviews.length, incidents: inc.map((e) => ({ app: e.app, msg: e.msg, level: e.level })) };
      },
    },
    'task.draft': {
      tier: TIER.REVERSIBLE, app: true, desc: 'Draft an improvement/design task for an app (goes to review, nothing ships).',
      summarize: (a, app) => `Draft a task for ${app.name}: "${String(a.title || 'Untitled').slice(0, 80)}". It will appear as a review; nothing deploys without your approval.`,
      run: (a) => autopilot.task(a.id, String(a.title || 'Untitled task').slice(0, 120), String(a.detail || '').slice(0, 2000)),
    },
    'app.restart': {
      tier: TIER.REVERSIBLE, app: true, desc: 'Restart one app (reversible).',
      summarize: (_a, app) => `Restart ${app.name}. Its containers stop and start again.`,
      run: (a) => ops.appAction(appById(a.id), 'restart'),
    },
    'app.backup': {
      tier: TIER.REVERSIBLE, app: true, desc: 'Run a backup for one app.',
      summarize: (_a, app) => `Back up ${app.name} now.`,
      run: (a) => ops.backup(appById(a.id), () => {}),
    },
    'reviews.approve': {
      tier: TIER.CONSEQUENTIAL, desc: 'Approve a pending review (merges + redeploys).',
      summarize: (a) => `Approve review ${a.id}. This merges the change and redeploys the app.`,
      run: (a) => autopilot.approve(a.id),
    },
    'app.redeploy': {
      tier: TIER.CONSEQUENTIAL, app: true, desc: 'Pull latest and redeploy one app.',
      summarize: (_a, app) => `Redeploy ${app.name} from its latest source.`,
      run: (a) => ops.redeploy(appById(a.id), () => {}),
    },
    // T3 — refused by voice in v1 (declared so the model sees they exist but are off-limits).
    'vault.reveal': { tier: TIER.FORBIDDEN, desc: 'Reveal a secret. Not allowed by voice.' },
    'users.reset': { tier: TIER.FORBIDDEN, desc: 'Reset a user. Not allowed by voice.' },
  };

  const def = (name) => TOOLS[name];

  // Tools the model is allowed to see/describe for this user (T0–T2; T3 hidden from the planner).
  function list() {
    return Object.entries(TOOLS)
      .filter(([, t]) => t.tier < TIER.FORBIDDEN)
      .map(([name, t]) => ({ name, tier: t.tier, desc: t.desc, app: !!t.app }));
  }

  // permission + existence; returns {ok} or {ok:false, status, error}
  function authorize(name, args, user) {
    const t = def(name);
    if (!t) return { ok: false, status: 404, error: `Unknown tool: ${name}` };
    if (t.tier >= TIER.FORBIDDEN) return { ok: false, status: 403, error: `${name} is not permitted by voice.` };
    if (t.app) {
      const app = appById(args?.id);
      if (!app) return { ok: false, status: 404, error: `No such app: ${args?.id}` };
      if (!visible(user, app.id)) return { ok: false, status: 403, error: `You cannot see ${app.id}.` };
      return { ok: true, t, app };
    }
    return { ok: true, t };
  }

  // Model-initiated call. T0 runs now. T1/T2 return a pending confirmation (NOT executed).
  async function call({ name, args = {}, user, session }) {
    const au = authorize(name, args, user);
    if (!au.ok) return au;
    const { t, app } = au;
    if (t.tier === TIER.READ) return { ok: true, result: await t.run(args, { user, session }) };
    const summary = t.summarize ? t.summarize(args, app) : `${name} ${JSON.stringify(args)}`;
    const pending = confirm.create({ tool: name, args, summary, tier: t.tier, user, session });
    return { ok: true, confirm: pending, reAuth: t.tier === TIER.CONSEQUENTIAL };
  }

  // Executes a confirmed action. Arguments come from the confirmation store, never the model.
  async function execute(id, { user, session }) {
    const c = confirm.consume(id, { user, session });
    if (!c.ok) return { ok: false, status: 409, error: `Confirmation ${c.reason}.` };
    const t = def(c.action.tool);
    if (!t || t.tier >= TIER.FORBIDDEN) return { ok: false, status: 403, error: 'Tool no longer permitted.' };
    try {
      return { ok: true, result: await t.run(c.action.args, { user, session }) };
    } catch (e) {
      return { ok: false, status: 500, error: String(e.message || e).slice(0, 300) };
    }
  }

  return { TOOLS, TIER, list, authorize, call, execute };
}
