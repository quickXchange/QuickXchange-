import ts from 'typescript';
import { readFile } from 'node:fs/promises';
const files = [
  'artifacts/crypto-exchange-widget/src/pages/public-info-pages.tsx',
  'artifacts/crypto-exchange-widget/src/components/public-shell.tsx',
  'artifacts/crypto-exchange-widget/src/pages/blog.tsx',
  'artifacts/crypto-exchange-widget/src/pages/blog-detail.tsx',
  'artifacts/crypto-exchange-widget/src/pages/account.tsx',
  'artifacts/crypto-exchange-widget/src/pages/affiliate.tsx',
  'artifacts/quickxchange-telegram-mini-app/src/pages/exchange.tsx',
  'artifacts/quickxchange-telegram-mini-app/src/pages/order-detail.tsx',
];
const changes=[];
for(const file of files) {
  const text=await readFile(file,'utf8');
  const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
  function owner(node) {
    for(let parent=node.parent;parent;parent=parent.parent){
      if(ts.isFunctionLike(parent)&&parent.body&&ts.isBlock(parent.body)&&parent.body.getText(tree).includes('t: uiT'))return true;
    }
    return false;
  }
  function visit(node){
    if(ts.isJsxExpression(node)&&node.expression&&!ts.isJsxAttribute(node.parent)&&owner(node)){
      const value=node.expression.getText(tree);
      if(!/^(uiText|uiT|t|formatDisplayAmount|formatAmount|formatNumber|formatDate|cn)\(/.test(value)&&
        (ts.isConditionalExpression(node.expression)||ts.isBinaryExpression(node.expression))&&
        !/firstName|lastName|username|holder|address|txid|hash|amount|token|email|phone|html/i.test(value)){
        edits.push({start:node.expression.getStart(tree),end:node.expression.end,content:`uiText(${value})`});
        return;
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  let output=text;
  for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.content+output.slice(edit.end);
  const parsed=ts.createSourceFile(file,output,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if(parsed.parseDiagnostics.length)throw new Error('Invalid JSX '+file);
  if(edits.length)changes.push({file,content:output,count:edits.length});
}
console.log(JSON.stringify(changes));
