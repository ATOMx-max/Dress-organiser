// Extracted script for upload.html

const API_URL = window.location.origin.includes("localhost")
      ? "http://localhost:8080"
      : "https://dress-organiser.onrender.com";

    const sectionSelect = document.getElementById("section");
    const categorySelect = document.getElementById("category");
    const statusDiv = document.getElementById("status");
    const submitBtn = document.getElementById("submitBtn");
    const submitText = document.getElementById("submitText");

    if (!localStorage.getItem("loggedInUser")) {
      window.location.href = "login.html";
    }

    // Load sections from backend
    async function loadSections() {
      try {
        const res = await fetch(`${API_URL}/api/sections`, { credentials: "include" });
        if (!res.ok) return;

        const data = await res.json();
        sectionSelect.innerHTML = `<option value="">Select Section</option>`;

        data.forEach(s => {
          sectionSelect.innerHTML += `<option value="${s.name}">${s.name}</option>`;
        });

        // Load categories when section changes
        sectionSelect.onchange = () => {
          const selected = data.find(x => x.name === sectionSelect.value);
          categorySelect.innerHTML = `<option value="">Select Category</option>`;
          if (selected) {
            selected.categories.forEach(c => {
              categorySelect.innerHTML += `<option value="${c}">${c}</option>`;
            });
          }
          updatePreview();
        };
      } catch (error) {
        console.error('Failed to load sections:', error);
      }
    }

    loadSections();

    // Update preview
    function updatePreview() {
      const name = document.getElementById("name").value;
      const section = sectionSelect.value;
      const category = categorySelect.value;

      if (name) document.getElementById("previewName").textContent = name;
      if (section) document.getElementById("previewSection").textContent = section;
      if (category) document.getElementById("previewCategory").textContent = category;
    }

    // Listen to input changes
    document.getElementById("name").addEventListener("input", updatePreview);
    categorySelect.addEventListener("change", updatePreview);

    // Preview photo
    document.getElementById("image").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        document.getElementById("previewEmpty").style.display = "none";
        document.getElementById("previewContainer").style.display = "flex";
        document.getElementById("previewImage").src = reader.result;
        
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        document.getElementById("previewSize").textContent = `${sizeInMB} MB`;
      };
      reader.readAsDataURL(file);
    });

    // Show status message
    function showStatus(message, isSuccess) {
      statusDiv.textContent = message;
      statusDiv.className = `status ${isSuccess ? 'success' : 'error'}`;
      statusDiv.style.display = 'block';
    }

    // Upload form
    document.getElementById("uploadForm").addEventListener("submit", async (e) => {
      e.preventDefault();

      const formData = new FormData(e.target);

      // Disable button and show loading
      submitBtn.disabled = true;
      submitText.innerHTML = '<span class="spinner"></span>Uploading...';

      try {
        const res = await fetch(`${API_URL}/api/dresses`, {
          method: "POST",
          body: formData,
          credentials: "include"
        });

        const data = await res.json();

        if (res.ok) {
          showStatus("✅ Uploaded successfully! Redirecting...", true);
          setTimeout(() => window.location.href = 'dashboard.html', 1500);
        } else {
          showStatus("❌ " + (data.message || "Upload failed"), false);
          submitBtn.disabled = false;
          submitText.textContent = "✨ Upload Dress";
        }
      } catch (error) {
        showStatus("⚠️ Network error! Please try again.", false);
        submitBtn.disabled = false;
        submitText.textContent = "✨ Upload Dress";
      }
    });

    // Logout
    document.getElementById("logoutBtn").onclick = () => {
      localStorage.removeItem("loggedInUser");
      window.location.href = "login.html";
    };
