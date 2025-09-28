function $(s){return document.querySelector(s);} function el(t,a={},...c){const e=document.createElement(t);Object.entries(a).forEach(([k,v])=>{if(k==='class')e.className=v;else if(k==='html')e.innerHTML=v;else e.setAttribute(k,v);});c.forEach(x=>e.appendChild(x));return e;}
async function j(url,opt){ const r=await fetch(url,{ credentials:'same-origin', ...opt}); if(!r.ok)throw new Error(`HTTP ${r.status}`); return r.json(); }

// Tabs
function bindTabs(){ const tabs=document.querySelectorAll('.tab'); tabs.forEach(b=>b.addEventListener('click',()=>{ tabs.forEach(x=>x.classList.remove('active')); b.classList.add('active'); const id=b.getAttribute('data-tab'); document.querySelectorAll('.tab-pane').forEach(p=>p.hidden=true); $('#'+id).hidden=false; })); }

// Auth
async function checkAuth(){ const d=await j('/api/me'); return !!d.authenticated; }
async function login(u,p){ return j('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); }
async function logout(){ return j('/api/logout',{method:'POST'}); }

// Announcements
async function loadAnns(){ const ul=$('#annList'); ul.innerHTML='<li class="muted">Yükleniyor…</li>'; try{ const d=await j('/api/announcements'); const items=d.items||[]; if(!items.length){ ul.innerHTML='<li class="muted">Duyuru yok</li>'; return; } ul.innerHTML=''; items.forEach(a=>{ const li=el('li'); const row=el('div',{class:'ann-row'}); const txt=el('span',{class:'ann-text'}); txt.textContent=`${new Date(a.ts).toLocaleString()} — ${a.message}`; const del=el('button',{class:'danger thin'}); del.textContent='Sil'; del.title='Duyuruyu sil'; del.addEventListener('click', async()=>{ if(!confirm('Duyuru silinsin mi?')) return; try{ const res=await fetch(`/api/admin/announcements/${encodeURIComponent(a.id)}`,{ method:'DELETE', credentials:'same-origin' }); if(!res.ok){ alert('Silme başarısız: HTTP '+res.status); return; } await loadAnns(); }catch(err){ alert('Silme hatası: '+err.message); } }); row.appendChild(txt); row.appendChild(del); li.appendChild(row); ul.appendChild(li); }); }catch(e){ ul.innerHTML=`<li class="error">${e.message}</li>`; } }
async function sendAnn(msg){ return j('/api/admin/announcements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg})}); }

// Images
async function loadImages(){ const wrap=$('#imageList'); wrap.innerHTML='<div class="muted">Yükleniyor…</div>'; try{ const d=await j('/api/images'); const list=d.images||[]; if(!list.length){ wrap.innerHTML='<div class="muted">Görsel yok</div>'; return; } wrap.innerHTML=''; list.forEach(img=>{ const card=el('div',{class:'img-card'}); const th=el('img',{src:img.url,alt:img.name}); const name=el('div',{class:'img-name'}); name.textContent=img.name; const actions=el('div',{class:'img-actions'}); const del=el('button',{class:'danger thin'}); del.textContent='Görseli Sil'; del.addEventListener('click',async()=>{ if(!confirm('Görsel silinsin mi?'))return; try{ await fetch(`/api/admin/images/${encodeURIComponent(img.name)}`,{method:'DELETE'}); await loadImages(); await loadAnns(); }catch(err){ alert('Hata: '+err.message); } }); card.appendChild(th); card.appendChild(name); actions.appendChild(del); card.appendChild(actions); wrap.appendChild(card); }); }catch(e){ wrap.innerHTML=`<div class="error">${e.message}</div>`; } }
async function uploadImages(files){ const fd=new FormData(); for(const f of files) fd.append('images',f); return j('/api/admin/upload',{method:'POST',body:fd}); }

// Scenario
async function loadMd(){ const ta=$('#mdEditor'); const st=$('#mdStatus'); try{ const d=await j('/api/admin/scenario-md'); ta.value=d.content||''; }catch(e){ st.textContent='Okuma hatası: '+e.message; st.className='status error'; } }
async function saveMd(text){ return j('/api/admin/scenario-md',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text})}); }

function bindForms(){
  // login
  const loginForm=$('#loginForm'); const loginSt=$('#loginStatus'); loginForm.addEventListener('submit',async(e)=>{ e.preventDefault(); loginSt.textContent='Giriş yapılıyor…'; loginSt.className='status info'; try{ const u=$('#username').value.trim(); const p=$('#password').value; await login(u,p); loginSt.textContent='Başarılı'; loginSt.className='status ok'; await initAuthed(); }catch(err){ loginSt.textContent='Hatalı kimlik'; loginSt.className='status error'; }});
  // logout
  $('#logoutBtn').addEventListener('click',async()=>{ await logout(); location.reload(); });
  // announce
  const aForm=$('#announceForm'); const aInput=$('#announceInput'); const aSt=$('#announceStatus'); aForm.addEventListener('submit',async(e)=>{ e.preventDefault(); if(!aInput.value.trim())return; aSt.textContent='Gönderiliyor…'; aSt.className='status info'; try{ await sendAnn(aInput.value.trim()); aSt.textContent='Gönderildi'; aSt.className='status ok'; aInput.value=''; await loadAnns(); setTimeout(()=>{aSt.textContent=''; aSt.className='status';},1500);}catch(err){ aSt.textContent='Hata: '+err.message; aSt.className='status error'; }});
  // upload
  const uForm=$('#uploadForm'); const uInput=$('#fileInput'); const uSt=$('#uploadStatus'); uForm.addEventListener('submit',async(e)=>{ e.preventDefault(); if(!uInput.files||!uInput.files.length){ uSt.textContent='Dosya seçiniz'; uSt.className='status warn'; return; } uSt.textContent='Yükleniyor…'; uSt.className='status info'; try{ await uploadImages(uInput.files); uInput.value=''; uSt.textContent='Yüklendi'; uSt.className='status ok'; await loadImages(); await loadAnns(); setTimeout(()=>{uSt.textContent=''; uSt.className='status';},1500);}catch(err){ uSt.textContent='Hata: '+err.message; uSt.className='status error'; }});
  // scenario
  $('#saveMd').addEventListener('click', async()=>{ const st=$('#mdStatus'); st.textContent='Kaydediliyor…'; st.className='status info'; try{ await saveMd($('#mdEditor').value); st.textContent='Kaydedildi'; st.className='status ok'; await loadAnns(); setTimeout(()=>{st.textContent=''; st.className='status';},1500);}catch(err){ st.textContent='Hata: '+err.message; st.className='status error'; } });
}

async function initAuthed(){ $('#loginSection').hidden=true; $('#panelSection').hidden=false; bindTabs(); await loadAnns(); await loadImages(); await loadMd(); $('#year').textContent=new Date().getFullYear(); }

async function init(){ try{ if(await checkAuth()) await initAuthed(); else { $('#loginSection').hidden=false; $('#panelSection').hidden=true; } } catch(_) { $('#loginSection').hidden=false; } bindForms(); }

document.addEventListener('DOMContentLoaded', init);
