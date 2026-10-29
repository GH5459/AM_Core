'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validToolArguments}=require('./xiaoye-codex-proxy-fixture.cjs');
test('fixture tool schema rejects extra URL, wrong types and unsupported keywords',()=>{
 const schema={type:'object',properties:{path:{type:'string'},count:{type:'integer'},mode:{type:'string',enum:['read']}},required:['path'],additionalProperties:false};
 assert(validToolArguments(schema,{path:'fixture',count:1,mode:'read'}));
 for(const bad of [{path:'fixture',url:'https://example.invalid'},{path:2},{path:'x'.repeat(8193)},{path:'fixture',count:1.5},{path:'fixture',mode:'write'},{}])assert.equal(validToolArguments(schema,bad),false);
 assert.equal(validToolArguments({...schema,patternProperties:{}},{path:'fixture'}),false);
});
test('nested fixture schema checks required fields, arrays and bounds',()=>{
 const schema={type:'object',properties:{items:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false}}},required:['items'],additionalProperties:false};
 assert(validToolArguments(schema,{items:[{name:'safe'}]}));assert.equal(validToolArguments(schema,{items:[{name:'safe',url:'https://example.invalid'}]}),false);assert.equal(validToolArguments(schema,{items:[{}]}),false);assert.equal(validToolArguments(schema,{items:Array(101).fill({name:'x'})}),false);
});
