import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const paths=execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).split('\n').filter(path=>/^artifacts\/(?:crypto-exchange-widget|quickxchange-telegram-mini-app)\/src\//.test(path)&&/\.tsx?$/.test(path)&&!path.includes('/i18n/'));
const changes=[];
for(const file of paths){
  const text=await readFile(file,'utf8');
  const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),edits=[];
  function visit(node){
    if(ts.isStringLiteral(node)&&node.text.startsWith('customer.')&&ts.isPropertyAssignment(node.parent)){
      let insideFunction=false;
      for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)){insideFunction=true;break;}
      if(!insideFunction)edits.push({start:node.getStart(tree),end:node.end,content:`sourceText(${node.getText(tree)})`});
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  if(!edits.length)continue;
  let output=text;
  for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.content+output.slice(edit.end);
  if(!/import.*sourceText/.test(output))output='import { sourceText } from "@workspace/i18n/runtime";\n'+output;
  changes.push({file,content:output,count:edits.length});
}
console.log(JSON.stringify(changes));
