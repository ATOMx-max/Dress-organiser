// Scripts for favourites page (extracted from inline <script>)

// dynamic API base (works on localhost + deployed)
    const API_BASE = (() => {
      const o = window.location.origin;
      return (o.includes('localhost') || o.includes('127.0.0.1')) ? o + '/api' : o + '/api';
    })();

    // DOM references
    const grid = document.getElementById('grid');
    const statsEl = document.getElementById('stats');
    const modal = document.getElementById('modal');
    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const modalMeta = document.getElementById('modalMeta');
    const modalUploaded = document.getElementById('modalUploaded');
    const modalToggleFav = document.getElementById('modalToggleFav');
    const modalEdit = document.getElementById('modalEdit');
    const modalDelete = document.getElementById('modalDelete');
    const modalClose = document.getElementById('modalClose');

    const editPanel = document.getElementById('editPanel');
    const editName = document.getElementById('editName');
    const editSection = document.getElementById('editSection');
    const editCategory = document.getElementById('editCategory');
    const editSave = document.getElementById('editSave');
    const editCancel = document.getElementById('editCancel');

    const btnRefresh = document.getElementById('btn-refresh');

    // state
    let favourites = [];
    let sections = [];
    let currentId = null;      // for modal
    let editingId = null;      // for edit panel

    // helpers
    function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function fmtDate(d){ try { return new Date(d).toLocaleString(); } catch(e){return '-';} }

    // skeleton loader
    function renderSkeleton(count=6){
      grid.innerHTML = '';
      for(let i=0;i<count;i++){
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
          <div class="thumb"><div style="width:100%;height:100%;background:linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.03));"></div></div>
          <div class="meta"><div style="height:12px;width:60%;background:linear-gradient(90deg,rgba(255,255,255,0.02),rgba(255,255,255,0.03));border-radius:6px"></div>
          <div style="height:10px;width:40%;background:linear-gradient(90deg,rgba(255,255,255,0.02),rgba(255,255,255,0.03));border-radius:6px;margin-top:8px"></div></div>
          <div class="actions"></div>
        `;
        grid.appendChild(el);
      }
    }

    // load sections & favourites
    async function loadData(){
      renderSkeleton();
      statsEl.textContent = 'Loading…';
      try {
        const [fRes, sRes] = await Promise.all([
          fetch(API_BASE + '/favourites', { credentials:'include' }),
          fetch(API_BASE + '/sections', { credentials:'include' })
        ]);

        if (fRes.status === 401) {
          // not authorized — redirect to login
          localStorage.removeItem('loggedInUser');
          window.location.href = 'login.html';
          return;
        }

        favourites = await fRes.json();
        sections = sRes.ok ? await sRes.json() : [];

        statsEl.textContent = `${favourites.length} favourite(s)`;
        renderGrid();
      } catch (err) {
        console.error('Load error', err);
        grid.innerHTML = `<div class="empty">Failed to load favourites — check your network or sign in again.</div>`;
        statsEl.textContent = 'Error';
      }
    }

    // render gallery
    function renderGrid(){
      grid.innerHTML = '';
      if (!favourites || favourites.length === 0){
        grid.innerHTML = `<div class="empty">No favourite dresses yet ✨<br>Mark dresses as favourite from other pages to see them here.</div>`;
        return;
      }

      favourites.forEach((d, idx)=>{
        const card = document.createElement('article');
        card.className = 'card';
        card.setAttribute('data-id', d._id);
        // build inner
        card.innerHTML = `
          <div class="thumb" role="button" aria-label="Open preview of ${esc(d.name||'Dress')}">
            <span class="badge">⭐ Fav</span>
            <img loading="lazy" src="${esc(d.imageUrl)}" alt="${esc(d.name||'Dress')}" />
          </div>
          <div class="meta">
            <h3>${esc(d.name || 'Untitled')}</h3>
            <p>${esc(d.section || '—')} → ${esc(d.category || '—')}</p>
          </div>
          <div class="actions">
            <button class="small-btn" data-action="preview" data-id="${d._id}">Preview</button>
            <button class="small-btn" data-action="edit" data-id="${d._id}">Edit</button>
            <button class="small-btn" data-action="unfav" data-id="${d._id}">💔 Unfav</button>
            <button class="small-btn warn" data-action="delete" data-id="${d._id}">Delete</button>
          </div>
        `;
        grid.appendChild(card);

        // staggered entrance animation
        setTimeout(()=> card.classList.add('enter'), 70 * idx);

      });

      // attach listeners (delegation)
      grid.querySelectorAll('[data-action]').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          const id = btn.getAttribute('data-id');
          const action = btn.getAttribute('data-action');
          if (action === 'preview') openPreview(id);
          if (action === 'edit') openEdit(id);
          if (action === 'unfav') toggleFavourite(id, { optimistic:true });
          if (action === 'delete') deleteDressConfirmed(id);
        });
      });

      // clicking thumbnail opens preview
      grid.querySelectorAll('.thumb').forEach(t=>{
        t.addEventListener('click', (e)=>{
          const card = t.closest('.card');
          const id = card.getAttribute('data-id');
          openPreview(id);
        });
      });
    }

    // Preview modal
    function openPreview(id){
      const d = favourites.find(x => x._id === id);
      if (!d) return;
      currentId = id;

      // set modal content
      modalImage.src = d.imageUrl || '';
      modalImage.alt = d.name || 'Dress preview';
      modalTitle.textContent = d.name || 'Untitled';
      modalMeta.textContent = `${d.section || '—'} → ${d.category || '—'}`;
      modalUploaded.textContent = 'Uploaded: ' + fmtDate(d.createdAt || d.updatedAt || Date.now());

      // set favourite button text
      modalToggleFav.textContent = (d.isFavorite || d.isFav || true) ? '★ Unfavourite' : '☆ Favourite';

      // show modal
      modal.classList.add('active');
      modal.setAttribute('aria-hidden','false');

      // trap focus by focusing close button
      modalClose.focus();
    }

    function closePreview(){
      currentId = null;
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden','true');
      modalImage.src = '';
      modalImage.alt = '';
    }

    // toggle favourite (optimistic updates)
    async function toggleFavourite(id, opts={}) {
      try {
        const item = favourites.find(x=>x._id===id);
        if (!item) return;
        // Optimistic change: remove from favourites list if unfavouriting
        const wasFav = !!item.isFavorite;
        item.isFavorite = !wasFav;

        if (opts.optimistic && !item.isFavorite) {
          favourites = favourites.filter(x => x._id !== id);
          renderGrid();
        } else {
          renderGrid();
        }

        // call API
        const res = await fetch(API_BASE + '/dresses/' + id + '/favourite', {
          method: 'PUT', credentials:'include'
        });
        if (!res.ok) {
          // revert on failure
          if (opts.optimistic) {
            await loadData();
          } else {
            alert('Failed to update favourite');
            await loadData();
          }
          return;
        }
        const data = await res.json().catch(()=>({}));
        // sync local
        if (data && typeof data.isFavorite !== 'undefined') {
          if (!data.isFavorite) {
            favourites = favourites.filter(x => x._id !== id);
            renderGrid();
          } else {
            const idx = favourites.findIndex(x=>x._id===id);
            if (idx === -1 && data.isFavorite) {
              await loadData();
            } else if (idx !== -1) {
              favourites[idx].isFavorite = data.isFavorite;
              renderGrid();
            }
          }
        } else {
          await loadData();
        }
      } catch (err) {
        console.error('toggle fav err', err);
        if (opts.optimistic) await loadData();
      }
    }

    // delete with confirm
    async function deleteDressConfirmed(id){
      if (!confirm('Permanently delete this dress? This cannot be undone.')) return;
      try {
        const res = await fetch(API_BASE + '/dresses/' + id, { method: 'DELETE', credentials:'include' });
        if (!res.ok) {
          const body = await res.json().catch(()=>({}));
          alert(body.message || 'Delete failed');
          return;
        }
        favourites = favourites.filter(d => d._id !== id);
        renderGrid();
        // if modal open for this item, close it
        if (currentId === id) closePreview();
      } catch (err) {
        console.error('delete err', err);
        alert('Delete failed (network)');
      }
    }

    // modal actions
    modalClose.addEventListener('click', closePreview);
    modal.addEventListener('click', e => { if (e.target === modal) closePreview(); });
    modalToggleFav.addEventListener('click', async ()=>{
      if (!currentId) return;
      await toggleFavourite(currentId, { optimistic:true });
      closePreview();
    });
    modalDelete.addEventListener('click', async ()=>{
      if (!currentId) return;
      await deleteDressConfirmed(currentId);
      closePreview();
    });
    modalEdit.addEventListener('click', ()=>{
      if (!currentId) return;
      openEdit(currentId);
      closePreview();
    });

    // Edit flow
    function openEdit(id){
      const d = favourites.find(x => x._id === id);
      if (!d) return alert('Dress not found');
      editingId = id;

      // populate fields
      editName.value = d.name || '';
      fillSectionsSelect();
      // set selected section & categories
      if (d.section) editSection.value = d.section;
      fillCategoriesFor(d.section || (sections[0] && sections[0].name));
      if (d.category) editCategory.value = d.category;

      // reveal panel
      editPanel.classList.add('show');
      editPanel.setAttribute('aria-hidden','false');
      // focus
      setTimeout(()=> editName.focus(), 120);
    }

    function closeEdit(){
      editingId = null;
      editPanel.classList.remove('show');
      editPanel.setAttribute('aria-hidden','true');
    }

    editCancel.addEventListener('click', (e)=>{
      e.preventDefault();
      closeEdit();
    });

    editSave.addEventListener('click', async (e)=>{
      e.preventDefault();
      if (!editingId) return;
      const payload = {
        name: editName.value.trim(),
        section: editSection.value,
        category: editCategory.value
      };
      if (!payload.name) return alert('Name required');
      try {
        editSave.disabled = true;
        editSave.textContent = 'Saving…';
        const res = await fetch(API_BASE + '/dresses/' + editingId, {
          method: 'PUT',
          headers: {'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || 'Save failed');
          return;
        }
        // update local copy
        favourites = favourites.map(d => d._id === editingId ? ({...d, ...payload}) : d);
        renderGrid();
        closeEdit();
      } catch (err) {
        console.error('save err', err);
        alert('Save failed');
      } finally {
        editSave.disabled = false; editSave.textContent = 'Save';
      }
    });

    // fill sections & categories
    function fillSectionsSelect(){
      editSection.innerHTML = '';
      if (!sections || sections.length === 0){
        const opt = document.createElement('option'); opt.value=''; opt.textContent='— No sections —';
        editSection.appendChild(opt);
        return;
      }
      sections.forEach(s=>{
        const opt = document.createElement('option'); opt.value = s.name; opt.textContent = s.name;
        editSection.appendChild(opt);
      });
    }
    function fillCategoriesFor(sectionName){
      editCategory.innerHTML = '';
      const sec = sections.find(s => s.name === sectionName);
      if (!sec || !sec.categories || sec.categories.length === 0){
        const opt=document.createElement('option'); opt.value=''; opt.textContent='— No categories —'; editCategory.appendChild(opt); return;
      }
      sec.categories.forEach(c=>{
        const opt=document.createElement('option'); opt.value=c; opt.textContent=c; editCategory.appendChild(opt);
      });
    }
    editSection.addEventListener('change', ()=> fillCategoriesFor(editSection.value));

    // top actions
    btnRefresh.addEventListener('click', ()=> loadData());

    // keyboard shortcuts
    window.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape') {
        if (modal.classList.contains('active')) closePreview();
        if (editPanel.classList.contains('show')) closeEdit();
      }
    });

    // initial
    loadData();