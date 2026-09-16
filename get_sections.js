const fs = require('fs');
const schemaFile = fs.readFileSync('lib/api-client-react/src/generated/api.schemas.ts', 'utf-8');
const entryMatch = schemaFile.match(/export interface PermissionCatalogEntry \{([\s\S]*?)\}/);
console.log("Entry:", entryMatch?.[1]);
