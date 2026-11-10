import { buildApp } from './app.js';
const {app,services}=await buildApp({logging:true});
await app.listen({host:services.cfg.host,port:services.cfg.port});
app.log.info(`Swagger UI: ${services.cfg.publicUrl}/docs`);
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
