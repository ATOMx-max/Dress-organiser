// Extracted script for manage.html

/*****************************************************************
     * Manage Sections & Categories - JS (with pop/bounce animations)
     *****************************************************************/
    const API_URL = (window.location.origin.includes('localhost') || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:8080/api'
      : 'https://dress-organiser.onrender.com/api';

    let SECTIONS = []; // array of { name, categories:[] }
    let OFFLINE_MODE = false;
    const LOCAL_KEY = 'do_sections_cache_v1';

    const DEFAULT_SECTIONS = [
      { name: 'Men', categories: ['Shirts', 'Trousers', 'Jackets'] },
      { name: 'Women', categories: ['Dresses', 'Tops', 'Skirts'] },
      { name: 'Accessories', categories: ['Belts', 'Hats'] }
    ];

    // Elements
    const sectionsTags = document.getElementById('sectionsTags');
    const categoriesTags = document.getElementById('categoriesTags');
    const sectionSelect = document.getElementById('sectionSelect');
    const toastWrap = document.getElementById('toastWrap');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalConfirm = document.getElementById('modalConfirm');
    const modalCancel = document.getElementById('modalCancel');

    // Toast helper
    function showToast(msg, type='default', ms=3000){
      const t = document.createElement('div');
      t.className = 'toast fade-in ' + (type==='success' ? 'success' : type==='error' ? 'error' : '');
      t.textContent = msg;
      toastWrap.appendChild(t);
      setTimeout(()=>{ t.style.opacity = 0; t.style.transform = 'translateX(10px)'; }, Math.max(600, ms - 350));
      setTimeout(()=>{ if(t.parentNode) t.parentNode.removeChild(t); }, ms);
    }

    // Modal helper (with simple show/hide classes)
    function showModal(title, message){
      modalTitle.textContent = title; modalMessage.textContent = message;
      modalBackdrop.style.display = 'flex';
      const modal = modalBackdrop.querySelector('.modal'); modal.classList.remove('hide'); modal.classList.add('show');
      return new Promise(resolve => {
        function cleanup(){ modal.classList.remove('show'); modal.classList.add('hide'); setTimeout(()=> modalBackdrop.style.display='none', 200); modalConfirm.removeEventListener('click', onYes); modalCancel.removeEventListener('click', onNo); }
        function onYes(){ cleanup(); resolve(true); }
        function onNo(){ cleanup(); resolve(false); }
        modalConfirm.addEventListener('click', onYes);
        modalCancel.addEventListener('click', onNo);
      });
    }

    // Local persistence
    function saveSectionsToLocal(){
      try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(SECTIONS)); }
      catch(e){ console.warn('Failed saving to localStorage', e); }
    }
    function loadSectionsFromLocal(){
      try{
        const raw = localStorage.getItem(LOCAL_KEY);
        if(!raw) return null;
        const parsed = JSON.parse(raw);
        if(!Array.isArray(parsed)) return null;
        return parsed;
      } catch(e){ console.warn('Failed reading local cache', e); return null; }
    }

    // API fetch wrapper with graceful fallback
    async function apiFetch(path, opts = {}){
      if(!path.startsWith('/')) path = '/' + path;
      try{
        const res = await fetch(API_URL + path, Object.assign({ credentials: 'include' }, opts));
        if(res.status === 401){ localStorage.removeItem('loggedInUser'); window.location.href = 'login.html'; throw new Error('Unauthorized'); }
        const body = await res.json().catch(()=>({}));
        if(!res.ok){ const msg = body && body.message ? body.message : `Request failed (${res.status})`; throw new Error(msg); }
        return body;
      } catch(err){
        console.error('apiFetch error', err);
        // network/CORS failures -> switch to offline fallback
        if(err instanceof TypeError || /failed to fetch/i.test(String(err))){
          if(!OFFLINE_MODE){ OFFLINE_MODE = true; showToast('API unreachable — switched to offline mode', 'error', 4000); }
          const cached = loadSectionsFromLocal() || DEFAULT_SECTIONS.slice();
          return cached;
        }
        throw err;
      }
    }

    // UI helpers
    function populateSectionSelect(sections){
      sectionSelect.innerHTML = '<option value="">Select Section</option>';
      sections.forEach(s=>{ const opt = document.createElement('option'); opt.value = s.name; opt.textContent = s.name; sectionSelect.appendChild(opt); });
    }

    function animatePop(el){
      el.classList.remove('pop');
      // force reflow to restart animation
      void el.offsetWidth;
      el.classList.add('pop');
      // remove pop class after animation
      el.addEventListener('animationend', ()=> el.classList.remove('pop'), { once:true });
    }

    function createSectionTag(sec){
      const d = document.createElement('div'); d.className = 'tag'; d.draggable = true; d.dataset.name = sec.name;

      // tag content (name + meta) - this is the truncating part
      const content = document.createElement('div'); content.className = 'tag-content';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = sec.name; content.appendChild(name);
      const meta = document.createElement('div'); meta.className = 'meta small'; meta.textContent = (sec.categories?.length || 0) + ' categories'; content.appendChild(meta);
      d.appendChild(content);

      // actions - always visible
      const actions = document.createElement('div'); actions.className = 'actions';
      const editBtn = document.createElement('button'); editBtn.className = 'icon-btn'; editBtn.title = 'Rename'; editBtn.innerHTML = '✎';
      editBtn.onclick = (e)=>{ e.stopPropagation(); startEditSection(d, sec.name); };

      const delBtn = document.createElement('button'); delBtn.className = 'icon-btn'; delBtn.title = 'Delete'; delBtn.innerHTML = '✕';
      delBtn.onclick = async (e)=>{ e.stopPropagation(); const ok = await showModal('Delete section', `Delete \"${sec.name}\" and all related dresses?`); if(!ok) return;
        try{
          // animate removal visually first
          d.classList.add('removing');
          setTimeout(async ()=>{
            if(OFFLINE_MODE){
              SECTIONS = SECTIONS.filter(s => s.name !== sec.name);
              saveSectionsToLocal();
              showToast('Section deleted (offline)','success');
              renderSections(SECTIONS); populateSectionSelect(SECTIONS);
              categoriesTags.innerHTML = ''; document.getElementById('categoriesEmpty').style.display='none';
            } else {
              const res = await apiFetch(`/sections/${encodeURIComponent(sec.name)}`, { method: 'DELETE' });
              showToast(res.message || 'Deleted','success');
              await loadSections();
              categoriesTags.innerHTML = ''; document.getElementById('categoriesEmpty').style.display='none';
            }
          }, 220);
        } catch(err){ showToast(err.message || 'Delete failed','error'); }
      };

      actions.appendChild(editBtn); actions.appendChild(delBtn); d.appendChild(actions);

      d.addEventListener('click', ()=>{ sectionSelect.value = sec.name; loadCategoriesFor(sec.name); highlightSelectedSection(sec.name); });
      d.addEventListener('dragstart', (e)=>{ d.classList.add('dragging'); e.dataTransfer.setData('text/section', sec.name); });
      d.addEventListener('dragend', ()=>d.classList.remove('dragging'));

      // pop animation on create/update
      setTimeout(()=> animatePop(d), 20);

      return d;
    }

    function renderSections(list){
      sectionsTags.innerHTML = '';
      if(!list || !list.length){ document.getElementById('sectionsEmpty').style.display = 'block'; return; }
      document.getElementById('sectionsEmpty').style.display = 'none';
      list.forEach(sec => sectionsTags.appendChild(createSectionTag(sec)));
    }

    function highlightSelectedSection(name){
      Array.from(sectionsTags.children).forEach(ch=>{ ch.style.borderColor = ch.dataset.name === name ? 'rgba(192,132,252,0.55)' : 'rgba(255,255,255,0.04)'; });
    }

    function createCategoryTag(sectionName, cat){
      const d = document.createElement('div'); d.className = 'tag'; d.dataset.cat = cat; d.dataset.section = sectionName;

      const content = document.createElement('div'); content.className = 'tag-content';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = cat; content.appendChild(name);
      // no meta for categories currently, but keep the structure
      d.appendChild(content);

      const actions = document.createElement('div'); actions.className = 'actions';
      const editBtn = document.createElement('button'); editBtn.className = 'icon-btn'; editBtn.title = 'Rename'; editBtn.innerHTML = '✎';
      editBtn.onclick = (e)=>{ e.stopPropagation(); startEditCategory(sectionName, cat, d); };
      const delBtn = document.createElement('button'); delBtn.className = 'icon-btn'; delBtn.title = 'Delete'; delBtn.innerHTML = '✕';
      delBtn.onclick = async (e)=>{ e.stopPropagation(); const ok = await showModal('Delete category', `Delete \"${cat}\" from \"${sectionName}\"?`); if(!ok) return;
        try{
          d.classList.add('removing');
          setTimeout(async ()=>{
            if(OFFLINE_MODE){
              const sec = SECTIONS.find(s=>s.name===sectionName); if(sec){ sec.categories = sec.categories.filter(c=>c!==cat); saveSectionsToLocal(); showToast('Category deleted (offline)','success'); loadCategoriesFor(sectionName); }
            } else {
              const res = await apiFetch(`/categories/${encodeURIComponent(sectionName)}/${encodeURIComponent(cat)}`, { method: 'DELETE' });
              showToast(res.message || 'Deleted','success'); loadCategoriesFor(sectionName);
            }
          }, 220);
        } catch(err){ showToast(err.message || 'Delete failed','error'); }
      };
      actions.appendChild(editBtn); actions.appendChild(delBtn); d.appendChild(actions);

      setTimeout(()=> animatePop(d), 20);
      return d;
    }

    function renderCategoriesFor(sec){
      categoriesTags.innerHTML = '';
      if(!sec || !sec.categories || !sec.categories.length){ document.getElementById('categoriesEmpty').style.display = 'block'; return; }
      document.getElementById('categoriesEmpty').style.display = 'none';
      sec.categories.forEach(cat => categoriesTags.appendChild(createCategoryTag(sec.name, cat)));
    }

    async function loadCategoriesFor(sectionName){
      try{
        const sec = SECTIONS.find(s=>s.name===sectionName);
        if(!sec) await loadSections();
        const fresh = SECTIONS.find(s=>s.name===sectionName);
        renderCategoriesFor(fresh || { name: sectionName, categories: [] });
      } catch(err){ showToast('Failed to load categories','error'); }
    }

    // Load sections from server, or fallback to local/default
    async function loadSections(){
      try{
        document.getElementById('sectionsEmpty').style.display = 'none';
        const data = await apiFetch('/sections');
        SECTIONS = Array.isArray(data) ? data : (data.sections || data);
        if(!OFFLINE_MODE) saveSectionsToLocal();
        renderSections(SECTIONS);
        populateSectionSelect(SECTIONS);
      } catch(err){
        try{
          if(!SECTIONS || !SECTIONS.length){
            const local = loadSectionsFromLocal();
            SECTIONS = local || DEFAULT_SECTIONS.slice();
          }
          renderSections(SECTIONS);
          populateSectionSelect(SECTIONS);
          showToast('Using local data','default',2000);
        } catch(e){ showToast('Failed to load sections','error'); console.error(e); }
      }
    }

    // Add section
    async function addSection(){
      const input = document.getElementById('sectionInput');
      const name = input.value.trim();
      if(!name) return showToast('Enter a section name','error');
      disableButton('addSectionBtn', true);
      try{
        if(SECTIONS.some(s=>s.name.toLowerCase()===name.toLowerCase())){ showToast('Section already exists','error'); disableButton('addSectionBtn', false); return; }
        if(OFFLINE_MODE){
          SECTIONS.push({ name, categories: [] });
          saveSectionsToLocal();
          showToast('Section added (offline)','success');
          input.value=''; input.focus();
          renderSections(SECTIONS); populateSectionSelect(SECTIONS);
        } else {
          const res = await apiFetch('/sections', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name })});
          showToast(res.message || 'Section added','success');
          input.value=''; input.focus();
          await loadSections();
        }
      } catch(err){ showToast(err.message || 'Add failed','error'); }
      disableButton('addSectionBtn', false);
    }

    // Add category
    async function addCategory(){
      const sectionName = sectionSelect.value;
      const input = document.getElementById('categoryInput');
      const category = input.value.trim();
      if(!sectionName) return showToast('Select a section first','error');
      if(!category) return showToast('Enter a category name','error');
      disableButton('addCategoryBtn', true);
      try{
        const sec = SECTIONS.find(s=>s.name===sectionName);
        if(sec && sec.categories && sec.categories.some(c=>c.toLowerCase()===category.toLowerCase())){ showToast('Category already exists in this section','error'); disableButton('addCategoryBtn', false); return; }
        if(OFFLINE_MODE){
          if(!sec){ SECTIONS.push({ name: sectionName, categories: [category] }); } else { sec.categories.push(category); }
          saveSectionsToLocal();
          showToast('Category added (offline)','success');
          input.value=''; input.focus();
          renderSections(SECTIONS); populateSectionSelect(SECTIONS); loadCategoriesFor(sectionName);
        } else {
          const res = await apiFetch('/categories', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sectionName, category })});
          showToast(res.message || 'Category added','success');
          input.value=''; input.focus();
          await loadSections(); loadCategoriesFor(sectionName);
        }
      } catch(err){ showToast(err.message || 'Add failed','error'); }
      disableButton('addCategoryBtn', false);
    }

    function disableButton(id, val){ const b = document.getElementById(id); if(b) b.disabled = !!val; }

    async function resetDefaults(){
      const ok = await showModal('Reset to defaults', 'This will reset sections & categories to defaults. Continue?');
      if(!ok) return;
      try{
        if(OFFLINE_MODE){
          SECTIONS = DEFAULT_SECTIONS.slice();
          saveSectionsToLocal();
          renderSections(SECTIONS); populateSectionSelect(SECTIONS);
          showToast('Reset locally','success');
        } else {
          const res = await apiFetch('/reset-defaults', { method: 'POST' });
          showToast(res.message || 'Reset','success');
          await loadSections();
        }
      } catch(err){ showToast(err.message || 'Reset failed','error'); }
    }

    // Inline rename section
    function startEditSection(elem, oldName){
      if(elem.classList.contains('editing')) return;
      elem.classList.add('editing'); elem.innerHTML='';
      const inp = document.createElement('input'); inp.className='edit-input'; inp.value = oldName; inp.style.minWidth='120px';
      const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent='Save';
      const cancelBtn = document.createElement('button'); cancelBtn.className='btn'; cancelBtn.textContent='Cancel';
      elem.appendChild(inp); elem.appendChild(saveBtn); elem.appendChild(cancelBtn);
      inp.focus(); inp.select();
      cancelBtn.onclick = ()=>{ elem.classList.remove('editing'); renderSections(SECTIONS); };
      saveBtn.onclick = async ()=>{
        const newName = inp.value.trim(); if(!newName) return showToast('Name cannot be empty','error');
        if(newName === oldName){ elem.classList.remove('editing'); renderSections(SECTIONS); return; }
        try{
          if(OFFLINE_MODE){
            const sec = SECTIONS.find(s=>s.name === oldName); if(sec) sec.name = newName;
            saveSectionsToLocal(); showToast('Renamed (offline)','success'); renderSections(SECTIONS); populateSectionSelect(SECTIONS);
          } else {
            const res = await apiFetch('/sections/rename', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ oldName, newName })});
            showToast(res.message || 'Renamed','success'); await loadSections();
          }
        } catch(err){ showToast(err.message || 'Rename failed','error'); renderSections(SECTIONS); }
      };
    }

    // Inline rename category
    function startEditCategory(sectionName, oldCat, tagElem){
      if(tagElem.classList.contains('editing')) return;
      tagElem.classList.add('editing'); tagElem.innerHTML='';
      const inp = document.createElement('input'); inp.className='edit-input'; inp.value = oldCat; inp.style.minWidth='120px';
      const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent='Save';
      const cancelBtn = document.createElement('button'); cancelBtn.className='btn'; cancelBtn.textContent='Cancel';
      tagElem.appendChild(inp); tagElem.appendChild(saveBtn); tagElem.appendChild(cancelBtn);
      inp.focus(); inp.select();
      cancelBtn.onclick = ()=>{ tagElem.classList.remove('editing'); loadCategoriesFor(sectionName); };
      saveBtn.onclick = async ()=>{
        const newCat = inp.value.trim(); if(!newCat) return showToast('Name cannot be empty','error');
        if(newCat === oldCat){ tagElem.classList.remove('editing'); loadCategoriesFor(sectionName); return; }
        try{
          if(OFFLINE_MODE){
            const sec = SECTIONS.find(s=>s.name === sectionName);
            if(sec){ const idx = sec.categories.indexOf(oldCat); if(idx >= 0){ sec.categories[idx] = newCat; saveSectionsToLocal(); showToast('Renamed (offline)','success'); loadCategoriesFor(sectionName); } }
          } else {
            const res = await apiFetch('/categories/rename', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sectionName, oldCat, newCat })});
            showToast(res.message || 'Renamed','success'); await loadSections(); loadCategoriesFor(sectionName);
          }
        } catch(err){ showToast(err.message || 'Rename failed','error'); loadCategoriesFor(sectionName); }
      };
    }

    // Search
    let searchTimer = null;
    document.getElementById('searchInput').addEventListener('input', (e)=>{ const q = e.target.value.trim().toLowerCase(); clearTimeout(searchTimer); searchTimer = setTimeout(()=> applySearch(q), 220); });
    function applySearch(q){
      if(!q){ renderSections(SECTIONS); populateSectionSelect(SECTIONS); const sel = sectionSelect.value; if(sel) loadCategoriesFor(sel); return; }
      const filtered = SECTIONS.map(s=>({ ...s, categories: (s.categories||[]).filter(c=>c.toLowerCase().includes(q)) })).filter(s=>s.name.toLowerCase().includes(q) || (s.categories && s.categories.length));
      renderSections(filtered); populateSectionSelect(filtered); categoriesTags.innerHTML=''; document.getElementById('categoriesEmpty').style.display='block';
    }

    // Import / Export
    document.getElementById('exportBtn').addEventListener('click', ()=>{ const data = JSON.stringify(SECTIONS, null, 2); const blob = new Blob([data], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sections-categories.json'; a.click(); URL.revokeObjectURL(url); });

    document.getElementById('importBtn').addEventListener('click', ()=>{
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json';
      input.onchange = async (e)=>{
        const file = e.target.files[0]; if(!file) return;
        try{
          const txt = await file.text();
          const parsed = JSON.parse(txt);
          if(!Array.isArray(parsed)) return showToast('Invalid JSON format','error');

          if(OFFLINE_MODE){
            SECTIONS = parsed; saveSectionsToLocal(); renderSections(SECTIONS); populateSectionSelect(SECTIONS); showToast('Imported locally','success');
          } else {
            try{
              const res = await apiFetch('/sections/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sections: parsed })});
              showToast(res.message || 'Imported','success'); await loadSections();
            } catch(err){
              SECTIONS = parsed; saveSectionsToLocal(); renderSections(SECTIONS); populateSectionSelect(SECTIONS); showToast('Imported locally (server import failed)','success');
            }
          }
        } catch(err){ showToast('Failed to import: ' + (err && err.message ? err.message : String(err)),'error'); }
      };
      input.click();
    });

    // Hooks
    document.getElementById('resetBtn').addEventListener('click', resetDefaults);
    document.getElementById('addSectionBtn').addEventListener('click', addSection);
    document.getElementById('addCategoryBtn').addEventListener('click', addCategory);
    sectionSelect.addEventListener('change', (e)=>{ const val = e.target.value; if(val) loadCategoriesFor(val); else { categoriesTags.innerHTML=''; document.getElementById('categoriesEmpty').style.display='block'; } });
    document.getElementById('logoutBtn').addEventListener('click', ()=>{ localStorage.removeItem('loggedInUser'); window.location.href='login.html'; });

    // Session check (non-fatal)
    async function checkSession(){
      try{
        const res = await fetch(API_URL + '/me', { credentials: 'include' }).catch(()=>null);
        if(res && res.status === 401){ localStorage.removeItem('loggedInUser'); window.location.href = 'login.html'; return; }
        if(res && res.ok){ const body = await res.json().catch(()=>null); if(body && body.email) document.getElementById('userEmail').textContent = body.email; }
      } catch(e){ console.warn('Session check failed (non-fatal)', e); }
    }

    // Init
    (async function init(){
      await checkSession();
      const cached = loadSectionsFromLocal(); if(cached){ SECTIONS = cached; }
      await loadSections();
      if(!SECTIONS || !SECTIONS.length){ SECTIONS = DEFAULT_SECTIONS.slice(); renderSections(SECTIONS); populateSectionSelect(SECTIONS); saveSectionsToLocal(); }
    })();
