import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_PROFILE, DEFAULT_HOLDINGS, DEFAULT_GOAL, InputError } from './domain.mjs';
export function createStore(dir) {
  mkdirSync(dir,{recursive:true});
  const db=new DatabaseSync(resolve(dir,'wealthpilot.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL, version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS executions(key TEXT PRIMARY KEY, response TEXT NOT NULL, fingerprint TEXT NOT NULL);
    PRAGMA user_version=1;`);
  if (!db.prepare('PRAGMA table_info(executions)').all().some(c=>c.name==='fingerprint')) db.exec("ALTER TABLE executions ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''");
  db.prepare('INSERT OR IGNORE INTO workspace VALUES(1,?,1)').run(JSON.stringify({profile:DEFAULT_PROFILE,holdings:DEFAULT_HOLDINGS,goal:DEFAULT_GOAL,dataMode:'demo'}));
  function get() { const row=db.prepare('SELECT body,version FROM workspace WHERE id=1').get();return {...JSON.parse(row.body),version:row.version}; }
  function audit() { return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all().map(r=>({...r,details:JSON.parse(r.details)})); }
  function update(expected,action,fn,key=null,fingerprint='') {
    db.exec('BEGIN IMMEDIATE');
    try {
      if(key) {const existing=db.prepare('SELECT response,fingerprint FROM executions WHERE key=?').get(key);if(existing){if(existing.fingerprint!==fingerprint)throw new InputError('同一幂等键不能用于不同的调仓请求',409);db.exec('COMMIT');return JSON.parse(existing.response);}}
      const state=get(); if(expected!==state.version) throw new InputError('组合已更新，请刷新后重新操作',409);
      const result=fn(state), {version,...body}=result.state;
      const next={...body,version:state.version+1};
      db.prepare('UPDATE workspace SET body=?,version=? WHERE id=1').run(JSON.stringify(body),next.version);
      db.prepare('INSERT INTO audit(at,action,details) VALUES(?,?,?)').run(new Date().toISOString(),action,JSON.stringify(result.details||{}));
      const response={state:next,...result.response};
      if(key) db.prepare('INSERT INTO executions VALUES(?,?,?)').run(key,JSON.stringify(response),fingerprint);
      db.exec('COMMIT'); return response;
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  return {get,audit,update,close:()=>db.close()};
}
