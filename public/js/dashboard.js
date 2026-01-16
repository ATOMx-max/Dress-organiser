// ---------- Device detection ----------
const IS_MOBILE = window.innerWidth <= 768;
const LOW_CPU = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const REDUCE_ANIMATIONS = IS_MOBILE || LOW_CPU || REDUCED_MOTION;

// ---------- Navigation ----------
function go(p) { window.location.href = p; }

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-go]");
  if (nav) go(nav.dataset.go);
});

// keyboard support
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const el = document.activeElement;
    if (el?.dataset?.go) go(el.dataset.go);
  }
});

// logout
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  fetch("/logout", { method: "POST", credentials: "include" })
    .finally(() => go("login.html"));
});

// ---------- API wrapper ----------
async function api(url, options = {}) {
  try {
    const res = await fetch(url, { credentials: "include", ...options });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.error("API error:", url, e);
    return null;
  }
}

// ---------- Typing ----------
function typeText(el, text, delay = 40) {
  if (!el) return;
  let i = 0;
  const buf = [];
  const t = setInterval(() => {
    buf.push(text[i++]);
    el.textContent = buf.join("");
    if (i >= text.length) clearInterval(t);
  }, delay);
}

// ---------- Load user ----------
async function loadUser() {
  const u = await api("/api/me");
  if (!u) return go("login.html");

  window.__CURRENT_USER = u;
  const name = u.name || u.email.split("@")[0];
  document.getElementById("avatar").textContent = name[0].toUpperCase();

  const hour = new Date().getHours();
  const g = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  typeText(document.getElementById("typingLine1"), `${g}, ${name} 👋`);
  typeText(document.getElementById("typingLine2"), `Here's your wardrobe overview…`);
}

// ---------- Load stats ----------
let statsLoading = false;

async function loadStats() {
  if (statsLoading) return;
  statsLoading = true;

  const s = await api("/api/stats");
  if (s) {
    document.getElementById("dressCount").textContent = s.dresses ?? 0;
    document.getElementById("sectionCount").textContent = s.sections ?? 0;
    document.getElementById("recentUploads").textContent = s.recent?.length ?? 0;
  }

  statsLoading = false;
}

loadUser();
loadStats();
setInterval(loadStats, REDUCE_ANIMATIONS ? 120000 : 60000);

// ---------- Pause animations when hidden ----------
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopRosePetals?.();
    clearHearts?.();
    clearSparkles?.();
  }
});

// ---------- Feedback ----------
document.getElementById("openFeedback")?.addEventListener("click", () => {
  document.getElementById("feedbackModal").style.display = "flex";
});

// ---------- Birthday ----------
const BDAY_TARGET_EMAIL =
  document.querySelector('meta[name="birthday-user"]')?.content;

const BDAY_DAY_MONTH = "22-11";
let birthdayActive = false;

setTimeout(checkBirthday, 800);

async function checkBirthday() {
  const u = window.__CURRENT_USER || await api("/api/me");
  if (!u || u.email !== BDAY_TARGET_EMAIL) return;

  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth()+1).padStart(2,"0")}`;

  if (today === BDAY_DAY_MONTH) {
    const shown = localStorage.getItem("bdayShown");
    if (shown !== d.toDateString()) showBirthdayScreen(u);
    else showBirthdayNotification();
  }
}
