import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from '../src/config.js';
import { Store } from '../src/db.js';
import { Auth } from '../src/auth.js';
import { Catalog } from '../src/services/catalog.js';
import { seedProducts } from '../src/seed-products.js';
import type { ProductInput } from '../src/schemas.js';
import { passwordHash, requireValue } from '../src/core.js';

function readCredentialInput(path: string) {
  const contents=readFileSync(resolve(path),'utf8').replace(/^\uFEFF/,'');
  return JSON.parse(contents);
}

const cfg=config(),db=new Store(cfg.databasePath);
try {
  switch(process.argv[2]) {
    case 'migrate': console.log('Database migrations applied.');break;
    case 'seed': {
      if(cfg.production)throw new Error('Development seed is disabled in production.');
      let added=0;
      for(const product of seedProducts){if(!db.one('SELECT id FROM products WHERE id=? OR sku=?',product.id,product.sku)){new Catalog(db).create(product as ProductInput,'development-seed',product.id);added++;}}
      console.log(`Development catalogue: ${added} inserted; existing inventory preserved. No admin or payments seeded.`);break;
    }
    case 'admin': {
      // A private file avoids putting a password in command history or process arguments.
      const credentialPath=process.env.ADMIN_CREDENTIAL_FILE;
      if(!credentialPath)throw new Error('Set ADMIN_CREDENTIAL_FILE to a private JSON file with name, email, password.');
      const input=readCredentialInput(credentialPath);
      if(typeof input.name!=='string' || !input.name.trim() || typeof input.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || typeof input.password!=='string' || input.password.length<12 || input.password.length>128)throw new Error('Provide name, valid email, and a 12–128 character password.');
      await new Auth(db,cfg).register(input.name,input.email,input.password,'admin');console.log('Admin provisioned. Securely remove the credential file.');break;
    }
    case 'admin-reset': {
      const credentialPath=process.env.ADMIN_CREDENTIAL_FILE;
      if(!credentialPath)throw new Error('Set ADMIN_CREDENTIAL_FILE to a private JSON file with email and password.');
      const input=readCredentialInput(credentialPath);
      if(typeof input.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || typeof input.password!=='string' || input.password.length<12 || input.password.length>128)throw new Error('Provide a valid admin email and a 12–128 character password.');
      const credential=await passwordHash(input.password),email=input.email.trim().toLowerCase();
      db.tx(()=>{
        const admin=db.one("SELECT id FROM principals WHERE role='admin' AND email=? AND active=1",email);
        requireValue(admin,404,'No active administrator has that email.','ADMIN_NOT_FOUND');
        db.run("UPDATE principals SET password_hash=? WHERE id=?",credential,admin.id);
        db.run('DELETE FROM sessions WHERE principal_id=?',admin.id);
        db.audit(admin.id,'admin.password_reset',admin.id);
      });
      console.log('Admin password reset and existing admin sessions revoked. Securely remove the credential file.');break;
    }
    case 'backup': {
      const destination=resolve(process.argv[3] || `backups/aurie-${Date.now()}.sqlite`);
      if(existsSync(destination))throw new Error('Backup destination already exists.');
      mkdirSync(dirname(destination),{recursive:true});db.run('VACUUM INTO ?',destination);console.log(`Consistent database backup written: ${destination}`);break;
    }
    default:throw new Error('Use migrate, seed, admin, admin-reset or backup.');
  }
} finally {db.close();}
