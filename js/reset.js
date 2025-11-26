// Scripts for reset page (extracted from inline <script>)

const API_URL = window.location.origin.includes("localhost")
      ? "http://localhost:8080"
      : "https://dress-organiser.onrender.com";

    const msg = document.getElementById("msg");
    const resetForm = document.getElementById("resetForm");

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const id = params.get("id");

    // If URL is missing parameters
    if (!token || !id) {
      msg.textContent = "❌ Invalid or missing reset link.";
      msg.className = "message error";
    }

    // -------------------------------------
    // 1️⃣ VALIDATE TOKEN BEFORE SHOWING FORM
    // -------------------------------------
    async function validateToken() {
      try {
        const res = await fetch(`${API_URL}/validate-reset?token=${token}&id=${id}`);
        const data = await res.json();

        if (!data.valid) {
          msg.textContent = "❌ Reset link is invalid or expired.";
          msg.className = "message error";
          resetForm.style.display = "none";
        } else {
          msg.textContent = "✔ Reset link verified. Enter new password.";
          msg.className = "message success";
          resetForm.style.display = "block";
        }
      } catch (e) {
        msg.textContent = "⚠ Server error.";
        msg.className = "message error";
      }
    }

    validateToken();

    // ----------------------------
    // 2️⃣ HANDLE RESET SUBMISSION
    // ----------------------------
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const password = document.getElementById("password").value.trim();
      const confirmPassword = document.getElementById("confirmPassword").value.trim();

      if (password.length < 6) {
        msg.textContent = "⚠️ Password must be at least 6 characters.";
        msg.className = "message error";
        return;
      }

      if (password !== confirmPassword) {
        msg.textContent = "⚠️ Passwords do not match!";
        msg.className = "message error";
        return;
      }

      msg.textContent = "⏳ Updating password...";
      msg.className = "message info";

      try {
        const res = await fetch(`${API_URL}/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, id, password })
        });

        const data = await res.json();

        if (res.ok) {
          msg.textContent = "✅ Password reset successful! Redirecting...";
          msg.className = "message success";

          setTimeout(() => {
            window.location.href = "login.html";
          }, 1500);

        } else {
          msg.textContent = "❌ " + data.message;
          msg.className = "message error";
        }
      } catch {
        msg.textContent = "⚠️ Server not reachable.";
        msg.className = "message error";
      }
    });