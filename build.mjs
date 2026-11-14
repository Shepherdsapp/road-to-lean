// Builds index.html (the GitHub Pages app) from src/. Run:  node build.mjs
// The pictures (art/), the opening video and the food data (foods.json) are already built and unchanged, so their tags
// are carried as-is in src/art-tags.html. tools/build-full.mjs is the old full build (it needs the original picture and
// food-data folders, and also made the page hosted inside Claude).
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const safe = js => js.replace(/<\/script/gi, '<\\/script'); // nothing inside a file may close the script block early
let html = rd('src/index.tpl.html');
html = html.replace('<style>/*STYLES*/</style>', () => '<style>\n' + rd('src/styles.css') + '</style>');
html = html.replace('<script>/*ART*/</script>', () => rd('src/art-tags.html'));
html = html.replace(/<script>\/\*FILE ([^*]+)\*\/<\/script>/g, (m, f) => f === 'src/tests.js'
  ? '<script type="text/plain" id="tests-src">\n' + safe(rd(f)) + '\n</script>'
  : '<script>/* ' + f + ' */\n' + safe(rd(f)) + '\n</script>');
// a stamp for this build: the app shows it to the service worker so "Update the app" knows whether the server has a newer page
if (!html.includes('__BUILD__')) throw new Error('The build stamp placeholder is missing');
html = html.replace('__BUILD__', crypto.createHash('sha1').update(html).digest('hex').slice(0, 12));
if (/\/\*(STYLES|ART|FILE)/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) throw new Error('A placeholder was left unfilled');
if (!/<!--winter-arc:end-->\n$/.test(html)) throw new Error('The page must end with the end marker (sw.js checks it)');
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('index.html ' + Math.round(html.length / 1024) + ' KB');
