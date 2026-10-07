import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const paths=execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).split('\n').filter(path=>/^artifacts\/(?:crypto-exchange-widget|quickxchange-telegram-mini-app)\/src\//.test(path)&&/\.tsx$/.test(path)&&!/(admin-|owner-|\/i18n\/|site-preview-context|\/lib\/auth\.tsx|\.test\.)/.test(path));
const changes=[];
for(const file of paths){
  const text=await readFile(file,'utf8'),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],injections=new Set();
  function owner(node){
    for(let p=node.parent;p;p=p.parent){
      if(!ts.isFunctionLike(p)||!p.body||!ts.isBlock(p.body))continue;
      const name=p.name?.getText(tree)??(ts.isVariableDeclaration(p.parent)?p.parent.name.getText(tree):'');
      if(!/^[A-Z]/.test(name))continue;
      if(/^(Admin|Owner|App|Root|Router|ClerkProvider)|Provider$/.test(name))return null;
      return p;
    }
    return null;
  }
  function visit(node){
    if(ts.isJsxExpression(node)&&node.expression&&!ts.isJsxAttribute(node.parent)){
      const expression=node.expression,value=expression.getText(tree),component=owner(node);
      const leaf=ts.isIdentifier(expression)||ts.isPropertyAccessExpression(expression)||ts.isElementAccessExpression(expression)||ts.isCallExpression(expression)&&!/\.map\(|\b(uiText|uiT|t|format\w*|cn)\(/.test(value);
      if(component&&leaf&&/(?:paragraph|answer|question|description|label|heading|title|subtitle|caption|body|message|notice|hint|summary|text|category|name|item)/i.test(value)&&
         !/\b(?:user|customer|profile)|firstName|lastName|displayName|holder|address|txid|orderId|email|phone|balance|asset|instrument|currency|network|symbol|amount|html|className|href/i.test(value)&&
         !/\b(?:uiText|uiT|t|format\w*|cn)\(/.test(value)){
        edits.push({start:expression.getStart(tree),end:expression.end,content:`uiText(${value})`});
        if(!/tx:\s*uiText/.test(component.body.getText(tree)))injections.add(component);
        return;
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  for(const component of injections)edits.push({start:component.body.getStart(tree)+1,end:component.body.getStart(tree)+1,content:'\n  const { t: uiT, tx: uiText } = useCustomerI18n();\n'});
  if(!edits.length)continue;
  let output=text;
  for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.content+output.slice(edit.end);
  if(!/import.*useCustomerI18n/.test(output))output='import { useI18n as useCustomerI18n } from "@workspace/i18n";\n'+output;
  const parsed=ts.createSourceFile(file,output,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if(parsed.parseDiagnostics.length)throw new Error('Invalid JSX '+file);
  changes.push({file,content:output,count:edits.length});
}
console.log(JSON.stringify(changes));
