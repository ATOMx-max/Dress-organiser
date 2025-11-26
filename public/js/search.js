// Extracted script for search.html

const API_URL = window.location.origin.includes("localhost")
      ? "http://localhost:8080/api"
      : "https://dress-organiser.onrender.com/api";

    const gallery = document.getElementById("gallery");
    const sectionFilter = document.getElementById("sectionFilter");
    const categoryFilter = document.getElementById("categoryFilter");
    const searchInput = document.getElementById("searchInput");
    const counterBar = document.getElementById("counterBar");
    const suggestionsBox = document.getElementById("suggestions");
    const loader = document.getElementById("loader");
    const previewModal = document.getElementById("previewModal");
    const previewImage = document.getElementById("previewImage");
    const closePreview = document.getElementById("closePreview");
    const skeletons = document.getElementById("skeletons");
    const tagFilter = document.getElementById("tagFilter");
    const sortSelect = document.getElementById("sortSelect");
    const mobileFilterToggle = document.getElementById("mobileFilterToggle");
    const filterBar = document.getElementById("filterBar");

    // Edit modal elements
    const editModal = document.getElementById("editModal");
    const editName = document.getElementById("editName");
    const editSection = document.getElementById("editSection");
    const editCategory = document.getElementById("editCategory");
    const editTags = document.getElementById("editTags");
    const cancelEdit = document.getElementById("cancelEdit");
    const saveEdit = document.getElementById("saveEdit");

    // Toast container
    const toastWrap = document.getElementById("toastWrap");
    const srLive = document.getElementById("srLive");

    let dresses = [];
    let sections = [];
    let tagsSet = new Set();
    let currentEditId = null;

    // Infinite scroll state
    const CHUNK = 20; // items per batch
    let renderedCount = 0;
    let filteredCached = [];

    /* ---------- Helpers: Toast & DOM event ---------- */
    function showToast({ text = "Done", variant = "success", duration = 1600 } = {}) {
      const t = document.createElement("div");
      t.className = `toast ${variant}`;
      t.innerHTML = `<div class="emoji">${variant === 'success' ? '💖' : '💔'}</div><div class="msg">${text}</div>`;
      toastWrap.prepend(t);
      srLive.textContent = text;
      setTimeout(() => { t.style.transform = "translateY(-8px) scale(.98)"; t.style.opacity = "0"; }, duration - 260);
      setTimeout(() => t.remove(), duration + 120);
    }

    function emitFavouriteEvent(detail) { window.dispatchEvent(new CustomEvent("favourite-changed", { detail })); }

    /* ---------- Skeleton helpers ---------- */
    function showSkeletons(count = 6) {
      skeletons.innerHTML = '';
      skeletons.style.display = 'grid';
      for (let i=0;i<count;i++) {
        const div = document.createElement('div');
        div.className = 'skeleton-card';
        div.innerHTML = `<div class="skeleton-anim"></div>`;
        skeletons.appendChild(div);
      }
    }
    function hideSkeletons() { skeletons.style.display = 'none'; skeletons.innerHTML = ''; }

    /* ---------- Data loading & render ---------- */
    async function loadData() {
      showSkeletons(8);
      loader.textContent = "Loading...";

      try {
        const [dRes, sRes] = await Promise.all([
          fetch(`${API_URL}/dresses`, { credentials: "include" }),
          fetch(`${API_URL}/sections`, { credentials: "include" })
        ]);

        if (!dRes.ok) {
          loader.textContent = "Auth failed. Login again.";
          setTimeout(() => location.href = "login.html", 1500);
          return;
        }

        dresses = await dRes.json();
        sections = await sRes.json();

        // make sure tags exist on objects (backwards compat)
        dresses = dresses.map(d => ({ ...d, tags: d.tags || [] }));

        // collect tags
        tagsSet = new Set();
        dresses.forEach(d => (d.tags || []).forEach(t => tagsSet.add(t)));

        renderSections();
        populateTagFilter();

        // initial render with infinite scroll
        renderedCount = 0;
        filteredCached = applyFilters();
        gallery.innerHTML = '';
        hideSkeletons();
        renderMore();

        loader.textContent = '';
      } catch (err) {
        console.error(err);
        hideSkeletons();
        loader.textContent = 'Error loading data';
      }
    }

    function renderSections() {
      sectionFilter.innerHTML = `<option value="">All Sections</option>`;
      editSection.innerHTML = '';
      sections.forEach(sec => {
        const opt = document.createElement("option"); opt.value = sec.name; opt.textContent = sec.name; sectionFilter.appendChild(opt);
        const opt2 = document.createElement("option"); opt2.value = sec.name; opt2.textContent = sec.name; editSection.appendChild(opt2);
      });
      // ensure categories are filled initially
      fillCategoriesForEdit(editSection.value || (sections[0] && sections[0].name));
    }

    function populateTagFilter() {
      tagFilter.innerHTML = `<option value="">All Tags</option>`;
      Array.from(tagsSet).sort().forEach(t => {
        const opt = document.createElement('option'); opt.value = t; opt.textContent = t; tagFilter.appendChild(opt);
      });
    }

    sectionFilter.onchange = () => {
      categoryFilter.innerHTML = `<option value="">All Categories</option>`;
      const selected = sections.find(s => s.name === sectionFilter.value);
      if (selected) {
        selected.categories.forEach(cat => {
          const opt = document.createElement("option"); opt.value = cat; opt.textContent = cat; categoryFilter.appendChild(opt);
        });
      }
      resetAndRender();
    };

    categoryFilter.onchange = () => resetAndRender();
    tagFilter.onchange = () => resetAndRender();
    sortSelect.onchange = () => resetAndRender();

    document.getElementById("clearBtn").onclick = () => {
      sectionFilter.value = "";
      categoryFilter.innerHTML = `<option value="">All Categories</option>`;
      tagFilter.value = "";
      sortSelect.value = "";
      searchInput.value = "";
      suggestionsBox.style.display = "none";
      resetAndRender();
    };

    // Debounce helper
    function debounce(fn, delay=300) {
      let t;
      return function(...args) { clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), delay); };
    }

    searchInput.addEventListener("input", debounce(() => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) { suggestionsBox.style.display = 'none'; resetAndRender(); return; }
      const matches = dresses.filter(d => d.name.toLowerCase().includes(query)).slice(0,6);
      suggestionsBox.innerHTML = '';
      suggestionsBox.style.display = matches.length ? 'block' : 'none';
      matches.forEach(m => {
        const div = document.createElement('div'); div.className='suggestion-item'; div.textContent = m.name; div.onclick = ()=>{ searchInput.value = m.name; suggestionsBox.style.display='none'; resetAndRender(); }; suggestionsBox.appendChild(div);
      });
      resetAndRender();
    }, 240));

    function resetAndRender() {
      renderedCount = 0; gallery.innerHTML = '';
      filteredCached = applyFilters();
      renderMore(true);
    }

    function applyFilters() {
      let list = dresses.slice();
      const sec = sectionFilter.value;
      const cat = categoryFilter.value;
      const search = searchInput.value.trim().toLowerCase();
      const tag = tagFilter.value;

      if (sec) list = list.filter(i => i.section === sec);
      if (cat) list = list.filter(i => i.category === cat);
      if (tag) list = list.filter(i => (i.tags||[]).includes(tag));
      if (search) list = list.filter(i => i.name.toLowerCase().includes(search));

      // Sorting
      const sort = sortSelect.value;
      if (sort === 'name_asc') list.sort((a,b)=> a.name.localeCompare(b.name));
      else if (sort === 'name_desc') list.sort((a,b)=> b.name.localeCompare(a.name));
      else if (sort === 'fav_first') list.sort((a,b)=> (b.isFavorite?1:0) - (a.isFavorite?1:0));
      else if (sort === 'recent') list.sort((a,b)=> {
        const aTime = new Date(a.createdAt || a._id);
        const bTime = new Date(b.createdAt || b._id);
        return bTime - aTime;
      });

      return list;
    }

    // Render a batch for infinite scroll; if fresh=true we scroll to top
    function renderMore(fresh=false) {
      const list = filteredCached;
      if (fresh) window.scrollTo({ top: 0, behavior: 'smooth' });
      if (renderedCount >= list.length) {
        if (!renderedCount) gallery.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#ddd;">No dresses found</div>`;
        return;
      }

      const slice = list.slice(renderedCount, renderedCount + CHUNK);
      slice.forEach(i => gallery.appendChild(createCard(i, searchInput.value.trim())));
      renderedCount += slice.length;

      counterBar.innerHTML = `Total Dresses: <b>${dresses.length}</b> | Showing: <b>${renderedCount}</b> / ${list.length}`;
    }

    // Create DOM card for a dress
    function createCard(i, searchTerm='') {
      const card = document.createElement('div'); card.className='card';
      // highlight function
      const nameHtml = highlight(i.name, searchTerm);
      const tagsHtml = (i.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('');

      card.innerHTML = `
        <img src="${i.imageUrl || ''}" loading="lazy" onclick="openPreview('${i.imageUrl || ''}')" alt="${escapeHtml(i.name)}" />
        <button class="fav-btn" data-id="${i._id}" aria-label="${i.isFavorite ? 'Unfavourite' : 'Add to favourites'}">${i.isFavorite ? '❤️' : '🤍'}</button>
        <div class="card-content">
          <h3>${nameHtml}</h3>
          <p>${escapeHtml(i.section || '—')} → ${escapeHtml(i.category || '—')}</p>
          <div class="tags">${tagsHtml}</div>
          <div class="btn-row">
            <button class="delete-btn" data-id="${i._id}">Delete</button>
            <button class="btn-gradient" data-id="${i._id}">Edit</button>
          </div>
        </div>
      `;

      const favBtn = card.querySelector('.fav-btn');
      const delBtn = card.querySelector('.delete-btn');
      const editBtn = card.querySelector('.btn-gradient');

      favBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleFavourite(i._id, favBtn); });
      delBtn.addEventListener('click', (e)=>{ e.stopPropagation(); deleteDress(i._id, delBtn); });
      editBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openEditFromCard(i._id); });

      return card;
    }

    // Helpers: escapeHtml & highlight
    function escapeHtml(s='') { return (s+'').replace(/[&"'<>]/g, ch => ({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'}[ch])); }

    function highlight(text, term) {
      if (!term) return escapeHtml(text);
      try {
        const re = new RegExp('('+term.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+')','ig');
        return escapeHtml(text).replace(re, '<mark style="background:rgba(198,113,255,0.18); color:inherit; padding:0 3px; border-radius:3px;">$1</mark>');
      } catch (e) { return escapeHtml(text); }
    }

    /* ---------- Scroll listener for infinite scroll ---------- */
    let busyScroll = false;
    window.addEventListener('scroll', () => {
      if (busyScroll) return; const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 700);
      if (nearBottom) { busyScroll = true; setTimeout(()=>{ renderMore(); busyScroll=false; }, 220); }
    });

    /* ---------- CRUD actions ---------- */
    async function deleteDress(id, btn) {
      if (!confirm('Delete this dress?')) return;
      const card = btn.closest('.card'); card.style.opacity = '0.4';
      try {
        const res = await fetch(`${API_URL}/dresses/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) { alert('Delete failed.'); card.style.opacity = '1'; return; }
        card.style.opacity = '0'; card.style.transform = 'scale(.98)'; setTimeout(()=>card.remove(), 380);
        dresses = dresses.filter(d=>d._id !== id);
        tagsSet = new Set(); dresses.forEach(d => (d.tags||[]).forEach(t => tagsSet.add(t)));
        populateTagFilter();
        resetAndRender();
        showToast({ text: 'Deleted', variant: 'warn' });
      } catch (err) { console.error(err); alert('Delete failed'); card.style.opacity = '1'; }
    }

    function openPreview(img) { previewImage.src = img || ''; previewModal.classList.add('active'); }
    closePreview.onclick = () => previewModal.classList.remove('active');
    previewModal.onclick = e => { if (e.target === previewModal) previewModal.classList.remove('active'); };

    // Toggle Favourite (keeps optimistic UI)
    async function toggleFavourite(id, btn) {
      try {
        const index = dresses.findIndex(d=>d._id===id); if (index === -1) return;
        const original = dresses[index].isFavorite;
        dresses[index].isFavorite = !original; btn.innerHTML = dresses[index].isFavorite ? '❤️' : '🤍';

        const res = await fetch(`${API_URL}/dresses/${id}/favourite`, { method:'PUT', credentials:'include' });
        const data = await res.json();
        if (!res.ok || !data.success) { dresses[index].isFavorite = original; btn.innerHTML = original? '❤️':'🤍'; showToast({ text: 'Failed to update favourite', variant: 'warn' }); return; }
        dresses[index].isFavorite = !!data.isFavorite; btn.innerHTML = data.isFavorite ? '❤️':'🤍';
        showToast({ text: data.isFavorite ? 'Added to favourites 💖' : 'Removed from favourites 💔', variant: data.isFavorite? 'success':'warn' });
        emitFavouriteEvent({ id, isFavorite: !!data.isFavorite, dress: dresses[index] });
      } catch (err) { console.error(err); showToast({ text: 'Server error', variant: 'warn' }); }
    }

    /* ----------------- Edit flow ----------------- */
    function openEditFromCard(id) {
      const dress = dresses.find(d => d._id === id);
      if (!dress) return alert('Dress not found.');
      currentEditId = id; populateEditFields(dress); openEditModal();
    }

    function populateEditFields(dress) {
      editName.value = dress.name || '';
      editTags.value = (dress.tags || []).join(', ');
      editSection.value = dress.section || (sections[0] && sections[0].name) || '';
      fillCategoriesForEdit(editSection.value);
      editCategory.value = dress.category || '';
    }

    function fillCategoriesForEdit(sectionName) {
      const sec = sections.find(s=>s.name===sectionName);
      editCategory.innerHTML = '';
      if (!sec || !sec.categories || !sec.categories.length) {
        const opt = document.createElement('option'); opt.value = ''; opt.textContent = '— No categories —'; editCategory.appendChild(opt); return;
      }
      sec.categories.forEach(c=>{ const opt=document.createElement('option'); opt.value=c; opt.textContent=c; editCategory.appendChild(opt); });
    }

    editSection.addEventListener('change', ()=> fillCategoriesForEdit(editSection.value));

    function openEditModal() { editModal.classList.add('active'); editModal.setAttribute('aria-hidden','false'); setTimeout(()=> editName.focus(), 120); }
    function closeEditModal() { editModal.classList.remove('active'); editModal.setAttribute('aria-hidden','true'); currentEditId = null; }
    cancelEdit.addEventListener('click', (e)=>{ e.preventDefault(); closeEditModal(); });

    saveEdit.addEventListener('click', async (e)=>{
      e.preventDefault(); if (!currentEditId) return alert('No dress selected.');
      const payload = { name: editName.value.trim(), section: editSection.value, category: editCategory.value, tags: editTags.value.split(',').map(t=>t.trim()).filter(Boolean) };
      if (!payload.name) return alert('Name is required.');

      try {
        saveEdit.disabled = true; saveEdit.textContent = 'Saving...';
        const res = await fetch(`${API_URL}/dresses/${currentEditId}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'include', body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) { const msg = (data && data.message) ? data.message : 'Update failed.'; alert(msg); return; }

        const updated = data.dress || data || null;
        if (updated && updated._id) dresses = dresses.map(d => d._id === updated._id ? updated : d);
        else dresses = dresses.map(d => d._id === currentEditId ? { ...d, name: payload.name, section: payload.section, category: payload.category, tags: payload.tags } : d);

        // refresh tags set
        tagsSet = new Set(); dresses.forEach(d => (d.tags||[]).forEach(t => tagsSet.add(t)));
        populateTagFilter();

        resetAndRender(); closeEditModal(); showToast({ text: 'Saved', variant: 'success' });
      } catch (err) { console.error(err); alert('Server error while saving.'); }
      finally { saveEdit.disabled = false; saveEdit.textContent = 'Save'; }
    });

    window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') { if (editModal.classList.contains('active')) closeEditModal(); if (previewModal.classList.contains('active')) previewModal.classList.remove('active'); } });

    /* ---------- Mobile filter toggle ---------- */
    mobileFilterToggle.addEventListener('click', ()=> { filterBar.classList.toggle('expanded'); });

    /* ---------- Utility: escape single quotes for preview onclick usage ---------- */
    function safeForOnClick(s='') { return (s||'').replace(/'/g, "\\'"); }

    /* ---------- Initialize skeletons & data load ---------- */
    showSkeletons(8);
    loadData();
