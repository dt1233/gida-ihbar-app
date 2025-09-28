function $(sel){ return document.querySelector(sel); }
function el(tag, attrs={}, ...children){ const e=document.createElement(tag); Object.entries(attrs).forEach(([k,v])=>{ if(k==='class') e.className=v; else if(k==='html') e.innerHTML=v; else e.setAttribute(k,v); }); children.forEach(c=>e.appendChild(c)); return e; }

async function fetchJSON(url, opts){ const r=await fetch(url, opts); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
function linkify(text){ const urlRegex=/(https?:\/\/[\w.-]+(?:\/[\w\-.~:%\/?#[\]@!$&'()*+,;=]*)?)/gi; return text.replace(urlRegex,(u)=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);} 

// State
let images=[]; let currentIndex=0;

function openLightbox(idx){ if(!images.length) return; currentIndex=((idx%images.length)+images.length)%images.length; const lb=$('#lightbox'); const img=$('#lightboxImage'); const cap=$('#lightboxCaption'); const counter=$('#lightboxCounter'); const it=images[currentIndex]; img.src=it.url; img.alt=it.name||'Görsel'; cap.textContent=it.name||''; if(counter) counter.textContent=`${currentIndex+1} / ${images.length}`; lb.setAttribute('aria-hidden','false'); lb.classList.add('open'); document.body.style.overflow='hidden'; }
function closeLightbox(){ const lb=$('#lightbox'); lb.classList.remove('open'); lb.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }
function nextImage(){ openLightbox(currentIndex+1); } function prevImage(){ openLightbox(currentIndex-1); }
function bindLightbox(){ $('#lightbox').addEventListener('click',(e)=>{ if(e.target.id==='lightbox'||e.target.classList.contains('lb-close')) closeLightbox(); }); $('.lb-close').addEventListener('click',closeLightbox); $('.lb-next').addEventListener('click',(e)=>{ e.stopPropagation(); nextImage(); }); $('.lb-prev').addEventListener('click',(e)=>{ e.stopPropagation(); prevImage(); }); window.addEventListener('keydown',(e)=>{ if(!$('#lightbox').classList.contains('open')) return; if(e.key==='Escape') closeLightbox(); else if(e.key==='ArrowRight') nextImage(); else if(e.key==='ArrowLeft') prevImage(); }); let startX=0; $('#lightbox').addEventListener('touchstart',(e)=>{ if(e.touches&&e.touches[0]) startX=e.touches[0].clientX; },{passive:true}); $('#lightbox').addEventListener('touchend',(e)=>{ const endX=(e.changedTouches&&e.changedTouches[0])?e.changedTouches[0].clientX:0; const dx=endX-startX; if(Math.abs(dx)>40){ if(dx<0) nextImage(); else prevImage(); } }); }
// Slideshow removed: manual navigation only

function renderCarousel(){ const imgEl=$('#carouselImage'); const prevBtn=$('#carPrev'); const nextBtn=$('#carNext'); if(!imgEl||!prevBtn||!nextBtn) return; if(!images.length){ const parent=imgEl.parentElement; if(parent) parent.innerHTML='<div class="muted">Henüz görsel yok.</div>'; return; } currentIndex=((currentIndex%images.length)+images.length)%images.length; imgEl.src=images[currentIndex].url; imgEl.alt=images[currentIndex].name||'Görsel'; prevBtn.onclick=(e)=>{ e.stopPropagation(); currentIndex=(currentIndex-1+images.length)%images.length; renderCarousel(); }; nextBtn.onclick=(e)=>{ e.stopPropagation(); currentIndex=(currentIndex+1)%images.length; renderCarousel(); }; imgEl.onclick=()=>openLightbox(currentIndex); }

async function loadImages(){ const car=$('#carousel'); if(car) car.classList.add('loading'); try{ const data=await fetchJSON('/api/images'); images=data.images||[]; renderCarousel(); } catch(e){ if(car) car.innerHTML=`<div class="error">Resimler alınamadı: ${e.message}</div>`; } finally{ if(car) car.classList.remove('loading'); } }

async function loadScenario(){ const view=$('#scenarioView'); try{ const data=await fetchJSON('/api/scenario'); if(data&&data.html){ view.innerHTML=data.scenario||''; } else { view.innerHTML=linkify((data.scenario||'').replace(/\n/g,'<br/>')); } } catch(e){ view.innerHTML=`<div class="error">Senaryo alınamadı: ${e.message}</div>`; } }

// Notifications
const ANN_URL='/api/announcements'; const ANN_BADGE_INTERVAL_MS=60000; const ANN_REFRESH_INTERVAL_MS=30000; let annTimer=null; let annBadgeTimer=null; function getLastSeenAnnTs(){ return localStorage.getItem('lastSeenAnnTs')||'0'; } function setLastSeenAnnTs(ts){ localStorage.setItem('lastSeenAnnTs', ts); }
async function loadAnnouncements(showPanel=false){
  try{
    const data=await fetchJSON(ANN_URL);
    const items=data.items||[];
    const lastSeen=getLastSeenAnnTs();
    const newer=items.filter(a=>(a.ts||'')>lastSeen).length;
    const badge=$('#notifyBadge');
    const nBtn=$('#notifyBtn');
    if(badge){ if(newer>0){ badge.hidden=false; badge.textContent=String(newer);} else badge.hidden=true; }
    if(nBtn){ if(newer>0){ nBtn.classList.add('has-new'); } else { nBtn.classList.remove('has-new'); } }
    if(showPanel){
      const list=$('#notifyList');
      if(list){
        if(!items.length) list.innerHTML='<li class="muted">Duyuru yok</li>';
        else {
          list.innerHTML='';
          items.forEach(a=>{
            const li=document.createElement('li');
            li.className='ann-item';
            if (a.type) li.classList.add(`type-${a.type}`);
            li.dataset.ts=a.ts||'';
            li.dataset.by=a.by||'Admin';
            li.dataset.msg=a.message||'';
            li.textContent=`${new Date(a.ts).toLocaleString()} — ${a.message}`;
            li.addEventListener('click',()=>openAnnModal(li.dataset.msg, li.dataset.ts, li.dataset.by));
            list.appendChild(li);
          });
        }
      }
    }
  }catch(_){ }
}

function openAnnModal(message, ts, by){
  const modal=$('#annModal'); if(!modal) return;
  $('#annMsg').textContent=message||'';
  $('#annDate').textContent = ts ? new Date(ts).toLocaleString() : '';
  $('#annBy').textContent = by || 'Admin';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function closeAnnModal(){ const modal=$('#annModal'); if(!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }
function openNotifyPanel(){ const p=$('#notifyPanel'); if(!p) return; p.classList.add('open'); p.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; setLastSeenAnnTs(new Date().toISOString()); const badge=$('#notifyBadge'); if(badge) badge.hidden=true; const nBtn=$('#notifyBtn'); if(nBtn) nBtn.classList.remove('has-new'); if(!annTimer) annTimer=setInterval(()=>loadAnnouncements(false), ANN_REFRESH_INTERVAL_MS); }
function closeNotifyPanel(){ const p=$('#notifyPanel'); if(!p) return; p.classList.remove('open'); p.setAttribute('aria-hidden','true'); document.body.style.overflow=''; if(annTimer){ clearInterval(annTimer); annTimer=null; } }

function init(){ $('#year').textContent=new Date().getFullYear(); bindLightbox(); loadImages(); loadScenario();
  // Theme toggle
  const root=document.documentElement; const btn=$('#themeToggle'); const saved=localStorage.getItem('theme')||'dark'; if(saved==='light'){ root.setAttribute('data-theme','light'); if(btn) btn.textContent='☀️'; } else { root.removeAttribute('data-theme'); if(btn) btn.textContent='🌙'; } if(btn){ btn.addEventListener('click',()=>{ const isLight=root.getAttribute('data-theme')==='light'; if(isLight){ root.removeAttribute('data-theme'); localStorage.setItem('theme','dark'); btn.textContent='🌙'; } else { root.setAttribute('data-theme','light'); localStorage.setItem('theme','light'); btn.textContent='☀️'; } }); }
  // Notifications
  const nBtn=$('#notifyBtn'); const nClose=$('#notifyClose'); const nPanel=$('#notifyPanel'); if(nBtn){ nBtn.addEventListener('click', async ()=>{ await loadAnnouncements(true); openNotifyPanel(); }); } if(nClose) nClose.addEventListener('click', closeNotifyPanel); if(nPanel){ nPanel.addEventListener('click',(e)=>{ if(e.target&&e.target.id==='notifyPanel') closeNotifyPanel(); }); } loadAnnouncements(false); if(!annBadgeTimer) annBadgeTimer=setInterval(()=>loadAnnouncements(false), ANN_BADGE_INTERVAL_MS);
  // Announcement modal close
  const aClose=$('#annClose'); const aModal=$('#annModal'); if(aClose) aClose.addEventListener('click', closeAnnModal); if(aModal){ aModal.addEventListener('click',(e)=>{ if(e.target&&e.target.id==='annModal') closeAnnModal(); }); }
  // ESC shortcuts for panels
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') { closeAnnModal(); closeNotifyPanel(); }
  });
}

document.addEventListener('DOMContentLoaded', init);
