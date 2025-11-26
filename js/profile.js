// Scripts for profile page (extracted from inline <script>)

/* API URL detection */
const API_URL = window.location.origin.includes("localhost")
  ? "http://localhost:8080"
  : (window.location.origin.includes("dress-organiser")
      ? "https://dress-organiser.onrender.com"
      : window.location.origin);

/* Toast */
function showToast(msg, type="success") {
  const box = document.getElementById("toastBox");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transform="translateX(20px)"; },2500);
  setTimeout(()=> t.remove(), 3200);
}

/* Sidebar */
const sidebarEl = document.getElementById("sidebar");
const mainEl = document.getElementById("main");

function openSidebar() {
  sidebarEl.classList.add("open");
  sidebarEl.classList.remove("closed");
  mainEl.classList.add("dim");
}
function closeSidebar() {
  sidebarEl.classList.remove("open");
  sidebarEl.classList.add("closed");
  mainEl.classList.remove("dim");
}
function toggleSidebar() {
  sidebarEl.classList.contains("open") ? closeSidebar() : openSidebar();
}

document.getElementById("sidebarToggle").onclick = toggleSidebar;

/* Close when clicking outside */
document.addEventListener("click", (e) => {
  if (window.innerWidth <= 720) {
    if (!sidebarEl.contains(e.target) && !e.target.closest(".sidebar-toggle")) {
      closeSidebar();
    }
  }
});

/* Load profile data */
async function loadUser() {
  try {
    const res = await fetch(`${API_URL}/api/me`, { credentials:"include" });
    if (!res.ok) return location.href="login.html";
    
    const user = await res.json();
    document.getElementById("name").textContent = user.name || "Not set";
    document.getElementById("username").textContent = user.username || "Not set";
    document.getElementById("email").textContent = user.email;
    document.getElementById("joined").textContent = new Date(user.joined).toLocaleDateString();

    document.getElementById("profilePic").src = user.profilePic || "default.jpg";

    const verify = user.verified
      ? `<span style="color:#4ade80;">Verified</span>`
      : `<span style="color:#f87171;">Not Verified</span>`;
    document.getElementById("verifyBadge").innerHTML = verify;
    document.getElementById("verifyBadge2").innerHTML = verify;

  } catch (err) {
    showToast("Failed to load user","error");
  }
}
loadUser();

/* Edit name */
function editName(){
  let name = prompt("Enter new name:");
  if(!name) return;
  fetch(`${API_URL}/api/update-name`,{
    method:"POST",
    credentials:"include",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({name})
  }).then(()=> loadUser());
}

/* Edit username */
function editUsername(){
  let u = prompt("Enter new username:");
  if(!u) return;
  fetch(`${API_URL}/api/update-username`,{
    method:"POST",
    credentials:"include",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({username:u})
  }).then(()=> loadUser());
}

/* Upload profile picture */
document.getElementById("picInput").onchange = async (e)=>{
  const file = e.target.files[0];
  if(!file) return;

  const form = new FormData();
  form.append("image", file);

  const res = await fetch(`${API_URL}/api/upload-profile-pic`,{
    method:"POST",
    credentials:"include",
    body:form
  });

  if(res.ok){
    showToast("Updated");
    loadUser();
  }
};

/* Password modal */
function openPasswordModal(){ passwordModal.style.display="flex"; }
function closePasswordModal(){ passwordModal.style.display="none"; }

async function changePassword(){
  let cur = curPass.value, neo = newPass.value;
  if(!cur || !neo) return;
  const res = await fetch(`${API_URL}/api/change-password`,{
    method:"POST",
    credentials:"include",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({currentPassword:cur,newPassword:neo})
  });
  if(res.ok){ showToast("Updated"); closePasswordModal(); }
}

/* Delete account */
function openDeleteModal(){ deleteModal.style.display="flex"; }
function closeDeleteModal(){ deleteModal.style.display="none"; }

async function deleteAccount(){
  if(confirmDeleteInput.value !== "DELETE")
    return showToast("Type DELETE","error");

  const res = await fetch(`${API_URL}/api/delete-account`,{
    method:"DELETE",
    credentials:"include"
  });

  if(res.ok){
    showToast("Account deleted","error");
    setTimeout(()=> location.href="login.html", 800);
  }
}

/* Backup Export */
function downloadBackup(){
  window.location.href = `${API_URL}/api/backup`;
}

/* Backup Import */
let importData=null;

async function handleImport(e){
  const file = e.target.files[0];
  if(!file) return;

  const txt = await file.text();
  try { importData = JSON.parse(txt); }
  catch { return showToast("Invalid file","error"); }

  previewList.innerHTML = `
    <p><b>Sections:</b> ${(importData.sections||[]).length}</p>
    <p><b>Dresses:</b> ${(importData.dresses||[]).length}</p>
  `;

  restoreModal.style.display="flex";
}

function closeRestoreModal(){ restoreModal.style.display="none"; }

async function confirmRestore(){
  // show loading screen
  document.getElementById("restoreLoading").style.display = "flex";

  const payload = {
    sections: restoreSections.checked ? importData.sections : [],
    dresses: restoreDresses.checked ? importData.dresses : []
  };

  try {
    const res = await fetch(`${API_URL}/api/import`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    await new Promise(resolve => setTimeout(resolve, 1000)); // smooth wait

    // hide loading
    document.getElementById("restoreLoading").style.display = "none";

    if (res.ok) {
      // confetti burst
      confetti({
        particleCount: 260,
        spread: 120,
        origin: { y: 0.65 }
      });

      showToast("Restore successful 🎉");
      closeRestoreModal();
    } else {
      showToast("Restore failed","error");
    }

  } catch (e) {
    document.getElementById("restoreLoading").style.display = "none";
    showToast("Restore failed","error");
  }
}


/* Logout */
function logout(){
  fetch(`${API_URL}/logout`,{method:"POST",credentials:"include"})
    .finally(()=> location.href="login.html");
}