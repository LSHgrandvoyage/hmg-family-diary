// CLI contract tests with an isolated fake Docker command. No real containers/volumes.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
const base=mkdtempSync(join(tmpdir(),'chagok-startup-'));
const bin=join(base,'bin');mkdirSync(bin);
const source=resolve('scripts/team-test.mjs');
writeFileSync(join(bin,'docker'),`#!${process.execPath}
const fs=require('node:fs');
const args=process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_DOCKER_LOG,JSON.stringify(args)+'\\n');
if(args[0]==='volume'&&args[1]==='ls') {
 if(process.env.FAKE_DOCKER_FAIL==='volume')process.exit(1);
 console.log(process.env.FAKE_DOCKER_VOLUMES||'');
} else if(args[0]==='info')console.log('linux');
else if(args[0]==='compose'&&args.includes('up'))process.exit(1);
else if(args[0]==='compose'&&args.includes('ps'))console.log('migrate Exited (1)\\nweb Created\\nproxy Created');
else {console.error('Unexpected fake Docker command');process.exit(90);}
`,{mode:0o755});
let cases=0;
function fixture(name,volumes='',failure='') {
 const dir=join(base,name);mkdirSync(join(dir,'scripts'),{recursive:true});copyFileSync(source,join(dir,'scripts/team-test.mjs'));
 const log=join(dir,'docker.jsonl');
 const run=(...args)=>spawnSync(process.execPath,[join(dir,'scripts/team-test.mjs'),...args],{
  cwd:dir,encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,FAKE_DOCKER_LOG:log,FAKE_DOCKER_VOLUMES:volumes,FAKE_DOCKER_FAIL:failure},timeout:15000,
 });
 const calls=()=>existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 return {dir,env:join(dir,'.env.team'),run,calls};
}
try {
 const first=fixture('first');let r=first.run('init','192.0.2.10');assert.equal(r.status,0,r.stderr);
 const config=parseEnv(readFileSync(first.env,'utf8'));
 assert.equal(config.APP_ORIGIN,'https://192.0.2.10:18443');
 for(const k of ['POSTGRES_PASSWORD','APP_DB_PASSWORD','AUTH_DB_PASSWORD','MIGRATION_DB_PASSWORD','BETTER_AUTH_SECRET']) {
  assert.match(config[k],/^[a-f0-9]{64}$/);assert.ok(!r.stdout.includes(config[k]));assert.ok(!r.stderr.includes(config[k]));
 }
 assert.deepEqual(first.calls(),[['volume','ls','--format','{{.Name}}']]);cases++;
 const previous=readFileSync(first.env);r=first.run('init','192.0.2.11');assert.equal(r.status,1);assert.deepEqual(readFileSync(first.env),previous);assert.equal(first.calls().length,1);cases++;
 for(const name of ['pg_data','audio_data','photo_data','probe_data']) {
  const f=fixture(name,`hmg-family-diary-team_${name}`);r=f.run('init','192.0.2.10');assert.equal(r.status,1);assert.match(r.stderr,/기존 팀 테스트 데이터 볼륨/);assert.ok(!existsSync(f.env));
  assert.deepEqual(f.calls(),[['volume','ls','--format','{{.Name}}']]);cases++;
 }
 for(const [name,volumes] of [['other-project','hmg-family-diary_pg_data\nother_pg_data'],['ca-only','hmg-family-diary-team_caddy_data\nhmg-family-diary-team_caddy_config']]) {
  const f=fixture(name,volumes);r=f.run('init','192.0.2.10');assert.equal(r.status,0,r.stderr);assert.ok(existsSync(f.env));cases++;
 }
 const offline=fixture('docker-offline','','volume');r=offline.run('init','192.0.2.10');assert.equal(r.status,1);assert.match(r.stderr,/Docker Desktop/);assert.ok(!existsSync(offline.env));cases++;
 r=first.run('up','--no-build');assert.equal(r.status,1);assert.match(r.stderr,/서버 시작을 완료하지 못했어요/);assert.match(r.stderr,/team-test.mjs status/);assert.match(r.stderr,/logs --no-color --tail 60 migrate/);assert.ok(!r.stdout.includes('Web:'));
 assert.ok(!first.calls().some(a=>a.includes('cp')));assert.deepEqual(readFileSync(first.env),previous);cases++;
 r=first.run('status');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/web Created/);assert.deepEqual(first.calls().at(-1),['compose','--env-file','.env.team','-f','compose.team.yaml','-p','hmg-family-diary-team','ps','-a']);cases++;
 r=first.run('address','192.0.2.11');assert.equal(r.status,0,r.stderr);const moved=parseEnv(readFileSync(first.env,'utf8'));
 assert.equal(moved.APP_ORIGIN,'https://192.0.2.11:18443');for(const [k,v] of Object.entries(config))if(!['APP_HOST','APP_ORIGIN'].includes(k))assert.equal(moved[k],v);cases++;
 // No test may mutate a real or fake volume, or dump container environment secrets.
 for(const args of first.calls())assert.ok(!['rm','prune','inspect'].some(x=>args.includes(x)));
 console.log(`PASS ${cases} startup CLI cases: new init, existing env/data guards, Docker failure, retained CA, separate project, failure diagnostics, status, address secret preservation. Fake Docker only.`);
} finally {rmSync(base,{recursive:true,force:true});}
