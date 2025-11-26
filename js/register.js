// Scripts for register page (extracted from inline <script>)

const API_URL = window.location.origin.includes("localhost")
  ? "http://localhost:8080"
  : "https://dress-organiser.onrender.com";

document.querySelectorAll(".toggle").forEach(icon => {
  icon.addEventListener("click", () => {
    const input = document.getElementById(icon.dataset.target);
    input.type = input.type === "password" ? "text" : "password";
    icon.textContent = input.type === "password" ? "👁️" : "🙈";
  });
});

const form = document.getElementById("registerForm");
const msg = document.getElementById("msg");
const registerBtn = document.getElementById("registerBtn");
const spinner = registerBtn.querySelector(".spinner");
const btnText = registerBtn.querySelector(".btn-text");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();

  if (!/\S+@\S+\.\S+/.test(email)) {
    showMessage("⚠ Enter a valid email address.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("⚠ Passwords do not match.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("⚠ Password must be at least 6 characters long.", "error");
    return;
  }

  loading(true, "Creating your account...");

  try {
    const res = await fetch(`${API_URL}/register`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ name, username, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showMessage("❌ " + (data.message || "Registration failed."), "error");
      loading(false);
      return;
    }

    showMessage("✅ Account created! Please verify your email.", "success");

  } catch (err) {
    showMessage("⚠ Server error. Please try again.", "error");
  }

  loading(false);
});

function loading(isLoading, text="") {
  if (isLoading) {
    msg.className = "msg info show";
    msg.textContent = text;
    spinner.style.display = "inline-block";
    btnText.style.display = "none";
    registerBtn.disabled = true;
  } else {
    spinner.style.display = "none";
    btnText.style.display = "inline";
    registerBtn.disabled = false;
  }
}

function showMessage(text, type="info") {
  msg.textContent = text;
  msg.className = `msg ${type} show`;
}