import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Returns proposed source edits for the Agent to review/apply, never edits application files.
const web = 'artifacts/crypto-exchange-widget/src';
const mini = 'artifacts/quickxchange-telegram-mini-app/src';
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!['i18n', 'assets'].includes(entry.name)) await walk(path);
    } else if (entry.name.endsWith('.tsx') && !/admin-|\/admin\.tsx|site-content\.tsx|\.test\./.test(path)) files.push(path);
  }
}
await walk(web); await walk(mini);
const catalog = {};
const changes = [];
const uiNames = new Set(['title','subtitle','label','description','placeholder','searchPlaceholder','aria-label','alt','emptyMessage','loadingMessage','errorMessage','closeLabel','closeSearchLabel','children','message','text','heading']);
const canonical = /^(?:QuickXchange|QuickXchange\+|QuickChange|Quickex|QuickEx|WhiteBIT|Coinbase|Telegram|Instagram|Facebook|Trustpilot|Google|Apple|GitHub|X|YouTube|WhatsApp|CoinMarketCap|Medium|Discord|TikTok|LinkedIn|Bitcoin|Ethereum|Solana|Polygon|TRON|BNB Smart Chain|ERC20|TRC20|BEP20|BTC|ETH|USDT|USDC|BNB|TRX|POL|SOL|LTC|DOGE|XRP|DAI|DZD|USD|EUR|GBP|RUB|UAH|KRW|JPY|CNY|CHF|AED|TRY|CAD|AUD|BRL|Fixed|Floating)$/;
function human(text) {
  if (/^customer\./.test(text)) return false;
  return /[A-Za-z]/.test(text) && !canonical.test(text.trim()) && !/^(?:[A-Z][A-Z0-9_]*|https?:.*|\/.*|#.*|[a-z]+[A-Z][\w]*|[a-z]+[-_:][\w:-]+|[a-z]+\.([a-z]+\.)*[a-z]+)$/.test(text.trim())
    && !/^(?:sm|md|lg|xl|true|false|auto|contain|cover|none|all|crypto|fiat|swap|convert|fixed|floating|manual|quickex|light|dark|success|error|warning|info|vertical|horizontal)$/.test(text.trim());
}
function key(text, file) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const k = `m${createHash('sha256').update(normalized).digest('hex').slice(0,12)}`;
  catalog[k] ??= { text: normalized, files: [] };
  if (!catalog[k].files.includes(file)) catalog[k].files.push(file);
  return `customer.${k}`;
}
function component(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (!ts.isFunctionLike(p) || !p.body || !ts.isBlock(p.body)) continue;
    const name = p.name?.getText() || (ts.isVariableDeclaration(p.parent) ? p.parent.name.getText() : '');
    if (/^[A-Z]/.test(name) && !/^(Admin|Owner)/.test(name) && !/Provider$/.test(name)) return p;
    if (p.parent && ts.isCallExpression(p.parent) && p.parent.expression.getText().includes('forwardRef')) return p;
  }
}
function uiOutput(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return false;
    if (ts.isJsxExpression(p)) return !ts.isJsxAttribute(p.parent) || uiNames.has(p.parent.name.getText());
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return false;
    if (ts.isConditionalExpression(p) && p.condition.pos <= node.pos && p.condition.end >= node.end) return false;
    if (ts.isCallExpression(p)) return false;
    if (ts.isFunctionLike(p) || ts.isStatement(p)) return false;
  }
  return false;
}
for (const file of files) {
  if (/bulk-deposit-provider-dialog|catalog-image-upload-field|payment-method-reserve-editor|social-trust-editor/.test(file)) continue;
  const source = process.argv.includes('--from-head')
    ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
    : await readFile(file,'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [], owners = new Set(), usedSpans = new Set();
  const add = (node, replacement, owner) => {
    const start=node.getStart(tree), end=node.end;
    if (usedSpans.has(`${start}:${end}`)) return;
    usedSpans.add(`${start}:${end}`); edits.push({start,end,replacement}); if(owner) owners.add(owner);
  };
  const visit = node => {
    const owner = component(node);
    let underFunction = false;
    for (let parent = node.parent; parent; parent = parent.parent) if (ts.isFunctionLike(parent)) { underFunction = true; break; }
    if (ts.isJsxText(node) && owner && human(node.text.replace(/\s+/g,' ').trim())) {
      const value=node.text.replace(/\s+/g,' ').trim();
      const before=/^[ \t]/.test(node.text)?"{' '}":'', after=/[ \t]$/.test(node.text)?"{' '}":'';
      add(node,`${before}{uiT(${JSON.stringify(key(value,file))})}${after}`,owner); return;
    }
    if (ts.isStringLiteral(node) && human(node.text)) {
      const p=node.parent;
      const uiAttribute=ts.isJsxAttribute(p)&&uiNames.has(p.name.getText());
      const uiProperty=ts.isPropertyAssignment(p)&&uiNames.has(p.name.getText().replace(/['\"]/g,''));
      const uiConstant=ts.isVariableDeclaration(p)&&/^(?:title|subtitle|label|description|placeholder|heading|message|errorText|emptyText)$/.test(p.name.getText());
      const uiReturn=ts.isReturnStatement(p)&&/(?:error|status|label|message|empty|timeline|validation|search)/i.test(file);
      const uiSetter=ts.isCallExpression(p)&&/^(?:setError|setErrorMessage|setMessage|setNotice|setFeedback|setStatusMessage|setSuccessMessage)$/.test(p.expression.getText(tree));
      if ((owner || !underFunction) && (uiAttribute||uiProperty||uiConstant||uiReturn||uiSetter||uiOutput(node)) && !/className|style/.test(p.getText().slice(0,12))) {
        const lookup=key(node.text,file);
        if (owner) add(node,uiSetter?JSON.stringify(lookup):uiAttribute?`{uiT(${JSON.stringify(lookup)})}`:`uiT(${JSON.stringify(lookup)})`,owner);
        else if(uiProperty||uiReturn) add(node,JSON.stringify(lookup));
        return;
      }
    }
    if (ts.isTemplateExpression(node) && owner && uiOutput(node)) {
      const literals=[node.head.text,...node.templateSpans.map(span=>span.literal.text)];
      if(human(literals.join(' ').replace(/\s+/g,' ').trim())) {
        let value=node.head.text;
        const params=[];
        node.templateSpans.forEach((span,i)=>{ value+=`{{v${i}}}`+span.literal.text; params.push(`v${i}: ${span.expression.getText(tree)}`); });
        add(node,`uiT(${JSON.stringify(key(value,file))}, { ${params.join(', ')} })`,owner); return;
      }
    }
    if (ts.isJsxExpression(node) && owner && node.expression &&
      (ts.isIdentifier(node.expression) || ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression) || ts.isCallExpression(node.expression))) {
      const text=node.expression.getText(tree);
      if ((!ts.isJsxAttribute(node.parent)||uiNames.has(node.parent.name.getText()))
          && !/^(?:uiT|uiText|t|formatDisplayAmount|formatAmount|formatNumber|formatDate|cn)\(/.test(text)
          && !/asset|instrument|currency|network|provider|customer|firstName|lastName|displayName|username|holder|bank|method|brand|coin|symbol|address|txid|hash|amount|token|email|phone|html/i.test(text)) {
        add(node.expression,`uiText(${text})`,owner);
        return;
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(tree);
  if(!edits.length)continue;
  // All hooks go at the unconditional entry of the containing React component.
  for(const owner of owners) {
    const body=owner.body;
    if(!body.getText(tree).includes('t: uiT')) edits.push({start:body.getStart(tree)+1,end:body.getStart(tree)+1,replacement:'\n  const { t: uiT, tx: uiText } = useCustomerI18n();\n'});
  }
  if(owners.size && !source.includes('useI18n as useCustomerI18n')) edits.push({start:0,end:0,replacement:'import { useI18n as useCustomerI18n } from "@workspace/i18n";\n'});
  const ordered=edits.sort((a,b)=>b.start-a.start);
  let output=source;
  let lastStart=source.length+1;
  for(const edit of ordered) {
    if(edit.end>lastStart) throw new Error(`Overlapping translation edits in ${file}: ${edit.start}`);
    output=output.slice(0,edit.start)+edit.replacement+output.slice(edit.end); lastStart=edit.start;
  }
  const parsed = ts.createSourceFile(file, output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if(parsed.parseDiagnostics.length) throw new Error(`Invalid generated JSX in ${file}: ${parsed.parseDiagnostics[0].messageText}`);
  changes.push({file,content:output,count:edits.length});
}
console.log(JSON.stringify({catalog,changes}));
