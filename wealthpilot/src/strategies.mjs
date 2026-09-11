// 原创实现；算法概念参考 skfolio，未复制第三方源代码。
export const STRATEGIES = [
  {id:'policy',name:'风险规则配置',description:'五档模板结合现金需求，作为当前画像的基准方案。'},
  {id:'inverse-vol',name:'约束逆波动配置',description:'非现金资产先按假设波动的倒数分配，再施加权益与黄金上限。并非等风险贡献。'},
  {id:'min-variance',name:'网格最小方差',description:'在固定现金、权益上限和黄金上限内，按 1 个百分点网格搜索较低假设方差。'}
];
export const covariance=(a,b)=>a.id===b.id?a.vol*a.vol:a.factor*b.factor;
export function variance(weights,assets){return assets.reduce((sum,a)=>sum+assets.reduce((s,b)=>s+weights[a.id]*weights[b.id]*covariance(a,b),0),0);}
export function strategyWeights(id,baseline,assets,caps) {
  if(id==='policy')return {...baseline};
  const cash=baseline.cash,budget=1-cash;
  if(id==='inverse-vol') {
    const noncash=assets.filter(a=>a.id!=='cash'),inv=noncash.reduce((s,a)=>s+1/a.vol,0);
    const equity=Math.min(caps.equity,budget*(1/assets.find(a=>a.id==='equity').vol)/inv);
    const gold=Math.min(caps.gold,budget*(1/assets.find(a=>a.id==='gold').vol)/inv);
    return {equity,gold,bond:Math.max(0,budget-equity-gold),cash};
  }
  if(id==='min-variance') {
    let best={...baseline},bestVar=variance(best,assets);
    // 保留基准候选，避免网格量化使结果比基准更差。
    const grid=max=>Array.from(new Set([0,max,...Array.from({length:Math.floor(max*100)+1},(_,i)=>i/100)]));
    for(const equity of grid(Math.min(budget,caps.equity)))for(const gold of grid(Math.min(caps.gold,budget-equity))){
      const w={equity,gold,bond:Math.max(0,budget-equity-gold),cash},v=variance(w,assets);
      if(v<bestVar-1e-15){best=w;bestVar=v;}
    }
    return best;
  }
  throw new Error('Unknown strategy');
}
