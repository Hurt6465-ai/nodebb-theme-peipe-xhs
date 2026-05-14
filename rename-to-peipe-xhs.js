const fs = require('fs');
const path = require('path');
const OLD = 'nodebb-theme-harmony';
const NEW = 'nodebb-theme-peipe-xhs';

function editJson(file, fn) {
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(data);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

editJson('package.json', (p) => {
  p.name = NEW;
  p.description = 'Peipe XHS mobile profile theme based on NodeBB Harmony';
  p.repository = { type: 'git', url: 'https://github.com/Hurt6465-ai/nodebb-theme-peipe-xhs' };
  p.homepage = 'https://github.com/Hurt6465-ai/nodebb-theme-peipe-xhs';
  p.bugs = { url: 'https://github.com/Hurt6465-ai/nodebb-theme-peipe-xhs/issues' };
});

editJson('plugin.json', (p) => {
  p.id = NEW;
  p.name = 'Peipe XHS Theme';
  p.scripts = Array.isArray(p.scripts) ? p.scripts : [];
  p.scripts = p.scripts.filter(x => x !== 'public/peipe-profile.js' && x !== 'public/peipe-profile/peipe-profile.js');
  if (!p.scripts.includes('public/harmony.js') && fs.existsSync('public/harmony.js')) p.scripts.unshift('public/harmony.js');
  if (!p.scripts.includes('public/peipe-xprofile-v19.js')) p.scripts.push('public/peipe-xprofile-v19.js');
  delete p.css;
  p.scss = Array.isArray(p.scss) ? p.scss : [];
  if (!p.scss.includes('scss/peipe-xprofile-v19.scss')) p.scss.push('scss/peipe-xprofile-v19.scss');
  p.staticDirs = p.staticDirs || {};
  p.staticDirs['peipe-xprofile-v19'] = 'public/peipe-xprofile-v19';
});

editJson('theme.json', (p) => {
  p.id = NEW;
  p.name = 'Peipe XHS Theme';
  p.description = 'Peipe mobile profile theme copied from Harmony';
  p.url = 'https://github.com/Hurt6465-ai/nodebb-theme-peipe-xhs';
});

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory() && name !== 'node_modules' && name !== '.git') out.push(...walk(full));
    else if (st.isFile()) out.push(full);
  }
  return out;
}

for (const file of walk('.')) {
  if (/\.(png|jpg|jpeg|gif|webp|woff2?|ttf|eot|svg)$/i.test(file)) continue;
  let s;
  try { s = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (s.includes(OLD)) {
    fs.writeFileSync(file, s.split(OLD).join(NEW));
  }
}

console.log('renamed theme to', NEW);
