/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs');
const en=JSON.parse(fs.readFileSync('messages/en.json','utf8'));
function flat(o,p){p=p||'';var r={};Object.entries(o).forEach(([k,v])=>{var key=p? (p+'.'+k):k; if(v&&typeof v==='object'&&!Array.isArray(v)) Object.assign(r,flat(v,key)); else r[key]=v;});return r;}
const e=flat(en);
console.log(Object.keys(e).slice(0,200).join('\n'));
console.log('---');
console.log('Has Parties.product_name:', 'Parties.product_name' in e);
console.log('Has Parties.add_prepayment_btn:', 'Parties.add_prepayment_btn' in e);
console.log('Total keys:', Object.keys(e).length);
