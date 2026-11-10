import { writeFileSync } from 'node:fs';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { Store } from '../src/db.js';
const store=new Store(':memory:');
const {app}=await buildApp({store,config:{...config(),jobs:false}});
writeFileSync('docs/openapi.json',JSON.stringify(app.swagger(),null,2)+'\n');
await app.close();store.close();console.log('Wrote docs/openapi.json');
