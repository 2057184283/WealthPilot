import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './src/storage.mjs';
import { analyze, ASSETS, SOURCES, VERSION, InputError, object, num, validateProfile, validateHoldings, validateGoal, validateStrategy, compareStrategies, planRebalance } from './src/domain.mjs';
import { advisor, localAdvice } from './src/advisor.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const digest=s=>createHash('sha256').update(s).digest();
export function createApp(options={}) {
  const env=options.env||process.env, host=env.HOST||'127.0.0.1', token=env.ACCESS_TOKEN||'';
  const local=['127.0.0.1','localhost','::1'].includes(host);
  if(!local && token.length<24)throw new Error('非本机监听必须配置至少 24 字符的 ACCESS_TOKEN');
  if(!local && !env.PUBLIC_ORIGIN)throw new Error('非本机监听必须设置 PUBLIC_ORIGIN，例如 https://wealth.example.com');
  if(env.PUBLIC_ORIGIN) new URL(env.PUBLIC_ORIGIN);
  const store=options.store||createStore(resolve(root,env.DATA_DIR||'data'));
  const sessions=new Map(), limits=new Map();
  function json(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data)); }
  function rate(req,scope,max,window=60000) {
    const now=Date.now(), key=`${req.socket.remoteAddress}:${scope}`;
    for(const [k,v] of limits)if(v.until<now)limits.delete(k);
    if(limits.size>=10000&&!limits.has(key))throw new InputError('服务繁忙，请稍后重试',429);
    const value=limits.get(key)||{count:0,until:now+window};value.count++;limits.set(key,value);
    if(value.count>max)throw new InputError('操作过于频繁，请稍后重试',429);
  }
  function authenticated(req) {
    if(!token)return true;
    const sid=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('wp_session='))?.slice(11);
    if(!sid||!sessions.has(sid))return false;
    if(sessions.get(sid)<Date.now()){sessions.delete(sid);return false;} return true;
  }
  async function body(req) {
    if(!String(req.headers['content-type']).startsWith('application/json'))throw new InputError('请求需使用 application/json',415);
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>32768)throw new InputError('请求超过 32 KB',413);chunks.push(chunk);}
    try{return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){if(e instanceof InputError)throw e;throw new InputError('JSON 格式无效');}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      const requestHost=req.headers.host;
      if(!requestHost)throw new InputError('Host 无效');
      const authority=new URL('http://'+requestHost);
      if(local&&!['127.0.0.1','localhost','[::1]'].includes(authority.hostname))throw new InputError('Host 不在允许列表',403);
      if(!local&&authority.host!==new URL(env.PUBLIC_ORIGIN).host)throw new InputError('Host 不匹配 PUBLIC_ORIGIN',403);
      const pathname=new URL(req.url,'http://'+requestHost).pathname;
      if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,version:'1.1.0',policyVersion:VERSION});
      if(['POST','PUT','DELETE','PATCH'].includes(req.method)) {
        const origin=env.PUBLIC_ORIGIN||`http://${requestHost}`;
        if(req.headers.origin!==origin)throw new InputError('请求来源无效',403);
        rate(req,'writes',90);
      }
      if(req.method==='POST'&&pathname==='/api/login') {
        rate(req,'login',8,300000);const data=await body(req);
        if(typeof data.token!=='string'||!token||!timingSafeEqual(digest(data.token),digest(token)))throw new InputError('访问口令不正确',401);
        for(const [id,expires]of sessions)if(expires<Date.now())sessions.delete(id);
        if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
        const sid=randomBytes(32).toString('hex');sessions.set(sid,Date.now()+8*3600000);
        res.setHeader('Set-Cookie',`wp_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${env.COOKIE_SECURE==='true'?'; Secure':''}`);
        return json(res,200,{ok:true});
      }
      if(pathname.startsWith('/api/')) {
        if(!authenticated(req))throw new InputError('请输入工作台访问口令',401);
        if(req.method==='GET'&&pathname==='/api/bootstrap') {
          const state=store.get();return json(res,200,{state,analysis:analyze(state),strategies:compareStrategies(state),audit:store.audit(),assets:ASSETS,sources:SOURCES,aiConfigured:!!(env.AI_BASE_URL&&env.AI_API_KEY&&env.AI_MODEL),authEnabled:!!token});
        }
        if(req.method==='POST'&&pathname==='/api/logout') {
          const sid=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('wp_session='))?.slice(11);sessions.delete(sid);
          res.setHeader('Set-Cookie','wp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});
        }
        if(req.method==='PUT'&&pathname==='/api/workspace') {
          const data=await body(req);num(data.version,'版本',1,Number.MAX_SAFE_INTEGER,true);
          const allowed=['profile','holdings','goal','strategy'];if(!allowed.includes(data.section))throw new InputError('更新类型无效');
          const value=({profile:validateProfile,holdings:validateHoldings,goal:validateGoal,strategy:validateStrategy})[data.section](data.value);
          return json(res,200,store.update(data.version,`update_${data.section}`,state=>({state:{...state,[data.section]:value,...(data.section==='holdings'?{dataMode:'manual',holdingsUpdatedAt:new Date().toISOString()}:{})},details:{section:data.section,before:state[data.section]??null,after:value,policyVersion:VERSION}})));
        }
        if(req.method==='POST'&&pathname==='/api/strategies/compare') {
          const data=await body(req),state=store.get();if(data.version!==state.version)throw new InputError('组合已更新，请刷新后重试',409);
          return json(res,200,{version:state.version,strategies:compareStrategies(state,data.feeBps)});
        }
        if(req.method==='POST'&&pathname==='/api/rebalance/preview') {
          const data=await body(req),state=store.get();if(data.version!==state.version)throw new InputError('组合已更新，请刷新后重试',409);
          const feeBps=num(data.feeBps,'交易费率',0,100);
          return json(res,200,{version:state.version,plan:planRebalance(state.profile,state.holdings,feeBps,state.strategy||'policy')});
        }
        if(req.method==='POST'&&pathname==='/api/rebalance/execute') {
          const data=await body(req);num(data.version,'版本',1,Number.MAX_SAFE_INTEGER,true);num(data.feeBps,'费率',0,100);
          if(data.confirm!==true)throw new InputError('需明确确认模拟调仓');
          if(typeof data.key!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(data.key))throw new InputError('幂等键无效');
          return json(res,200,store.update(data.version,'paper_rebalance',state=>{
            const plan=planRebalance(state.profile,state.holdings,data.feeBps,state.strategy||'policy');
            return {state:{...state,holdings:plan.holdings},details:{fee:plan.fee,trades:plan.trades,strategy:plan.strategy.id,policyVersion:VERSION},response:{plan}};
          },data.key,JSON.stringify({version:data.version,feeBps:data.feeBps})));
        }
        if(req.method==='POST'&&pathname==='/api/chat') {
          rate(req,'chat',12);const data=await body(req);
          if(typeof data.question!=='string'||!data.question.trim()||data.question.length>2000)throw new InputError('问题需为 1–2000 字');
          const state=store.get();
          return json(res,200,data.externalConsent===true?await advisor(data.question,state,env):localAdvice(data.question,state));
        }
        throw new InputError('接口不存在',404);
      }
      if(req.method!=='GET'&&req.method!=='HEAD')throw new InputError('方法不支持',405);
      const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/research-view.js':['research-view.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
      if(!staticFiles[pathname])throw new InputError('页面不存在',404);
      const [file,type]=staticFiles[pathname],content=await readFile(resolve(root,'public',file));
      res.writeHead(200,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:content);
    }catch(e){if(!res.headersSent)json(res,e instanceof InputError?e.status:500,{error:e instanceof InputError?e.message:'服务暂时不可用，请稍后重试'});else res.end();if(!(e instanceof InputError))console.error('request_error',e.code||e.name);}
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  return {server,store,host};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server,store,host}=createApp();const port=Number(process.env.PORT||3000);
  server.listen(port,host,()=>console.log(`WealthPilot ready: http://${host}:${server.address().port}`));
  server.on('error',e=>{console.error('启动失败:',e.code||e.message);store.close();process.exitCode=1;});
  for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>server.close(()=>{store.close();process.exit(0);}));
}
