import test from 'node:test';
import assert from 'node:assert/strict';
const D = await import('../lib/designgen.js');
const P = await import('../lib/preview.js');
const { BUILTIN } = await import('../lib/themes.js');

test('every component renders in every format with theme tokens', () => {
  for (const k of Object.keys(D.COMPONENTS)) for (const f of D.FORMATS) {
    const r = D.component(k, f, BUILTIN[2]); assert.ok(r.code.length > 40 && r.preview.includes('--dx-accent: #2ee59d'), `${k}/${f}`);
  }
  const react = D.component('form', 'react', BUILTIN[0]).code; assert.match(react, /className=/); assert.match(react, /htmlFor=/); assert.ok(!/\bclass=/.test(react));
  assert.match(D.component('card', 'tailwind', BUILTIN[0]).code, /bg-\[var\(--dx-surface\)\]/);
  assert.match(D.component('hero', 'html', BUILTIN[0], { text: '<b>Hi' }).code, /&lt;b&gt;Hi/);
  assert.throws(() => D.component('nope', 'html', BUILTIN[0]), D.DesignError); assert.throws(() => D.component('card', 'vue', BUILTIN[0]), D.DesignError);
});
test('edits become safe CSS, tailwind hints and text changes', () => {
  const c = D.editsToCode([{ selector: 'h1.title', props: { color: '#ff0000', 'font-size': '2rem', padding: '8px 12px' }, text: 'Hi', before: 'Hello' }, { selector: 'h1.title', props: { 'font-weight': '700' } }]);
  assert.match(c.css, /h1\.title \{\n {2}color: #ff0000;[\s\S]*font-weight: 700;/); assert.equal(c.tailwind.length, 1); assert.match(c.tailwind[0].classes, /text-\[color:#ff0000\]/);
  assert.deepEqual(c.textChanges, [{ selector: 'h1.title', before: 'Hello', after: 'Hi' }]);
});
test('malicious edits are rejected', () => {
  const bad = (e) => assert.throws(() => D.editsToCode([e]), D.DesignError);
  bad({ selector: 'a{}body{display:none', props: { color: '#fff' } }); bad({ selector: 'p', props: { color: 'red;}body{x:y' } }); bad({ selector: 'p', props: { 'background-image': 'url(x)' } });
  bad({ selector: 'p', props: { padding: 'expression(alert(1))' } }); bad({ selector: 'p', text: '<img src=x onerror=1>' }); bad({ selector: '</style><script>', props: { color: '#fff' } });
  assert.throws(() => D.editsToCode([]), D.DesignError); assert.throws(() => D.editsToCode([{ selector: 'p', props: {} }]), D.DesignError);
});
test('preview links are signed, scoped to the app and expire', () => {
  const n0 = Date.now(), t = P.mint('sec', 'app1', n0); assert.ok(P.verify('sec', 'app1', t, n0 + 60000));
  assert.ok(!P.verify('sec', 'app2', t, n0 + 2000)); assert.ok(!P.verify('other', 'app1', t, n0 + 2000)); assert.ok(!P.verify('sec', 'app1', t, n0 + 21 * 60000)); assert.ok(!P.verify('sec', 'app1', 'garbage'));
});
test('preview paths are strict and upstream comes from the registry', () => {
  for (const p of ['/', '/menu', '/a/b.css', '/x?']) assert.equal(P.pathOk(p), p !== '/x?');
  for (const p of ['/../etc', '//evil.com', '/a/../b', 'http://x', '/a b', '/a\\b']) assert.ok(!P.pathOk(p), p);
  assert.equal(P.upstreamOf({ containers: ['web1'], port: 3000 }), 'http://web1:3000'); assert.equal(P.upstreamOf({ urls: [{ url: 'https://x.com/' }] }), 'https://x.com'); assert.equal(P.upstreamOf({}), null);
});
test('html is rewritten for the frame and gets the editor', () => {
  const out = P.rewriteHtml('<head><meta http-equiv="Content-Security-Policy" content="x"><base href="/"><link href="/s.css"></head><body><a href="/m">m</a><img src="//cdn/x"><div style="background:url(/i.png)"></div></body>', '/preview/a/T');
  assert.ok(!/content-security-policy/i.test(out) && !/<base href="\/">/i.test(out)); assert.match(out, /<base href="\/preview\/a\/T\/">/); assert.match(out, /src="\/\/cdn\/x"/); assert.match(out, /url\(\/preview\/a\/T\/i\.png/); assert.match(out, /<script>\(function\(\)\{/);
  assert.equal(P.rewriteCss('a{background:url("/x.png")} @import "/y.css";', '/p'), 'a{background:url("/p/x.png")} @import "/p/y.css";');
});
