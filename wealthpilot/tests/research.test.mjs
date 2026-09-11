import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE as P,DEFAULT_HOLDINGS as H,DEFAULT_GOAL as G,ASSETS,STRATEGIES,allocation,compareStrategies,analyze,diagnostics,planRebalance,metrics } from '../src/domain.mjs';
import { classifyQuestion,buildEvidence } from '../src/evidence.mjs';
import { advisor } from '../src/advisor.mjs';
const state={profile:P,holdings:H,goal:G,dataMode:'demo',version:3};
test('三种方案遵守现金、权益、黄金约束；最小方差不劣于基准',()=>{
  for(const profile of [P,{...P,horizon:1},{...P,tolerance:5,experience:5,horizon:10},{...P,monthlyExpense:100000}]) {
    const strategies=compareStrategies({...state,profile});assert.equal(strategies.length,3);
    for(const s of strategies){assert.ok(Math.abs(Object.values(s.weights).reduce((a,b)=>a+b,0)-1)<1e-10);assert.ok(Object.values(s.weights).every(w=>w>=0));assert.ok(s.weights.equity<=s.constraints.equity+1e-10);assert.ok(s.weights.gold<=s.constraints.gold+1e-10);assert.equal(s.weights.cash,s.constraints.cash);assert.ok(Number.isFinite(s.fee));}
    assert.ok(strategies[2].assumedVolatility<=strategies[0].assumedVolatility+1e-12);
  }
});
test('方差贡献合计为一，100% 单资产贡献为100%',()=>{
  for(const id of ASSETS.map(a=>a.id)){const h=Object.fromEntries(ASSETS.map(a=>[a.id,a.id===id?100:0]));const m=metrics(h);assert.equal(m.riskContributions.find(r=>r.id===id).share,1);}
  assert.ok(Math.abs(metrics(H).riskContributions.reduce((s,r)=>s+r.share,0)-1)<1e-12);
});
test('费用对照和调仓使用同一方案；策略非法时拒绝',()=>{
  for(const strategy of STRATEGIES){const plan=planRebalance(P,H,50,strategy.id),comparison=compareStrategies(state,50).find(s=>s.id===strategy.id);assert.equal(plan.fee,comparison.fee);assert.deepEqual(plan.allocation.target.weights,comparison.weights);}
  assert.throws(()=>allocation(P,H,'unknown'));
});
test('扣费后保留必要现金，不被费率吞掉现金底线',()=>{
  const p={...P,monthlyExpense:50000};
  for(const s of STRATEGIES){const plan=planRebalance(p,H,100,s.id);assert.ok(plan.holdings.cash>=150000);assert.ok(Math.abs(Object.values(plan.holdings).reduce((a,b)=>a+b,0)+plan.fee-300000)<1e-6);}
});
test('体检不把未知或陈旧估值显示为实时',()=>{
  const a=allocation(P,H);
  const unknown=diagnostics({...state,dataMode:'manual'},a,new Date('2026-09-10T00:00:00Z'));assert.equal(unknown.data.ageDays,null);assert.equal(unknown.data.live,false);assert.equal(unknown.checks[0].status,'warning');
  const stale=diagnostics({...state,dataMode:'manual',holdingsUpdatedAt:'2026-07-01T00:00:00Z'},a,new Date('2026-09-10T00:00:00Z'));assert.equal(stale.data.ageDays,71);assert.equal(stale.checks[0].status,'warning');
  const zero=analyze({...state,profile:{...P,monthlyExpense:0}});assert.equal(zero.diagnostics.checks.find(c=>c.id==='cash').status,'info');
});
test('现金目标不再误路由到储蓄目标，无法支持的问题不假装有数据',()=>{
  assert.equal(classifyQuestion('为什么现金目标比例这么高？'),'allocation');assert.equal(classifyQuestion('我的目标需要每月投入多少？'),'goal');assert.equal(classifyQuestion('明天天气如何'),'unsupported');
  const e=buildEvidence('分析配置',state);assert.equal(e.stateVersion,3);assert.ok(e.facts.some(f=>f.label==='目标现金比例'));assert.equal(e.sources.length,2);
});
test('保证收益和不支持主题不触发外部模型调用',async()=>{
  let called=false;const env={AI_BASE_URL:'https://model.example/v1',AI_API_KEY:'k',AI_MODEL:'m'},fetcher=async()=>{called=true;throw new Error('not allowed');};
  assert.equal((await advisor('保证稳赚',state,env,fetcher)).mode,'rules');assert.equal((await advisor('明天天气如何',state,env,fetcher)).mode,'rules');assert.equal(called,false);
});
test('研究视图转义用户数据，提供可操作方案和依据',async()=>{
  const {renderResearch,renderEvidence}=await import('../public/research-view.js');
  const esc=s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;');
  const snapshot={state,analysis:analyze(state),strategies:compareStrategies(state),assets:ASSETS};
  const html=renderResearch(snapshot,10,{esc,money:x=>String(x),pct:x=>String(x),icon:()=>''});assert.match(html,/data-strategy="inverse-vol"/);assert.match(html,/id="compare-form"/);
  const e=buildEvidence('目标',state);e.facts[0].value='<script>bad</script>';assert.ok(!renderEvidence(e,{esc}).includes('<script>'));
});
