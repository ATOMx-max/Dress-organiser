// Scripts for verify page (extracted from inline <script>)

const API_URL = window.location.origin.includes("localhost")
  ? "http://localhost:8080"
  : "https://dress-organiser.onrender.com";

// Get elements
const loadingState = document.getElementById("loadingState");
const successState = document.getElementById("successState");
const errorState = document.getElementById("errorState");
const invalidState = document.getElementById("invalidState");
const errorMessage = document.getElementById("errorMessage");
const countdownSpan = document.getElementById("countdown");

// Parse URL parameters
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get("token"),
    id: params.get("id"),
    status: params.get("status")
  };
}

// Show specific state
function showState(state) {
  loadingState.classList.add("hidden");
  successState.classList.add("hidden");
  errorState.classList.add("hidden");
  invalidState.classList.add("hidden");
  
  state.classList.remove("hidden");
}

// Countdown and redirect
function startCountdown() {
  let count = 3;
  const interval = setInterval(() => {
    count--;
    countdownSpan.textContent = count;
    
    if (count <= 0) {
      clearInterval(interval);
      window.location.href = "login.html";
    }
  }, 1000);
}

// Verify email function
async function verifyEmail(token, id) {
  try {
    const response = await fetch(`${API_URL}/verify?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`, {
      method: "GET",
      credentials: "include"
    });

    // The backend redirects, but we can also check if we're on the verify page with status
    const currentParams = getQueryParams();
    
    if (currentParams.status === "success") {
      showState(successState);
      startCountdown();
    } else if (currentParams.status === "invalid") {
      errorMessage.textContent = "The verification link is invalid or has already been used.";
      showState(errorState);
    } else if (currentParams.status === "error") {
      errorMessage.textContent = "An error occurred during verification. Please try again.";
      showState(errorState);
    } else {
      // If no status but we have token and id, wait for redirect
      setTimeout(() => {
        const params = getQueryParams();
        if (!params.status) {
          // Still no status after wait, might be an error
          errorMessage.textContent = "Verification timed out. Please try again.";
          showState(errorState);
        }
      }, 5000);
    }

  } catch (error) {
    console.error("Verification error:", error);
    errorMessage.textContent = "Unable to connect to the server. Please check your internet connection.";
    showState(errorState);
  }
}

// Initialize verification
async function init() {
  const { token, id, status } = getQueryParams();

  // If status is already in URL (from backend redirect)
  if (status) {
    if (status === "success") {
      showState(successState);
      startCountdown();
    } else if (status === "invalid") {
      errorMessage.textContent = "The verification link is invalid or has already been used.";
      showState(errorState);
    } else if (status === "error") {
      errorMessage.textContent = "An error occurred during verification. Please try again.";
      showState(errorState);
    }
    return;
  }

  // If we have token and id, proceed with verification
  if (token && id) {
    await verifyEmail(token, id);
  } else {
    // No token or id in URL
    showState(invalidState);
  }
}

// Start verification on page load
window.addEventListener("DOMContentLoaded", init);