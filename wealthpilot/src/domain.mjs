import { STRATEGIES, strategyWeights, covariance } from './strategies.mjs';
export { STRATEGIES } from './strategies.mjs';
export const VERSION = 'policy-1.1.0';
export const ASSETS = [
  { id: 'equity', name: '宽基权益', color: '#386cff', mu: .065, vol: .22, factor: .16 },
  { id: 'bond', name: '优质债券', color: '#35b9a1', mu: .025, vol: .05, factor: -.01 },
  { id: 'gold', name: '黄金资产', color: '#e4ac45', mu: .03, vol: .17, factor: .02 },
  { id: 'cash', name: '现金类', color: '#a5b1c5', mu: .012, vol: .005, factor: 0 }
];
export const SOURCES = [
  { id: 'allocation', title: '资产配置与分散投资', url: 'https://www.investor.gov/introduction-investing/getting-started/asset-allocation', text: '投资期限和风险承受能力影响资产配置；分散配置可降低集中风险，但不能保证盈利。' },
  { id: 'robo', title: '自动化投顾的适用范围', url: 'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-45', text: '评估自动化投顾时，应理解问卷、算法假设、费用、人工支持与自身财务状况之间的关系。' },
  { id: 'tools', title: '自动化投资工具的局限', url: 'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-alerts/investor-56', text: '自动化工具可能无法覆盖税务、其他持仓、现金需求等个人情况；计算结果依赖输入与模型假设。' }
];
export const DEFAULT_PROFILE = { horizon: 5, tolerance: 3, experience: 2, incomeStability: 3, emergencyMonths: 6, debtRate: 3, monthlyExpense: 8000 };
export const DEFAULT_HOLDINGS = { equity: 132000, bond: 96000, gold: 24000, cash: 48000 };
export const DEFAULT_GOAL = { name: '长期积累', target: 600000, years: 5, monthly: 3000, annualReturn: 3, inflation: 2 };
export class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function num(value, label, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new InputError(`${label}须为 ${min}–${max} 范围内${integer ? '的整数' : '的数字'}`);
  return value;
}
export function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('请求必须是对象'); return value; }
export const cents = x => Math.round(x * 100) / 100;
export function validateStrategy(value) { if(!STRATEGIES.some(s=>s.id===value))throw new InputError('配置策略无效');return value; }
export function validateProfile(p) {
  object(p); return {
    horizon: num(p.horizon, '投资期限', 0, 40, true), tolerance: num(p.tolerance, '回撤承受', 1, 5, true),
    experience: num(p.experience, '投资经验', 1, 5, true), incomeStability: num(p.incomeStability, '收入稳定性', 1, 5, true),
    emergencyMonths: num(p.emergencyMonths, '应急储备月数', 0, 60), debtRate: num(p.debtRate, '负债年利率', 0, 60),
    monthlyExpense: num(p.monthlyExpense, '每月必要支出', 0, 10000000)
  };
}
export function validateHoldings(h) {
  object(h); const result = Object.fromEntries(ASSETS.map(a => [a.id, cents(num(h[a.id], a.name, 0, 100000000))]));
  if (Object.values(result).reduce((a, b) => a + b, 0) <= 0) throw new InputError('总资产必须大于零');
  return result;
}
export function validateGoal(g) {
  object(g); if (typeof g.name !== 'string' || !g.name.trim() || g.name.length > 40) throw new InputError('目标名称为 1–40 字');
  return { name: g.name.trim(), target: num(g.target, '目标金额', 1, 1000000000), years: num(g.years, '目标年限', 1, 40, true), monthly: num(g.monthly, '月投入', 0, 1000000), annualReturn: num(g.annualReturn, '年化假设', -30, 30), inflation: num(g.inflation, '通胀假设', 0, 20) };
}
export function riskAssessment(input) {
  const p = validateProfile(input);
  const willingness = Math.round(((p.tolerance - 1) * .7 + (p.experience - 1) * .3) * 25);
  let capacity = Math.min(100, p.horizon * 12 + p.incomeStability * 8);
  const reasons = [`投资期限 ${p.horizon} 年；主观承受分 ${willingness}/100。`];
  if (p.horizon < 2) { capacity = Math.min(capacity, 15); reasons.push('两年内有资金需求，优先流动性，风险等级上限为保守。'); }
  if (p.emergencyMonths < 3) { capacity = Math.min(capacity, 20); reasons.push('应急储备不足 3 个月，优先补足现金缓冲。'); }
  if (p.debtRate >= 8) { capacity = Math.min(capacity, 20); reasons.push('存在年利率不低于 8% 的负债，应先评估偿债安排。'); }
  if (p.incomeStability <= 2) { capacity = Math.min(capacity, 45); reasons.push('收入稳定性较低，限制风险资产比例。'); }
  const score = Math.min(willingness, capacity);
  const level = score < 25 ? 1 : score < 45 ? 2 : score < 65 ? 3 : score < 85 ? 4 : 5;
  const templates = [[.10,.25,.05,.60],[.25,.45,.10,.20],[.45,.35,.10,.10],[.60,.25,.10,.05],[.75,.15,.05,.05]];
  return { version: VERSION, score, willingness, capacity, level, label: ['保守型','稳健型','平衡型','成长型','进取型'][level-1], weights: Object.fromEntries(ASSETS.map((a,i)=>[a.id,templates[level-1][i]])), reasons, methodology: '透明规则模板；最终分数取风险意愿与财务承受能力的较低值。非持牌适当性评估。' };
}
export function metrics(input, weights = null) {
  const holdings = validateHoldings(input), total = cents(Object.values(holdings).reduce((a,b)=>a+b,0));
  const w = weights || Object.fromEntries(ASSETS.map(a=>[a.id,holdings[a.id]/total]));
  const mean = ASSETS.reduce((s,a)=>s+w[a.id]*a.mu,0);
  let variance = 0;
  for (const a of ASSETS) for (const b of ASSETS) variance += w[a.id]*w[b.id]*covariance(a,b);
  const riskContributions=ASSETS.map(a=>({id:a.id,name:a.name,share:variance>0?w[a.id]*ASSETS.reduce((s,b)=>s+w[b.id]*covariance(a,b),0)/variance:0}));
  return { total, weights: w, assumedReturn: mean, assumedVolatility: Math.sqrt(Math.max(0,variance)), concentration: Math.max(...Object.values(w)), riskContributions, covarianceMethod: '单因子协方差 + 独立残差；参数为教学假设，未以行情估计。' };
}
export function allocation(profile, holdings, strategy='policy') {
  validateStrategy(strategy);
  const assessment = riskAssessment(profile), current = metrics(holdings);
  const cashFloor = Math.min(.95, profile.monthlyExpense * 3 / current.total);
  if (profile.monthlyExpense * 3 > current.total * .95) assessment.reasons.push('当前组合不足以按 95% 现金上限覆盖 3 个月必要支出，需要另外评估现金缺口。');
  const w = {...assessment.weights};
  if (w.cash < cashFloor) {
    const scale = (1-cashFloor)/(1-w.cash);
    for (const a of ASSETS) if (a.id !== 'cash') w[a.id] *= scale;
    w.cash = cashFloor;
    assessment.reasons.push('按组合内至少保留 3 个月必要支出，提高现金比例；这是保守的产品规则。');
  }
  const constraints={equity:assessment.weights.equity,gold:Math.max(.15,assessment.weights.gold),cash:w.cash};
  const selected=strategyWeights(strategy,w,ASSETS,constraints);
  const drift = Math.max(...ASSETS.map(a=>Math.abs(current.weights[a.id]-selected[a.id])));
  return { assessment, current, target: metrics(holdings,selected), drift, cashFloor, strategy:STRATEGIES.find(s=>s.id===strategy),constraints };
}
export const SCENARIOS = [
  { id:'equity-crash', name:'权益急跌', shocks:{equity:-.30,bond:.02,gold:.05,cash:0} },
  { id:'rates-up', name:'利率冲击', shocks:{equity:-.10,bond:-.06,gold:-.08,cash:0} },
  { id:'inflation', name:'通胀压力', shocks:{equity:-.12,bond:-.08,gold:.15,cash:0} },
  { id:'broad-selloff', name:'同步下跌', shocks:{equity:-.35,bond:-.10,gold:-.15,cash:0} }
];
export function stressTest(holdings, weights) {
  const m=metrics(holdings,weights);
  return SCENARIOS.map(s=>{ const pct=ASSETS.reduce((v,a)=>v+m.weights[a.id]*s.shocks[a.id],0);return {...s,pct,loss:cents(m.total*pct),remaining:cents(m.total*(1+pct))}; });
}
export function projectGoal(initial, input) {
  num(initial,'初始资产',0,400000000); const g=validateGoal(input), months=g.years*12;
  const r=Math.pow(1+g.annualReturn/100,1/12)-1;
  const factor=Math.pow(1+r,months), annuity=Math.abs(r)<1e-10?months:(factor-1)/r;
  const future=initial*factor+g.monthly*annuity, invested=initial+g.monthly*months;
  const requiredMonthly=Math.max(0,(g.target-initial*factor)/annuity);
  const points=[]; let balance=initial;
  for(let month=0;month<=months;month++) { if(month>0) balance=balance*(1+r)+g.monthly; if(month%12===0) points.push({year:month/12,value:cents(balance),contributed:cents(initial+g.monthly*month)}); }
  return {...g,future:cents(future),invested:cents(invested),realValue:cents(future/Math.pow(1+g.inflation/100,g.years)),gap:cents(Math.max(0,g.target-future)),requiredMonthly:cents(requiredMonthly),points,assumption:'月末投入、收益按月复利；未扣税费。固定收益路径，不是预测或达标概率。'};
}
export function planRebalance(profile, holdings, feeBps=10, strategy='policy') {
  num(feeBps,'交易费率基点',0,100); const alloc=allocation(profile,holdings,strategy), total=alloc.current.total;
  const rate=feeBps/10000; let fee=0, next;
  for(let i=0;i<30;i++) {
    const net=total-fee;
    const cashReserve=Math.max(net*alloc.target.weights.cash,Math.min(total*.95,profile.monthlyExpense*3));
    const budget=Math.max(0,net-cashReserve),noncashWeight=1-alloc.target.weights.cash;
    next=Object.fromEntries(ASSETS.filter(a=>a.id!=='cash').map(a=>[a.id,cents(budget*alloc.target.weights[a.id]/noncashWeight)]));
    const turnover=Object.entries(next).reduce((v,[id,value])=>v+Math.abs(value-holdings[id]),0);
    const updated=cents(turnover*rate); if(updated===fee) break; fee=updated;
  }
  next.cash=cents(total-fee-next.equity-next.bond-next.gold);
  const reserve=Math.min(total*.95,profile.monthlyExpense*3);
  // 分级舍入可能吞掉 1 分现金，优先从最大非现金资产补足。
  if(next.cash+.000001<Math.min(reserve,total-fee)){
    const id=['equity','bond','gold'].sort((x,y)=>next[y]-next[x])[0],shortfall=cents(Math.min(reserve,total-fee)-next.cash);
    if(next[id]>=shortfall){next[id]=cents(next[id]-shortfall);next.cash=cents(next.cash+shortfall);}
  }
  if(next.cash<0) throw new InputError('费用超过现金余额，请减少调仓规模');
  const trades=ASSETS.map(a=>({asset:a.id,name:a.name,before:holdings[a.id],after:next[a.id],delta:cents(next[a.id]-holdings[a.id])}));
  return { policyVersion:VERSION, strategy:alloc.strategy, feeBps, fee, totalBefore:total, totalAfter:cents(total-fee), turnover:cents(trades.filter(t=>t.asset!=='cash').reduce((v,t)=>v+Math.abs(t.delta),0)), holdings:next, trades, allocation:alloc, disclaimer:'仅调整模拟金额。假设无限可分、无最小交易单位；未计滑点、税费和实际产品约束。' };
}
export function compareStrategies(state,feeBps=10) {
  num(feeBps,'交易费率基点',0,100);
  return STRATEGIES.map(s=>{
    const plan=planRebalance(state.profile,state.holdings,feeBps,s.id),m=plan.allocation.target;
    const worst=stressTest(state.holdings,m.weights).reduce((a,b)=>a.pct<b.pct?a:b);
    return {...s,weights:m.weights,assumedReturn:m.assumedReturn,assumedVolatility:m.assumedVolatility,riskContributions:m.riskContributions,worstShock:worst.pct,fee:plan.fee,turnover:plan.turnover,constraints:plan.allocation.constraints,selected:s.id===(state.strategy||'policy')};
  });
}
export function diagnostics(state,a,now=new Date()) {
  const reviewed=state.holdingsUpdatedAt?Date.parse(state.holdingsUpdatedAt):NaN;
  const ageDays=Number.isFinite(reviewed)?Math.max(0,Math.floor((now.getTime()-reviewed)/86400000)):null;
  const p=state.profile,coverage=p.monthlyExpense>0?state.holdings.cash/p.monthlyExpense:null;
  const checks=[
    {id:'data',title:'估值核对',status:state.dataMode==='demo'?'info':ageDays===null||ageDays>30?'warning':'pass',value:state.dataMode==='demo'?'演示数据':ageDays===null?'核对时间未知':`${ageDays} 天前录入`,detail:'手动金额不是实时行情；30 天为产品复核提醒线。模拟调仓不刷新估值时间。',action:'编辑资产并核对当前金额',page:'portfolio'},
    {id:'cash',title:'组合现金覆盖',status:coverage===null?'info':coverage<3?'warning':'pass',value:coverage===null?'未填写必要支出':`${coverage.toFixed(1)} 个月`,detail:'只按组合现金除以每月必要支出；问卷中的外部应急资金不重复计入。',action:'核对必要支出与应急储备',page:'risk'},
    {id:'concentration',title:'非现金集中度',status:Math.max(...ASSETS.filter(x=>x.id!=='cash').map(x=>a.current.weights[x.id]))>.6?'warning':'pass',value:`${(Math.max(...ASSETS.filter(x=>x.id!=='cash').map(x=>a.current.weights[x.id]))*100).toFixed(1)}%`,detail:'非现金单一类别超过总资产 60% 时提醒；类别内部证券集中风险尚未覆盖。',action:'比较配置方案',page:'research'},
    {id:'drift',title:'配置偏离',status:a.drift>.05?'warning':'pass',value:`${(a.drift*100).toFixed(1)} 个百分点`,detail:'相对当前选择的模拟目标；5 个百分点是观察线，不是自动交易信号。',action:'预览模拟调仓及费用',page:'portfolio'},
    {id:'debt',title:'负债成本',status:p.debtRate>=8?'warning':'pass',value:`${p.debtRate}% 年利率`,detail:'8% 是本产品的保守限制规则，未考虑税务、期限和提前还款条件。',action:'重新核对风险问卷',page:'risk'}
  ];
  return {checks,attentionCount:checks.filter(c=>c.status==='warning').length,data:{mode:state.dataMode,reviewedAt:state.holdingsUpdatedAt||null,ageDays,live:false},methodology:'静态规则体检，不输出不具统计依据的综合健康分。'};
}
export function analyze(state) {
  const a=allocation(state.profile,state.holdings,state.strategy||'policy');
  return {...a, diagnostics:diagnostics(state,a),stress:stressTest(state.holdings), targetStress:stressTest(state.holdings,a.target.weights), goal:projectGoal(a.current.total,state.goal), assumptions:ASSETS, policyVersion:VERSION};
}
