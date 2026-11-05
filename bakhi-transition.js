/* BKT-START : hiệu ứng bàn tay kéo khi đổi trang (dùng chung cho mọi trang con) */
(function(){
if(window.__bkt)return;
var D=document,R=D.documentElement,ls=function(k,v){try{return v===undefined?localStorage.getItem(k):localStorage.setItem(k,v)}catch(e){}},
cfg=Object.assign({on:true,style:'hand',speed:1},(function(){try{return JSON.parse(ls('bktCfg'))||{}}catch(e){return{}}})()),
reduce=matchMedia('(prefers-reduced-motion:reduce)').matches,last='L',
HAND='<svg viewBox="0 0 130 120" width="120" height="110"><g stroke="#1e1b4b" stroke-width="5" stroke-linejoin="round" fill="#fff"><rect x="4" y="22" width="60" height="16" rx="8"/><rect x="2" y="42" width="66" height="16" rx="8"/><rect x="4" y="62" width="62" height="16" rx="8"/><rect x="8" y="82" width="52" height="15" rx="7.5"/><rect x="40" y="18" width="56" height="84" rx="26"/><rect x="96" y="30" width="30" height="60" rx="8" fill="#6366f1"/></g></svg>',
WAVE='<svg viewBox="0 0 70 100" preserveAspectRatio="none"><path d="M70 0C30 8 10 12 28 24S60 40 30 52 10 70 32 80 50 94 70 100Z" fill="#4338ca"/></svg>',
st=D.createElement('style'),o=D.createElement('div');
st.textContent='#bkt{position:fixed;inset:0;z-index:2147483000;display:none;overflow:hidden;cursor:progress}#bkt.r .w{transform:scaleX(-1)}#bkt .w,#bkt .p{position:absolute;inset:0}#bkt .p{background:linear-gradient(90deg,#4338ca,#7c3aed 55%,#a855f7)}#bkt .p:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 2px,transparent 2px 36px)}#bkt .e{position:absolute;top:0;bottom:0;left:-69px;width:70px}#bkt .e svg{width:100%;height:100%;display:block}#bkt .h{position:absolute;top:50%;left:-110px;margin-top:-55px;z-index:2;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))}#bkt.in .h{left:14%}#bkt .t{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:600 1.15rem Lexend,system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.35);pointer-events:none}';
o.id='bkt';o.innerHTML='<div class="w"><div class="p"><div class="e">'+WAVE+'</div><div class="h">'+HAND+'</div></div></div><div class="t"></div>';
function mount(){if(!o.parentNode)R.appendChild(o);if(!st.parentNode)(D.head||R).appendChild(st)}
function look(){var on=cfg.style==='hand';o.querySelector('.h').style.display=o.querySelector('.e').style.display=on?'':'none'}
function play(d,ph,label){mount();last=d;var out=ph==='out',s=cfg.style,ms=(s==='hand'?750:550)*cfg.speed;
 o.className=(d==='R'?'r ':'')+(out?'in':'');o.style.display='block';look();
 var p=o.querySelector('.p'),h=o.querySelector('.h');o.querySelector('.t').textContent=out?'':(label||'');
 var F=s==='hand'?[{transform:'translateX(0)'},{transform:'translateX(calc(-100% - 160px))'}]:s==='iris'?[{clipPath:'circle(75% at 50% 50%)'},{clipPath:'circle(0% at 50% 50%)'}]:[{opacity:1},{opacity:0}];
 var K=out?F:[s==='hand'?{transform:'translateX(calc(100% + 160px))'}:F[1],F[0]];
 var w=s==='hand'?h.animate([{transform:'rotate(-9deg) translateY(-10px)'},{transform:'rotate(9deg) translateY(10px)'}],{duration:240*cfg.speed,iterations:1/0,direction:'alternate',easing:'ease-in-out'}):null;
 var a=p.animate(K,{duration:ms,easing:out?'cubic-bezier(.55,0,.9,.45)':'cubic-bezier(.25,.8,.25,1)',fill:'forwards'});
 return a.finished.then(function(){w&&w.cancel();if(out){o.style.display='none';a.cancel()}},function(){})}
function go(u,l,d){if(!cfg.on||reduce){location.href=u;return}var done=0,f=function(){if(done++)return;try{sessionStorage.setItem('bktF',JSON.stringify({d:d,t:Date.now()}))}catch(e){}location.href=u};play(d,'in',l).then(f);setTimeout(f,1800*cfg.speed+400)}
var F0=null;try{F0=JSON.parse(sessionStorage.getItem('bktF'));sessionStorage.removeItem('bktF')}catch(e){}
var nv=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
if(!reduce&&cfg.on&&((F0&&Date.now()-F0.t<15000)||(nv&&nv.type==='back_forward'))){var d0=F0?F0.d:'R';mount();o.className=(d0==='R'?'r ':'')+'in';o.style.display='block';look();
 var fire=function(){setTimeout(function(){play(d0,'out')},150)};D.readyState==='complete'?fire():addEventListener('load',fire);
 setTimeout(function(){o.style.display==='block'&&!o.getAnimations({subtree:true}).length&&play(d0,'out')},5000)}
addEventListener('pageshow',function(e){if(e.persisted&&o.style.display==='block')play(last,'out')});
D.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey||a.target==='_blank'||a.hasAttribute('download')||window.__bktOff||!cfg.on||reduce)return;
 var u;try{u=new URL(a.href,location.href)}catch(x){return}
 if(u.origin!==location.origin||/^(mailto|tel|javascript)/.test(a.getAttribute('href'))||(u.pathname===location.pathname&&u.search===location.search))return;
 e.preventDefault();var home=/\/(index\.html)?$/.test(u.pathname),nm=a.querySelector('.truncate,.font-bold');
 go(u.href,home?'Trang chủ':((nm||a).textContent||'').trim().split('\n')[0],home?'R':'L')},true);
window.__bkt={cfg:cfg,go:go,play:play,save:function(){ls('bktCfg',JSON.stringify(cfg))},test:function(d){d=d||'L';play(d,'in','Thử chuyển trang').then(function(){setTimeout(function(){play(d,'out')},500)})}};
})();
/* BKT-END */
