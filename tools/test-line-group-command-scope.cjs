const test=require('node:test'),assert=require('node:assert/strict');
const {affectedOnly}=require('./line-group-command-scope.cjs');
test('only this reviewed command change selects affected validation',()=>{
 assert(affectedOnly(['core/leaf-groups.js','tools/fixtures/leaf-groups.mjs','versions/AM-IMP-2026.1102.02/build.cjs']));
 for(const files of [[],['server.js'],['core/leaf-groups.js','core/bootstrap.js'],['versions/AM-IMP-2026.1102.02/unknown.cjs'],['versions/AM-IMP-2026.1102.03/README.md'],['package.json'],['.github/workflows/unknown.yml']])assert.equal(affectedOnly(files),false,files.join(','));
});
