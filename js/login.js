// Scripts for login page (extracted from inline <script>)

const API_URL = window.location.origin.includes("localhost")
      ? "http://localhost:8080"
      : "https://dress-organiser.onrender.com";

    const msg = document.getElementById("msg");
    const successOverlay = document.getElementById("successOverlay");
    const loginBtn = document.getElementById("loginBtn");
    const loginForm = document.getElementById("loginForm");

    if (localStorage.getItem("loggedInUser")) {
      window.location.href = "dashboard.html";
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();

      loginBtn.disabled = true;
      loginBtn.innerHTML = '<span class="spinner"></span> Logging in...';

      msg.className = "message info";
      msg.innerHTML = "Authenticating...";

      try {
        const res = await fetch(`${API_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (res.ok) {
          msg.className = "message success";
          msg.innerHTML = "Login successful!";

          localStorage.setItem("loggedInUser", email);

          setTimeout(() => successOverlay.style.display = "flex", 600);
          setTimeout(() => window.location.href = "dashboard.html", 2200);
        } else {
          msg.className = "message error";
          msg.innerHTML = "❌ " + (data.message || "Login failed");

          loginBtn.disabled = false;
          loginBtn.innerHTML = "Login";
        }
      } catch {
        msg.className = "message error";
        msg.innerHTML = "⚠️ Server error. Try again.";

        loginBtn.disabled = false;
        loginBtn.innerHTML = "Login";
      }
    });

    document.getElementById("forgotPasswordLink").onclick = async (e) => {
      e.preventDefault();

      const email = prompt("Enter your registered email:");
      if (!email) return;

      msg.className = "message info";
      msg.innerHTML = "Sending reset link...";

      try {
        const res = await fetch(`${API_URL}/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();

        if (res.ok) {
          msg.className = "message success";
          msg.innerHTML = "✓ Reset link sent!";
        } else {
          msg.className = "message error";
          msg.innerHTML = "❌ " + (data.message || "Failed");
        }
      } catch {
        msg.className = "message error";
        msg.innerHTML = "⚠️ Something went wrong.";
      }
    };