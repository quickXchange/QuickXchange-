import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const phrases = {};
function include(value) {
  if(typeof value !== 'string') return;
  const text = value.replace(/\s+/g,' ').trim();
  if (!/[A-Za-z]/.test(text) || text.length < 3 || /^[A-Z][A-Z0-9_]*$/.test(text) ||
    /^(?:https?:|\/|#)|^[^\s]+@[^\s]+$|^[\w-]+\.(?:svg|png|webp|jpg)$|^\w+\.(?:\w+\.)*\w+$/.test(text) ||
    /^(?:QuickXchange|Quickex|QuickEx|WhiteBIT|Coinbase|Telegram|Instagram|Bitcoin|Ethereum|Solana|Polygon|Trustpilot)$/.test(text)) return;
  const key = 'm'+createHash('sha256').update(text).digest('hex').slice(0,12);
  phrases[key] = text;
}
for (const proposal of ['/tmp/customer-localization-proposal-fixed.json','/tmp/qx-additional-display-migration.json']) {
  const data=JSON.parse(await readFile(proposal,'utf8'));
  for(const [key,entry]of Object.entries(data.catalog))phrases[key]=entry.text;
}
const content=JSON.parse(await readFile('/tmp/qx-public-content.json','utf8'));
const meaningful = /^(?:title|subtitle|heading|headline|subheading|label|description|question|answer|text|body|content|intro|paragraph|caption|kicker|eyebrow|buttonText|ctaText|linkText|heroTitle|heroSubtitle|tagline|copyright|name)$/i;
function collect(value, property = '') {
  if(Array.isArray(value)) {for(const item of value)collect(item,property);return;}
  if(value && typeof value==='object'){for(const [key,item]of Object.entries(value))collect(item,key);return;}
  if(meaningful.test(property))include(value);
}
collect(content);
const addons=JSON.parse(await readFile('/tmp/qx-public-addons.json','utf8'));
for(const addon of addons.items){include(addon.name);include(addon.description);}
for(const file of ['artifacts/crypto-exchange-widget/src/lib/legal-page-content.ts','artifacts/crypto-exchange-widget/src/lib/public-ui-feedback.ts']) {
  let source;
  try {source=await readFile(file,'utf8');}catch{continue;}
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  function visit(node){if(ts.isStringLiteral(node))include(node.text);ts.forEachChild(node,visit);}
  visit(tree);
}
async function collectErrors(directory) {
  for(const item of await readdir(directory,{withFileTypes:true})){
    const file=directory+'/'+item.name;
    if(item.isDirectory()){await collectErrors(file);continue;}
    if(!item.name.endsWith('.ts')||item.name.includes('.test.'))continue;
    const source=await readFile(file,'utf8');
    const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    function visit(node){
      if(ts.isNewExpression(node)&&node.expression.getText(tree)==='ApiError'&&node.arguments?.[1]){
        const argument=node.arguments[1];
        if(ts.isStringLiteral(argument))include(argument.text);
        if(ts.isTemplateExpression(argument)){
          let text=argument.head.text;
          argument.templateSpans.forEach((span,index)=>{text+=`{{v${index}}}`+span.literal.text;});
          include(text);
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(tree);
  }
}
await collectErrors('artifacts/api-server/src/routes');
await collectErrors('artifacts/api-server/src/lib');
await writeFile('/tmp/qx-all-customer-phrases.json',JSON.stringify(phrases));
console.log('Customer interface, published content and error source phrases:',Object.keys(phrases).length);
