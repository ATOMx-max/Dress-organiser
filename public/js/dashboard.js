// Extracted script for dashboard.html

// ---------- Navigation & small utils ----------
    function go(p){ window.location.href=p; }
    function logout(){ fetch('/logout',{method:'POST',credentials:'include'}).finally(()=>{localStorage.removeItem('loggedInUser');go('login.html');}); }

    function typeText(el, text, delay=40){
      if(!el) return;
      el.textContent = "";
      let i = 0;
      const timer = setInterval(() => {
        if (i >= text.length) { clearInterval(timer); return; }
        el.textContent += text[i++];
      }, delay);
    }
    function typeEffectPromise(el, text, speed=30){
      return new Promise((resolve)=>{
        if(!el){ resolve(); return; }
        el.textContent = "";
        let i=0;
        const t = () => {
          if(i<text.length){ el.textContent += text[i++]; setTimeout(t, speed); }
          else resolve();
        };
        t();
      });
    }

    // ---------- Load user & stats (unchanged) ----------
    async function loadUser(){
      try{
        const r=await fetch('/api/me',{credentials:'include'});
        if(!r.ok){ go('login.html'); return; }
        const u=await r.json();
        const name = u.name || (u.email ? u.email.split('@')[0] : 'User');
        document.getElementById('avatar').textContent = name.charAt(0).toUpperCase();
        const hour = new Date().getHours();
        const timeGreeting = hour < 12 ? "Good morning" : (hour < 17 ? "Good afternoon" : "Good evening");
        typeText(document.getElementById('typingLine1'), `${timeGreeting}, ${name} 👋`);
        typeText(document.getElementById('typingLine2'), `Here's your wardrobe overview…`);
        window.__CURRENT_USER = u;
      }catch(e){ console.error(e); }
    }

    async function loadStats(){
      try{
        const r=await fetch('/api/stats',{credentials:'include'});
        if(!r.ok) return;
        const s=await r.json();
        document.getElementById('dressCount').textContent = s.dresses ?? 0;
        document.getElementById('sectionCount').textContent = s.sections ?? 0;
        document.getElementById('recentUploads').textContent = (s.recent || []).length;
      }catch(e){ console.error(e); }
    }

    loadUser();
    loadStats();
    setInterval(loadStats, 60_000);

    // ---------- Birthday config ----------
    const BDAY_TARGET_EMAIL = "iamsulagna.de@gmail.com";
    const BDAY_DAY_MONTH = "22-11"; // dd-mm - keep this as the trigger day

    // ---------- Birthday check & activation ----------
    async function checkBirthday() {
      try {
        let user = window.__CURRENT_USER;
        if (!user) {
          const res = await fetch('/api/me', { credentials: 'include' });
          if (!res.ok) return;
          user = await res.json();
          window.__CURRENT_USER = user;
        }

        const now = new Date();
        const dd = String(now.getDate()).padStart(2,'0');
        const mm = String(now.getMonth() + 1).padStart(2,'0');
        const today = `${dd}-${mm}`;

        if (user && user.email === BDAY_TARGET_EMAIL && today === BDAY_DAY_MONTH) {
          // show rose-themed birthday screen (dark style)
          const shown = localStorage.getItem("bdayShown");
          if (shown !== new Date().toDateString()) {
            setTimeout(()=> showBirthdayScreen(user), 450);
          } else {
            showBirthdayNotification();
          }
        }
      } catch (err) {
        console.error("Birthday check error:", err);
      }
    }
    setTimeout(checkBirthday, 800);

    // ---------- Show / Close birthday ----------
    function showBirthdayScreen(user) {
      localStorage.setItem("bdayShown", new Date().toDateString());
      const screen = document.getElementById('birthdayScreen');
      const music = document.getElementById('bdayMusic');
      screen.style.display = 'flex';

      // set name text (static "MY LOVE" per your request)
      const displayName = "MY LOVE";
      document.getElementById('greetingLine').textContent = `🎉 Happy Birthday, ${displayName}! 🎉`;
      document.getElementById('subGreeting').textContent = 'Tap to open — my heartbeat… ❤️🎁';
      document.getElementById('personalMsg').innerHTML = `<strong>${displayName} —</strong> on your special day, I want to remind you of something simple but true: <strong>You are the most beautiful chapter of my life.</strong>`;

      // show visual layers
      populateSparkles();
      createHearts();
      startRosePetals();

      // confetti entrance
      setTimeout(()=> confetti({ particleCount: 110, spread: 90, origin: { y: 0.62 } }), 320);
      setTimeout(()=> confetti({ particleCount: 180, spread: 120, origin: { y: 0.66 } }), 900);

      // play music softly when opened (will fade in)
      const card = document.getElementById('animatedCard');
      let opened = false;
      async function openInteraction() {
        if (opened) return;
        opened = true;
        try {
          music.volume = 0;
          const p = music.play();
          if (p !== undefined) p.catch(()=>{});
          let v = 0;
          const target = 0.55;
          const step = 0.035;
          const iv = setInterval(()=> {
            v = Math.min(v + step, target);
            music.volume = v;
            if (v >= target) clearInterval(iv);
          }, 120);
        } catch(e){}
        // reveal long message
        const secondEl = document.getElementById('secondMsg');
        const secondText = "On this day… I just want one thing: For you to feel loved, cherished, and held close. Because you deserve all the happiness in the world, My Love. 💗";
        setTimeout(()=> {
          typeEffectPromise(secondEl, secondText, 28).then(()=> {
            // subtle highlight or shimmer could be added here
          });
        }, 900);
      }

      card.addEventListener('click', openInteraction, { once: true });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openInteraction(); });

      // continue button
      document.getElementById('continueBtn').onclick = closeBirthday;
      // close button
      document.getElementById('closeBday').onclick = closeBirthday;
    }

    function closeBirthday() {
      const screen = document.getElementById('birthdayScreen');
      const music = document.getElementById('bdayMusic');
      try {
        let v = music.volume || 0;
        const fade = setInterval(()=> {
          v = Math.max(0, v - 0.06);
          music.volume = v;
          if (v <= 0.02) { clearInterval(fade); try{ music.pause(); }catch(e){} }
        }, 80);
      } catch(e){}

      stopRosePetals();
      clearSparkles();
      clearHearts();

      screen.classList.add('fadeOut');
      setTimeout(()=> {
        screen.style.display = 'none';
        screen.classList.remove('fadeOut');
      }, 520);
    }

    // notification small button
    function showBirthdayNotification() {
      const box = document.getElementById("bdayNotification");
      if (!box) return;
      box.style.display = "block";
      box.style.opacity = "0";
      setTimeout(()=> box.style.opacity = "1", 20);
      box.onclick = () => { box.style.display = "none"; showBirthdayScreen(window.__CURRENT_USER); };
    }

    // ---------- Sparkles (between fog & card) ----------
    const sparkleEls = [];
    function populateSparkles() {
      const wrap = document.getElementById('sparklesContainer');
      if(!wrap) return;
      wrap.innerHTML = '';
      const count = 12;
      for (let i=0; i<count; i++){
        const s = document.createElement('div');
        s.className = 'sparkle';
        const left = 8 + Math.random() * 84;
        const top = 6 + Math.random() * 72;
        s.style.left = left + '%';
        s.style.top = top + '%';
        const scale = 0.6 + Math.random() * 1.0;
        s.style.width = (8 + Math.random()*10) + 'px';
        s.style.height = s.style.width;
        s.style.animationDelay = (Math.random() * 2) + 's';
        s.style.opacity = 0;
        wrap.appendChild(s);
        sparkleEls.push(s);
      }
    }
    function clearSparkles() {
      const wrap = document.getElementById('sparklesContainer');
      if(wrap) wrap.innerHTML = '';
      sparkleEls.length = 0;
    }

    // ---------- Hearts ----------
    let heartsInterval = null;
    function createHearts(){
      const container = document.getElementById('heartsContainer');
      if(!container) return;
      container.innerHTML = '';
      const colors = ["#ff6fb5","#ff9bd0","#ffc0d9","#ff7fb0"];
      heartsInterval = setInterval(()=> {
        const h = document.createElement('div');
        h.className = 'heart';
        h.innerHTML = '❤️';
        const left = 8 + Math.random() * 84;
        const size = 18 + Math.random()*28;
        h.style.left = left + '%';
        h.style.top = (60 + Math.random()*28) + '%';
        h.style.fontSize = size + 'px';
        h.style.color = colors[Math.floor(Math.random()*colors.length)];
        const dur = 3500 + Math.random()*2000;
        h.style.animationDuration = (dur/1000) + 's';
        container.appendChild(h);
        // remove after animation
        setTimeout(()=> {
          try{ container.removeChild(h); } catch(e){}
        }, dur + 200);
      }, 520);
    }
    function clearHearts(){
      if(heartsInterval){ clearInterval(heartsInterval); heartsInterval = null; }
      const cont = document.getElementById('heartsContainer');
      if(cont) cont.innerHTML = '';
    }

    // ---------- Falling Rose Petals (behind card) ----------
    let petalInterval = null;
    function startRosePetals(){
      const container = document.getElementById('petalContainer');
      if(!container) return;
      container.innerHTML = '';
      // replace this image with your own if you want better quality
      const petalImg = "https://i.ibb.co/QCTCs7Z/rosepetal.png";

      petalInterval = setInterval(()=> {
        const petal = document.createElement('div');
        petal.className = 'petal';
        // random start position
        const left = Math.random() * 110 - 5; // allow slight off-screen spawn
        petal.style.left = left + 'vw';
        petal.style.top = (-8 - Math.random()*6) + 'vh'; // start above viewport
        // size
        const size = 16 + Math.random()*26;
        petal.style.width = size + 'px';
        petal.style.height = 'auto';
        petal.style.backgroundImage = `url(${petalImg})`;
        petal.style.opacity = (0.6 + Math.random()*0.35);
        const dur = 6 + Math.random()*7;
        petal.style.animationDuration = dur + 's';
        // apply animation
        petal.style.animationName = 'petalFall';
        petal.style.animationTimingFunction = 'linear';
        petal.style.animationFillMode = 'forwards';
        // horizontal drifting via Web Animations
        const drift = (Math.random()*18 - 9); // vw drift
        container.appendChild(petal);
        // animate translateX and rotation
        petal.animate([
          { transform: `translateX(0) rotate(${Math.random()*90 - 45}deg)` },
          { transform: `translateX(${drift}vw) rotate(${Math.random()*720 - 360}deg)` }
        ], { duration: dur * 1000, easing: 'ease-in-out' });

        // remove later
        setTimeout(()=> {
          try{ container.removeChild(petal); } catch(e){}
        }, (dur + 1) * 1000);
      }, 260);
    }

    function stopRosePetals(){
      if(petalInterval){ clearInterval(petalInterval); petalInterval = null; }
      const container = document.getElementById('petalContainer');
      if(container) container.innerHTML = '';
    }

    // ---------- Feedback modal ----------
    function openFeedbackModal(){ document.getElementById("feedbackModal").style.display = "flex"; }
    function closeFeedbackModal(){ document.getElementById("feedbackModal").style.display = "none"; }
    async function submitFeedback(){
      const text = document.getElementById("feedbackText").value.trim();
      if(!text) return alert("Please write some feedback!");
      try{
        const res = await fetch("/api/feedback", {
          method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include", body:JSON.stringify({message:text})
        });
        if(res.ok){ alert("Your feedback has been submitted!"); document.getElementById("feedbackText").value=""; closeFeedbackModal(); }
        else alert("Error submitting feedback.");
      }catch(e){ alert("Network error."); }
    }

    // ---------- Safe cleanups on unload ----------
    window.addEventListener('beforeunload', ()=> {
      stopRosePetals();
      clearSparkles();
      clearHearts();
    });

    // end script
