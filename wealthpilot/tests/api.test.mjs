import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
async function fixture(env={}){
  const dir=mkdtempSync(join(tmpdir(),'wealthpilot-test-'));
  const app=createApp({env:{HOST:'127.0.0.1',DATA_DIR:dir,...env}});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  const request=async(path,data,method='POST',headers={})=>{const response=await fetch(origin+path,{method:data===undefined?'GET':method,headers:{...(data===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...headers},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,headers:response.headers,body:await response.json()};};
  return {...app,origin,request,cleanup:async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.store.close();rmSync(dir,{recursive:true,force:true});}};
}
test('主流程：读取、测评、持久化、预览、确认、幂等、审计',async()=>{
  const f=await fixture();try{
    const initial=await f.request('/api/bootstrap');assert.equal(initial.status,200);assert.equal(initial.body.state.version,1);
    const update=await f.request('/api/workspace',{version:1,section:'profile',value:{...initial.body.state.profile,horizon:1}},'PUT');assert.equal(update.status,200);assert.equal(update.body.state.version,2);
    const stale=await f.request('/api/workspace',{version:1,section:'profile',value:initial.body.state.profile},'PUT');assert.equal(stale.status,409);
    const pre=await f.request('/api/rebalance/preview',{version:2,feeBps:10});assert.equal(pre.status,200);assert.ok(pre.body.plan.fee>0);
    const command={version:2,feeBps:10,key:'test-idempotency-000001',confirm:true};
    const executed=await f.request('/api/rebalance/execute',command);assert.equal(executed.status,200);assert.equal(executed.body.state.version,3);
    const duplicate=await f.request('/api/rebalance/execute',command);assert.deepEqual(duplicate.body,executed.body);
    const conflict=await f.request('/api/rebalance/execute',{...command,feeBps:20});assert.equal(conflict.status,409);
    const final=await f.request('/api/bootstrap');assert.equal(final.body.audit.length,2);assert.equal(final.body.analysis.assessment.level,1);
    assert.deepEqual(f.store.get().holdings,pre.body.plan.holdings);
  }finally{await f.cleanup();}
});
test('拒绝跨站请求、错误输入、未确认执行和未知接口',async()=>{
  const f=await fixture();try{
    assert.equal((await f.request('/api/chat',{question:'你好'},'POST',{Origin:'https://evil.example'})).status,403);
    assert.equal((await f.request('/api/chat',{question:'你好'},'POST',{Origin:''})).status,403);
    assert.equal((await f.request('/api/chat',{question:''})).status,400);
    assert.equal((await f.request('/api/rebalance/execute',{version:1,feeBps:10,key:'test-unconfirmed-0001',confirm:false})).status,400);
    assert.equal((await f.request('/api/workspace',{version:1,section:'holdings',value:{equity:-1,bond:0,gold:0,cash:0}},'PUT')).status,400);
    assert.equal((await f.request('/api/does-not-exist')).status,404);
    const r=await fetch(f.origin+'/api/chat',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:'{bad'});assert.equal(r.status,400);
    const big=await f.request('/api/chat',{question:'a'.repeat(33000)});assert.equal(big.status,413);
  }finally{await f.cleanup();}
});
test('访问口令、HttpOnly 会话和退出生效',async()=>{
  const token='test-token-at-least-24-characters',f=await fixture({ACCESS_TOKEN:token});try{
    assert.equal((await f.request('/api/bootstrap')).status,401);
    assert.equal((await f.request('/api/login',{token:'wrong'})).status,401);
    const logged=await f.request('/api/login',{token});assert.equal(logged.status,200);assert.match(logged.headers.get('set-cookie'),/HttpOnly/);assert.match(logged.headers.get('set-cookie'),/SameSite=Strict/);
    const Cookie=logged.headers.get('set-cookie').split(';')[0];assert.equal((await f.request('/api/bootstrap',undefined,'GET',{Cookie})).status,200);
    await f.request('/api/logout',{},'POST',{Cookie});assert.equal((await f.request('/api/bootstrap',undefined,'GET',{Cookie})).status,401);
  }finally{await f.cleanup();}
});
test('外部模型需逐次同意，浏览器不获得服务端密钥',async()=>{
  const f=await fixture({AI_BASE_URL:'https://model.example/v1',AI_API_KEY:'do-not-expose-me',AI_MODEL:'test'});try{
    const data=await f.request('/api/bootstrap');assert.equal(data.body.aiConfigured,true);assert.ok(!JSON.stringify(data.body).includes('do-not-expose-me'));
    const chat=await f.request('/api/chat',{question:'分析我的组合',externalConsent:false});assert.equal(chat.body.mode,'rules');
  }finally{await f.cleanup();}
});
test('健康检查、网页资产与安全响应头可用',async()=>{
  const f=await fixture();try{assert.equal((await f.request('/api/health')).status,200);for(const path of ['/','/app.js','/styles.css','/favicon.svg']){const response=await fetch(f.origin+path);assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.ok((await response.text()).length>0);}}finally{await f.cleanup();}
});
test('非回环部署必须有强口令及明确来源',()=>{
  assert.throws(()=>createApp({env:{HOST:'0.0.0.0'}}),/ACCESS_TOKEN/);
  assert.throws(()=>createApp({env:{HOST:'0.0.0.0',ACCESS_TOKEN:'a'.repeat(24)}}),/PUBLIC_ORIGIN/);
});
test('策略研究到选择再执行闭环，比较不写入，估值时间不被调仓改变',async()=>{
  const f=await fixture();try{
    const initial=await f.request('/api/bootstrap');assert.equal(initial.body.strategies.length,3);
    const compare=await f.request('/api/strategies/compare',{version:1,feeBps:30});assert.equal(compare.status,200);assert.equal(f.store.get().version,1);
    const selected=await f.request('/api/workspace',{version:1,section:'strategy',value:'inverse-vol'},'PUT');assert.equal(selected.status,200);
    assert.deepEqual(f.store.get().holdings,initial.body.state.holdings);
    const edited=await f.request('/api/workspace',{version:2,section:'holdings',value:initial.body.state.holdings},'PUT');assert.ok(edited.body.state.holdingsUpdatedAt);
    const pre=await f.request('/api/rebalance/preview',{version:3,feeBps:30});assert.equal(pre.body.plan.strategy.id,'inverse-vol');
    const result=await f.request('/api/rebalance/execute',{version:3,feeBps:30,key:'strategy-execute-test-001',confirm:true});assert.equal(result.status,200);assert.deepEqual(result.body.state.holdings,pre.body.plan.holdings);assert.equal(result.body.state.holdingsUpdatedAt,edited.body.state.holdingsUpdatedAt);
  }finally{await f.cleanup();}
});
