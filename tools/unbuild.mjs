// One-off: splits the shipped index.html back into its source files (src/), after the working copy was lost.
// node tools/unbuild.mjs   → src/*.js, src/styles.css, src/index.tpl.html, src/art-tags.html
import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf8'); let tpl = html; const out = {};
// styles: the first <style> block
tpl = tpl.replace(/<style>\n([\s\S]*?)<\/style>/, (m, css) => { out['src/styles.css'] = css; return '<style>/*STYLES*/</style>'; });
// the picture map and the chain foods (kept exactly as built: the pictures and food data have not changed)
tpl = tpl.replace(/<script>window\.RTL_ART=[\s\S]*?<\/script><script>window\.RTL_CHAINS=[\s\S]*?<\/script>/, m => { out['src/art-tags.html'] = m; return '<script>/*ART*/</script>'; });
// each source file
tpl = tpl.replace(/<script>\/\* (src\/[a-z.]+) \*\/\n([\s\S]*?)\n<\/script>/g, (m, f, body) => { out[f] = body.replace(/<\\\/script/g, '</script'); return '<script>/*FILE ' + f + '*/</script>'; });
tpl = tpl.replace(/<script type="text\/plain" id="tests-src">\n([\s\S]*?)\n<\/script>/, (m, body) => { out['src/tests.js'] = body.replace(/<\\\/script/g, '</script'); return '<script>/*FILE src/tests.js*/</script>'; });
out['src/index.tpl.html'] = tpl;
for (const [f, b] of Object.entries(out)) { fs.writeFileSync(f, b); console.log(f, b.length); }
