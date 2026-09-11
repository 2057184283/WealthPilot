import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS,DEFAULT_PROFILE as P,DEFAULT_HOLDINGS as H,DEFAULT_GOAL as G,validateProfile,validateHoldings,validateGoal,riskAssessment,allocation,metrics,stressTest,projectGoal,planRebalance } from '../src/domain.mjs';
const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
test('无效数值、类型、全零资产拒绝',()=>{
  for(const value of [NaN,Infinity,-1,'500',null])assert.throws(()=>validateHoldings({...H,equity:value}));
  assert.throws(()=>validateHoldings({equity:0,bond:0,gold:0,cash:0}));
  assert.throws(()=>validateProfile({...P,tolerance:2.5}));
  assert.throws(()=>validateGoal({...G,annualReturn:-100}));
  assert.throws(()=>validateGoal({...G,name:'  '}));
});
test('能力限制高风险意愿，短期/应急不足/高息债务均降档',()=>{
  const high={...P,tolerance:5,experience:5,horizon:10,incomeStability:5};
  assert.equal(riskAssessment(high).level,5);
  for(const patch of [{horizon:1},{emergencyMonths:2},{debtRate:8}])assert.equal(riskAssessment({...high,...patch}).level,1);
  assert.ok(riskAssessment({...high,incomeStability:1}).level<=3);
});
test('风险等级随承受意愿提高不会降低，权重始终归一',()=>{
  let prior=0;for(let tolerance=1;tolerance<=5;tolerance++){const r=riskAssessment({...P,tolerance});assert.ok(r.score>=prior);prior=r.score;assert.ok(Math.abs(sum(r.weights)-1)<1e-12);}
});
test('现金底线覆盖必要支出；资金不足时明确提示',()=>{
  const a=allocation({...P,monthlyExpense:50000},H);assert.ok(a.target.weights.cash>=.5);assert.ok(Math.abs(sum(a.target.weights)-1)<1e-12);
  const small=allocation({...P,monthlyExpense:100000}, {equity:100,bond:100,gold:0,cash:0});assert.equal(small.target.weights.cash,.95);assert.ok(small.assessment.reasons.some(r=>r.includes('现金缺口')));
});
test('组合金额与压力情景按权重计算',()=>{
  assert.equal(metrics(H).total,300000);
  const allEquity={equity:100000,bond:0,gold:0,cash:0};assert.equal(stressTest(allEquity)[0].loss,-30000);
  assert.equal(stressTest({equity:0,bond:0,gold:0,cash:100000})[0].pct,0);
  assert.equal(metrics(allEquity).assumedVolatility,.22);
});
test('零收益定投精确，月末投入复利正确',()=>{
  const result=projectGoal(1000,{...G,years:1,monthly:100,annualReturn:0,target:3400});assert.equal(result.future,2200);assert.equal(result.requiredMonthly,200);
  const growth=projectGoal(1000,{...G,years:2,monthly:0,annualReturn:10});assert.equal(growth.future,1210);assert.equal(growth.points.at(-1).value,growth.future);
});
test('负收益和通胀不产生 NaN，达标时月投入为零',()=>{
  const r=projectGoal(10000,{...G,annualReturn:-10,years:4,monthly:0,target:1000});assert.ok(Number.isFinite(r.realValue));assert.equal(r.requiredMonthly,0);assert.ok(r.realValue<r.future);
});
test('调仓现金与费用守恒，费用由双边非现金成交额产生',()=>{
  const p=planRebalance(P,H,10);assert.ok(Math.abs(sum(p.holdings)+p.fee-p.totalBefore)<1e-7);assert.ok(Math.abs(p.fee-p.turnover*.001)<=.011);assert.ok(p.holdings.cash>=0);
  const free=planRebalance(P,H,0);assert.equal(free.fee,0);assert.equal(free.totalAfter,300000);
});
test('500 组确定性样本保持非负、归一和守恒',()=>{
  let seed=123456;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<500;i++){
    const h=Object.fromEntries(ASSETS.map(a=>[a.id,Math.round(random()*10000000)/100]));
    const p={...P,tolerance:Math.floor(random()*5)+1,monthlyExpense:random()*10000};
    const a=allocation(p,h),plan=planRebalance(p,h,Math.floor(random()*101));
    assert.ok(Math.abs(sum(a.target.weights)-1)<1e-10);assert.ok(Object.values(plan.holdings).every(x=>x>=0));assert.ok(Math.abs(sum(plan.holdings)+plan.fee-sum(h))<1e-6);assert.ok(Math.abs(plan.fee-plan.turnover*plan.feeBps/10000)<=.021);assert.ok(Number.isFinite(a.target.assumedVolatility));
  }
});
