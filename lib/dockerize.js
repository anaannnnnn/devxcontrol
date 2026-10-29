// Writes a Dockerfile for repos that do not have one. Pure function over a file listing and a reader, so it can be tested.
// Returns { dockerfile, dockerignore, port, stack, note } or null when the project type is not recognised.
const portIn = (txt) => {
  if (!txt) return null;
  const m = /process\.env\.PORT\s*(?:\|\||\?\?)\s*(\d{2,5})/.exec(txt) || /\.listen\(\s*(\d{2,5})/.exec(txt) || /^[ \t]*PORT[ \t]*=[ \t]*(\d{2,5})/m.exec(txt) || /port\s*=\s*(?:int\()?(?:os\.environ(?:\.get)?\(["']PORT["'],\s*)?["']?(\d{2,5})/i.exec(txt);
  return m ? +m[1] : null;
};
const IGNORE = ['node_modules', '.git', '.env', '.env.*', '!.env.example', 'npm-debug.log', '__pycache__', '*.pyc', '.venv', 'venv', '.next/cache', 'coverage', 'Dockerfile', 'docker-compose*.yml', '.DS_Store', ''].join('\n');

export async function generateDockerfile({ files, read }) {
  const has = (re) => files.some((f) => re.test(f.path));
  const rootHas = (name) => files.some((f) => f.path === name);
  const pkgTxt = await read('package.json'); let pkg = null; try { pkg = pkgTxt ? JSON.parse(pkgTxt) : null; } catch { /* bad json */ }
  const envEx = (await read('.env.example')) || (await read('.env.sample')) || '';
  const out = (dockerfile, port, stack, note) => ({ dockerfile: `${dockerfile.trim()}\n`, dockerignore: IGNORE, port, stack, note });

  if (pkg) {
    const dep = (k) => pkg.dependencies?.[k] || pkg.devDependencies?.[k];
    const major = /(\d{2})/.exec(pkg.engines?.node || '')?.[1]; const node = major && +major >= 18 ? major : '22';
    const pm = rootHas('pnpm-lock.yaml') ? 'pnpm' : rootHas('yarn.lock') ? 'yarn' : 'npm';
    const install = pm === 'pnpm' ? 'corepack enable && pnpm install --frozen-lockfile' : pm === 'yarn' ? 'corepack enable && yarn install --frozen-lockfile' : rootHas('package-lock.json') ? 'npm ci' : 'npm install';
    const run = (s) => (pm === 'npm' ? `npm run ${s}` : `${pm} ${s}`);
    const build = pkg.scripts?.build;
    const mainFile = pkg.main && has(new RegExp(`^${pkg.main.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)) ? pkg.main : (['server.js', 'index.js', 'app.js', 'src/index.js', 'src/server.js', 'server.mjs', 'index.mjs'].find((f) => rootHas(f)) || null);
    const startFile = /node(?:mon)?\s+(?:--\S+\s+)*([\w./-]+\.[cm]?js)/.exec(pkg.scripts?.start || '')?.[1];
    const mainTxt = (startFile && (await read(startFile))) || (mainFile ? await read(mainFile) : '');

    if (dep('next')) {
      const standalone = /output\s*:\s*['"]standalone['"]/.test((await read('next.config.js')) || (await read('next.config.mjs')) || (await read('next.config.ts')) || '');
      return out(`FROM node:${node}-slim AS build
WORKDIR /app
COPY package*.json pnpm-lock.yaml* yarn.lock* ./
RUN ${install}
COPY . .
RUN ${run('build')}

FROM node:${node}-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
${standalone ? `COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]` : `COPY --from=build /app ./
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["${pm === 'npm' ? 'npx' : pm}", "next", "start", "-p", "3000"]`}`, 3000, 'Next.js', 'Multi-stage build, runs as a non-root user. /app/data is writable and kept in a volume.');
    }

    const staticSpa = build && !pkg.scripts?.start && (dep('vite') || dep('react-scripts') || dep('@vue/cli-service') || dep('@sveltejs/vite-plugin-svelte') || dep('parcel') || dep('astro')) && !dep('express') && !dep('fastify');
    if (staticSpa) {
      const outDir = dep('react-scripts') ? 'build' : 'dist';
      return out(`FROM node:${node}-slim AS build
WORKDIR /app
COPY package*.json pnpm-lock.yaml* yarn.lock* ./
RUN ${install}
COPY . .
RUN ${run('build')}

FROM nginx:1.27-alpine
COPY --from=build /app/${outDir} /usr/share/nginx/html
RUN printf 'server {\\n  listen 80;\\n  root /usr/share/nginx/html;\\n  location / { try_files $uri $uri/ /index.html; }\\n}\\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80`, 80, 'Static site (built, served by nginx)', `Builds with "${build.slice(0, 40)}" and serves ${outDir}/ with nginx.`);
    }

    const cmd = pkg.scripts?.start ? (pm === 'npm' ? '["npm", "start"]' : `["${pm}", "start"]`) : mainFile ? `["node", "${mainFile}"]` : null;
    if (cmd) {
      const port = portIn(mainTxt) || portIn(envEx) || 3000;
      const prodInstall = pm === 'npm' && !build ? `${install} --omit=dev` : install;
      return out(`FROM node:${node}-slim
WORKDIR /app
ENV PORT=${port}
COPY package*.json pnpm-lock.yaml* yarn.lock* ./
RUN ${prodInstall}
COPY . .
${build ? `RUN ${run('build')}\n` : ''}ENV NODE_ENV=production
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE ${port}
CMD ${cmd}`, port, `Node ${node}${dep('express') ? ' (Express)' : dep('fastify') ? ' (Fastify)' : ''}`, `Starts with ${pkg.scripts?.start ? '"npm start"' : `"node ${mainFile}"`}, port ${port}.`);
    }
  }

  const py = rootHas('requirements.txt') || rootHas('pyproject.toml');
  if (py) {
    const req = ((await read('requirements.txt')) || '') + ((await read('pyproject.toml')) || '');
    const l = req.toLowerCase();
    const entry = ['main.py', 'app.py', 'server.py', 'run.py', 'wsgi.py', 'manage.py'].find((f) => rootHas(f));
    const entryTxt = entry ? await read(entry) : '';
    const port = portIn(entryTxt) || portIn(envEx) || 8000;
    const installCmd = rootHas('requirements.txt') ? 'RUN pip install --no-cache-dir -r requirements.txt' : 'RUN pip install --no-cache-dir .';
    const head = `FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PORT=${port}
${rootHas('requirements.txt') ? 'COPY requirements.txt ./\n' + installCmd + '\nCOPY . .' : 'COPY . .\n' + installCmd}
RUN useradd -m app && mkdir -p /app/data && chown -R app /app
USER app
EXPOSE ${port}`;
    const mod = entry ? entry.replace(/\.py$/, '') : 'main';
    if (/fastapi|uvicorn|starlette/.test(l)) return out(`${head}\nCMD ["python", "-m", "uvicorn", "${mod}:app", "--host", "0.0.0.0", "--port", "${port}"]`, port, 'Python (FastAPI)', `Runs uvicorn ${mod}:app on port ${port}. Add uvicorn to requirements.txt if it is missing.`);
    if (/django/.test(l) && rootHas('manage.py')) {
      const wsgi = files.find((f) => /^[^/]+\/wsgi\.py$/.test(f.path))?.path.split('/')[0] || 'config';
      return out(`${head}\nCMD ["python", "-m", "gunicorn", "${wsgi}.wsgi:application", "--bind", "0.0.0.0:${port}"]`, port, 'Python (Django)', `Runs gunicorn ${wsgi}.wsgi on port ${port}. Add gunicorn to requirements.txt if it is missing.`);
    }
    if (/flask/.test(l)) return out(`${head}\nCMD ["python", "-m", "gunicorn", "${mod}:app", "--bind", "0.0.0.0:${port}"]`, port, 'Python (Flask)', `Runs gunicorn ${mod}:app on port ${port}. Add gunicorn to requirements.txt if it is missing.`);
    if (entry && entry !== 'manage.py') return out(`${head}\nCMD ["python", "${entry}"]`, port, 'Python', `Runs "python ${entry}" on port ${port}.`);
  }

  if (rootHas('go.mod')) {
    const gov = /^go\s+(\d+\.\d+)/m.exec((await read('go.mod')) || '')?.[1] || '1.23';
    const port = portIn((await read('main.go')) || '') || portIn(envEx) || 8080;
    return out(`FROM golang:${gov}-alpine AS build
WORKDIR /src
COPY go.mod go.su[m] ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app .

FROM alpine:3.20
RUN adduser -D app
COPY --from=build /out/app /usr/local/bin/app
USER app
ENV PORT=${port}
EXPOSE ${port}
CMD ["app"]`, port, 'Go', `Builds a static binary and runs it on port ${port}.`);
  }

  if (rootHas('composer.json') || rootHas('index.php')) {
    return out(`FROM php:8.3-apache
WORKDIR /var/www/html
COPY . .
EXPOSE 80`, 80, 'PHP (Apache)', 'Serves the repo with Apache and PHP 8.3.');
  }

  if (rootHas('index.html')) {
    return out(`FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
EXPOSE 80`, 80, 'Static site (nginx)', 'Serves the repo files with nginx.');
  }
  return null;
}
