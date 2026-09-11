import { analyze,SOURCES,VERSION } from './domain.mjs';
export function classifyQuestion(question) {
  if(/保证|稳赚|翻倍|内幕|必涨/.test(question))return 'boundary';
  if(/压力|下跌|亏损|回撤/.test(question))return 'stress';
  if(/调仓|偏离|配置|现金|比例|策略/.test(question))return 'allocation';
  if(/目标|定投|退休|储蓄|月投入/.test(question))return 'goal';
  if(/风险|画像|等级|组合|分析|体检/.test(question))return 'risk';
  return 'unsupported';
}
const sourceIds={boundary:['tools'],stress:['allocation','tools'],allocation:['allocation','robo'],goal:['tools'],risk:['robo','tools'],unsupported:['tools']};
const labels={boundary:'能力边界',stress:'压力情景',allocation:'资产配置',goal:'目标规划',risk:'风险画像',unsupported:'范围说明'};
const pct=v=>(v*100).toFixed(1)+'%';
export function buildEvidence(question,state) {
  const intent=classifyQuestion(question),a=analyze(state),top=a.stress.reduce((x,y)=>x.pct<y.pct?x:y);
  const facts={
    boundary:[{label:'交易权限',value:'无真实交易能力'}],
    stress:[{label:'最不利内置情景',value:top.name},{label:'组合变动',value:pct(top.pct)},{label:'模拟变动金额',value:`¥${top.loss.toLocaleString('zh-CN')}`}],
    allocation:[{label:'当前方案',value:a.strategy.name},{label:'最大偏离',value:`${(a.drift*100).toFixed(1)} 个百分点`},{label:'目标现金比例',value:pct(a.target.weights.cash)}],
    goal:[{label:'年化假设',value:`${state.goal.annualReturn}%`},{label:'测算期末金额',value:`¥${a.goal.future.toLocaleString('zh-CN')}`},{label:'所需月投入',value:`¥${a.goal.requiredMonthly.toLocaleString('zh-CN')}`}],
    risk:[{label:'风险画像',value:a.assessment.label},{label:'承受意愿 / 能力上限',value:`${a.assessment.willingness} / ${a.assessment.capacity}`},{label:'需关注的体检项',value:`${a.diagnostics.attentionCount} 项`}],
    unsupported:[{label:'支持范围',value:'风险、配置、压力、目标；不查询实时价格或个股行情'}]
  }[intent];
  const sources=SOURCES.filter(s=>sourceIds[intent].includes(s.id));
  return {intent,topic:labels[intent],stateVersion:state.version??null,policyVersion:VERSION,computedAt:new Date().toISOString(),dataMode:state.dataMode,holdingsUpdatedAt:state.holdingsUpdatedAt||null,facts,sources,steps:['读取当前工作台','执行确定性计算',`按问题主题选取 ${sources.length} 条基础资料`],analysis:a,top};
}
