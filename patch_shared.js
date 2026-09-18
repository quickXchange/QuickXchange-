const fs = require('fs');
const file = 'artifacts/crypto-exchange-widget/src/components/shared-app-ui.tsx';
let content = fs.readFileSync(file, 'utf8');
const constants = `
export const SUPPORT_TELEGRAM = 'https://t.me/Quick_change_support';
export const SUPPORT_EMAIL = 'support@quickxchange.net';
export const SUPPORT_HOURS = '24/7 Support';
`;
content = content.replace('export const basePath =', constants + 'export const basePath =');
fs.writeFileSync(file, content);
