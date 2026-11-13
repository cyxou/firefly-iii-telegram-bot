// HTML template for the reports widget (Bot API 10.4). One self-contained
// document: inline CSS + JS, ≤32768 B raw and ≤4096 B after server zlib-9 —
// the size is a tested contract (__tests__/features/reports/report-widget-
// html.test.ts), so keep this file lean. Rules that shape the code:
//   - no network, no external resources, no libraries; QuickJS engine
//   - fixed code + bot-written state: JS only renders from TelegramWidget
//     .chatData / request() answers; it never mutates state itself
//   - theme via the bubble's CSS variables; light/dark follows the chat
//   - taps only (no text input exists in the sandbox); no touch-action tricks
//     needed — every control is a plain tap target
//   - locale strings and the Firefly web URL are baked at send time (each
//     user gets their own message; the HTML itself stays locale-free)

/** UI strings baked into the HTML at send time. */
export interface WidgetUiLabels {
  /** Tab bar: [view id, label] in display order. */
  tb: [string, string][]
  /** tables.income / tables.expense / tables.net */
  i: string
  e: string
  n: string
  /** reports.emptyGeneric */
  em: string
  /** reports.widget.error */
  er: string
}

export function buildReportsWidgetHtml(l: WidgetUiLabels, fireflyUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;padding:0}
.tb{display:flex;gap:4px;margin:0 0 8px}.tb button{flex:1;padding:4px 2px;font-size:.85em}
.tb button.on{background:var(--tg-theme-button-color);color:var(--tg-theme-button-text-color);border:0}
.nv{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.nv button{padding:2px 12px}
h3{margin:0 0 8px;font-size:1.05em}
.rw{display:flex;justify-content:space-between;gap:8px;margin:3px 0;font-size:.93em}
.rw b{white-space:nowrap}.mu{color:var(--tg-theme-hint-color)}
.ba{height:7px;border-radius:4px;background:var(--tg-theme-secondary-bg-color);margin:1px 0 7px;overflow:hidden}
.ba i{display:block;height:100%;border-radius:4px;background:var(--tg-theme-link-color)}
.ov .ba i{background:var(--tg-theme-destructive-text-color)}
svg{display:block;width:100%;height:110px}
.lb{display:flex}.lb span{flex:1;text-align:center;font-size:.75em}
.ft{display:flex;align-items:center;gap:8px;margin-top:10px}
.ft button{padding:2px 10px}
</style></head><body>
<div class="tb" id="tb"></div>
<div class="nv"><button id="pv">‹</button><b id="mo"></b><button id="nx">›</button></div>
<h3 id="ti"></h3><div id="vw"></div>
<div class="ft"><button id="rf">↻</button><button id="ln">🔗</button><span class="mu" id="st" style="font-size:.85em"></span></div>
<script>
var W=TelegramWidget,L=${JSON.stringify(l)},U=${JSON.stringify(fireflyUrl)},S
function el(i){return document.getElementById(i)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function num(x){var s=Math.abs(x).toFixed(2).replace(/\\.?0+$/,'');return(x<0?'−':'')+s}
function nm(d,k){var p=d.split('-'),t=new Date(+p[0],+p[1]-1+k);return t.getFullYear()+'-'+('0'+(t.getMonth()+1)).slice(-2)}
function cm(){var t=new Date();return t.getFullYear()+'-'+('0'+(t.getMonth()+1)).slice(-2)}
function hap(){try{W.HapticFeedback.selectionChanged()}catch(e){}}
function st(t){el('st').textContent=t}
function mon(o){var h=''
if(o.s&&o.s.length){h+='<div class=rw><span></span><span class=mu>'+L.i+'</span><span class=mu>'+L.e+'</span><span class=mu>'+L.n+'</span></div>'
o.s.forEach(function(x){h+='<div class=rw><b>'+esc(x[0])+'</b><span>'+num(x[1])+'</span><span>'+num(-x[2])+'</span><span><b>'+num(x[1]-x[2])+'</b></span></div>'})
h+='<div style=height:8px></div>'}
if(o.c&&o.c.length){var mx=o.c[0][1]||1
o.c.forEach(function(x){h+='<div class=rw><span>'+esc(x[0])+'</span><span class=mu>'+num(x[1])+'</span></div><div class=ba><i style=width:'+Math.max(2,Math.round(x[1]/mx*100))+'%"></i></div>'})}
return h||'<div class=mu>'+L.em+'</div>'}
function trd(o){var mx=1;(o.m||[]).forEach(function(x){mx=Math.max(mx,x[1],x[2])})
var H=40,r='';o.m.forEach(function(x,i){var w=100/o.m.length,b=w*0.32,x0=i*w+w*0.16
r+=rc(x0,H-x[1]/mx*H,b,x[1]/mx*H,1)+rc(x0+b+w*0.2,H-x[2]/mx*H,b,x[2]/mx*H,0)})
return '<svg viewBox="0 0 100 42" preserveAspectRatio="none">'+r+'</svg><div class=lb>'+o.m.map(function(x){return '<span>'+esc(x[0])+'</span>'}).join('')+'</div>'+(o.cur?'<div class=rw><span class=mu>'+esc(o.cur)+'</span></div>':'')}
function rc(x,y,w,h,k){return '<rect x='+x.toFixed(2)+' y='+y.toFixed(2)+' width='+w.toFixed(2)+' height='+Math.max(h,0.4).toFixed(2)+' style=fill:var\\(--tg-theme-'+(k?'link':'destructive-text')+'-color) />'}
function bud(o){if(!o.b||!o.b.length)return '<div class=mu>'+L.em+'</div>'
var h='';o.b.forEach(function(x){var l=x[2],t=l?Math.round(x[1]/l*100):0
h+='<div class=rw><span>'+esc(x[0])+'</span><span class=mu>'+num(x[1])+(l?' / '+num(l):'')+'</span></div>'
if(l)h+='<div class=ba'+(t>100?' ov':'')+'><i style=width:'+Math.min(100,Math.max(2,t))+'%"></i></div>'})
return h}
function net(o){var h='';(o.n||[]).forEach(function(x){h+='<div class=rw><span class=mu>'+L.n+'</span><b>'+esc(x[0])+' '+num(x[1])+'</b></div>'})
;(o.a||[]).forEach(function(x){h+='<div class=rw><span>'+esc(x[0])+'</span><b>'+num(x[1])+'</b></div>'})
return h||'<div class=mu>'+L.em+'</div>'}
function draw(){var o=S.s
if(!o){el('vw').innerHTML='<div class=mu>'+L.em+'</div>';el('ti').textContent='';return}
var bs=el('tb').children;for(var i=0;i<bs.length;i++)bs[i].className=bs[i].getAttribute('data-v')==o.v?'on':''
el('mo').textContent=o.d;el('ti').textContent=o.T
el('vw').innerHTML=o.v=='monthly'?mon(o):o.v=='trend'?trd(o):o.v=='budgets'?bud(o):net(o)}
function req(v,d){if(S.bu||!v)return;S.bu=1;st('…')
W.request('v:'+v+'@'+d).then(function(a){S.bu=0;var o;try{o=JSON.parse(a.result||'{}')}catch(e){o={}}
if(o.e){st(L.er);return}if(!S.s||o.r>=(S.s.r||0)){S.s=o;draw();st(new Date().toTimeString().slice(0,5))}},
function(){S.bu=0;st(L.er)})}
function go(v,d){hap();req(v,d||cm())}
L.tb.forEach(function(p){var b=document.createElement('button');b.textContent=p[1];b.setAttribute('data-v',p[0]);el('tb').appendChild(b)})
el('tb').addEventListener('click',function(e){var v=e.target.getAttribute&&e.target.getAttribute('data-v');if(v)go(v,S.s&&S.s.d)})
el('pv').onclick=function(){if(S.s)go(S.s.v,nm(S.s.d,-1))}
el('nx').onclick=function(){if(S.s)go(S.s.v,nm(S.s.d,1))}
el('rf').onclick=function(){go(S.s?S.s.v:'monthly',S.s?S.s.d:cm())}
el('ln').onclick=function(){if(U&&U.slice(0,8)=='https://')W.openLink(U)}
W.onEvent('chatDataChanged',function(){var o;try{o=JSON.parse(W.chatData||'null')}catch(e){o=null}
if(o&&(!S.s||o.r>=(S.s.r||0))){S.s=o;draw()}})
S={s:JSON.parse(W.chatData||'null'),bu:0}
draw()
// fresh data when the widget comes on screen (private-chat background request;
// the app holds it until the widget is visible)
if(!W.isPreview)req(S.s?S.s.v:'monthly',S.s?S.s.d:cm())
</script></body></html>`
}
