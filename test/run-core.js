// Runs the shared logic tests (src/tests.js) against src/core.js in Node.  node test/run-core.js [filter]
const R = require('../src/core.js'), T = require('../src/tests.js');
const f = process.argv[2]; let out = T.runTests(R); if (f) out = out.filter(t => t.name.toLowerCase().includes(f.toLowerCase()));
out.filter(t => !t.pass).forEach(t => console.log('FAIL  ' + t.name + '\n      ' + String(t.error).split('\n').join('\n      ')));
console.log('Logic tests: ' + out.filter(t => t.pass).length + '/' + out.length + ' passed');
process.exit(out.some(t => !t.pass) ? 1 : 0);
