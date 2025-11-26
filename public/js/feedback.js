// Extracted script for feedback.html

// Redirect if not logged in
    if (!localStorage.getItem("loggedInUser")) {
      window.location.href = "login.html";
    }

    // Auto backend detect
    const API_URL = window.location.origin.includes("localhost")
      ? "http://localhost:8080"
      : "https://dress-organiser.onrender.com";

    const btn = document.getElementById("submitFeedback");
    const msg = document.getElementById("msg");
    const textarea = document.getElementById("feedbackText");
    const charCount = document.getElementById("charCount");

    // Character counter
    textarea.addEventListener("input", () => {
      const length = textarea.value.length;
      charCount.textContent = length;
      
      if (length > 450) {
        charCount.style.color = "#ef4444";
      } else if (length > 400) {
        charCount.style.color = "#fbbf24";
      } else {
        charCount.style.color = "rgba(255, 255, 255, 0.7)";
      }
    });

    // Auto-resize textarea
    textarea.addEventListener("input", function() {
      this.style.height = "160px";
      this.style.height = Math.min(this.scrollHeight, 200) + "px";
    });

    btn.addEventListener("click", async () => {
      const feedback = textarea.value.trim();
      const user = localStorage.getItem("loggedInUser");

      if (!feedback) {
        msg.textContent = "⚠️ Please write something before submitting.";
        msg.style.color = "#fbbf24";
        msg.classList.add("success-animation");
        setTimeout(() => msg.classList.remove("success-animation"), 600);
        return;
      }

      // Loading animation
      btn.disabled = true;
      btn.innerHTML = '<span class="loader"></span> <span>Sending...</span>';
      msg.textContent = "";

      try {
        const res = await fetch(`${API_URL}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user, message: feedback })
        });

        const data = await res.json();

        if (res.ok) {
          msg.textContent = "✅ Thank you for your feedback!";
          msg.style.color = "#22c55e";
          msg.classList.add("success-animation");
          textarea.value = "";
          charCount.textContent = "0";
          
          // Confetti effect simulation
          setTimeout(() => {
            msg.classList.remove("success-animation");
          }, 600);
        } else {
          msg.textContent = "❌ Failed to send feedback. Please try again.";
          msg.style.color = "#ef4444";
        }
      } catch (error) {
        msg.textContent = "⚠️ Server not reachable. Please check your connection.";
        msg.style.color = "#fbbf24";
      }

      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<span>✨</span> <span>Submit Feedback</span>';
      }, 1200);
    });

    function logout() {
      if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("loggedInUser");
        window.location.href = "login.html";
      }
    }

    // Add touch feedback for mobile
    const buttons = document.querySelectorAll("button");
    buttons.forEach(button => {
      button.addEventListener("touchstart", function() {
        this.style.transform = "scale(0.97)";
      });
      button.addEventListener("touchend", function() {
        this.style.transform = "";
      });
    });
