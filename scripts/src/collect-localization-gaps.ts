import ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { englishDictionary, flattenDictionary, loadDictionary } from '../../lib/i18n/src/runtime';
const root='/home/runner/workspace';
const existing=flattenDictionary(englishDictionary);
const known=new Set(Object.values(existing).map(value=>value.trim().replace(/\s+/g,' ').toLowerCase()));
const additions: Record<string,string>={};
const brands=/^(?:QuickXchange|QuickChange|Quickex|QuickEx|WhiteBIT|Coinbase|Telegram|Instagram|Facebook|Trustpilot|Google|Apple|GitHub|YouTube|WhatsApp|CoinMarketCap|Medium|Discord|TikTok|LinkedIn|Bitcoin|Ethereum|Solana|Polygon|TRON|BNB Smart Chain|ERC20|TRC20|BEP20|English|Français|Deutsch|Español)$/i;
function add(value: unknown) {
  if(typeof value!=='string')return;
  const text=value.trim().replace(/\s+/g,' ');
  if(text.length<3||text.length>12000||!/[A-Za-z]{3}/.test(text)||!/[A-Z]/.test(text[0]??'')||brands.test(text)||/^(?:https?:|\/|customer\.|[A-Z\d_-]+$)/.test(text)||/^[a-z\d_.+-]+@[a-z\d.-]+$/i.test(text))return;
  if(known.has(text.toLowerCase()))return;
  known.add(text.toLowerCase());
  additions['customer.m'+createHash('sha256').update(text).digest('hex').slice(0,12)]=text;
}
function walk(value: unknown,key='') {
  if(Array.isArray(value)){value.forEach(item=>walk(item,key));return;}
  if(value&&typeof value==='object'){Object.entries(value).forEach(([name,item])=>walk(item,name));return;}
  if(/url|href|src|path|logo|image|icon|^id$|^key$|^code$|color|font|email|address|phone/i.test(key))return;
  add(value);
  if(typeof value==='string'){
    for(const part of value.split(/\n\s*\n|<\/p>|<br\s*\/?>/i))add(part.replace(/<[^>]+>/g,''));
  }
}
walk(JSON.parse(await readFile('/tmp/qx-public-content.json','utf8')));
async function collect(directory: string) {
  for(const item of await readdir(directory,{withFileTypes:true})){
    const path=directory+'/'+item.name;
    if(item.isDirectory()){if(!/i18n|ui$/.test(item.name))await collect(path);continue;}
    if(!/\.tsx?$/.test(item.name)||/^(?:admin|owner)|\.test\./.test(item.name))continue;
    const text=await readFile(path,'utf8'),tree=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    function visit(node: ts.Node) {
      if(ts.isJsxText(node)||ts.isStringLiteral(node)&&!ts.isImportDeclaration(node.parent)&&!ts.isExportDeclaration(node.parent))add(node.text);
      ts.forEachChild(node,visit);
    }
    visit(tree);
  }
}
await collect(root+'/artifacts/crypto-exchange-widget/src/pages');
await collect(root+'/artifacts/crypto-exchange-widget/src/components');
await collect(root+'/artifacts/quickxchange-telegram-mini-app/src');
['Easy to follow','What is QuickXchange?','Exchange Rates','Crypto News','Guides','Stablecoins'].forEach(add);
const unchanged: Record<string,{text:string;keys:string[];targets:string[]}>={};
for(const locale of ['fr','de','ru','es','ko','uk'] as const) {
  const dictionary=flattenDictionary(await loadDictionary(locale));
  for(const [key,text] of Object.entries(existing)){
    if(key.startsWith('admin')||brands.test(text)||text.length<3||!/[A-Za-z]{3}/.test(text)||/^FAQ$|^API$|^[A-Z\d_-]+$/.test(text)||text===text.toLowerCase()&&text.split(' ').length===1)continue;
    if(dictionary[key]!==text)continue;
    const row=unchanged[text]??={text,keys:[],targets:[]};
    if(!row.keys.includes(key))row.keys.push(key);
    if(!row.targets.includes(locale))row.targets.push(locale);
  }
}
console.log(JSON.stringify({additions,unchanged:Object.values(unchanged)}));
