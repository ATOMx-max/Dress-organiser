// Scripts for index page (extracted from inline <script>)

const API_URL = window.location.origin.includes("localhost")
      ? "http://localhost:8080"
      : "https://dress-organiser.onrender.com";

    const sectionSelect = document.getElementById("section");
    const categorySelect = document.getElementById("category");
    const fileInput = document.getElementById("image");
    const fileBtn = document.getElementById("fileUploadBtn");
    const preview = document.getElementById("preview");
    const statusText = document.getElementById("status");
    const progressBar = document.getElementById("progressBar");
    const progressContainer = document.getElementById("progressContainer");

    if (!localStorage.getItem("loggedInUser")) {
      window.location.href = "login.html";
    }

    // Load sections
    async function loadSections() {
      const res = await fetch(`${API_URL}/api/sections`, { credentials:"include" });
      const data = await res.json();

      sectionSelect.innerHTML = `<option value="">Select Section</option>`;
      data.forEach(sec => {
        sectionSelect.innerHTML += `<option value="${sec.name}">${sec.name}</option>`;
      });

      sectionSelect.onchange = () => {
        const selected = data.find(s => s.name === sectionSelect.value);
        categorySelect.innerHTML = `<option value="">Select Category</option>`;
        if (selected) {
          selected.categories.forEach(c => {
            categorySelect.innerHTML += `<option value="${c}">${c}</option>`;
          });
        }
      };
    }
    loadSections();

    // File preview
    fileInput.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        preview.innerHTML = `<img src="${reader.result}"/>`;
        fileBtn.classList.add("active");
      };
      reader.readAsDataURL(file);
    });

    // Upload logic
    document.getElementById("uploadForm").addEventListener("submit", e => {
      e.preventDefault();

      const formData = new FormData(e.target);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/api/dresses`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          progressContainer.style.display = "block";
          progressBar.style.width = percent + "%";
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          statusText.textContent = "✅ Dress uploaded successfully!";
          statusText.className = "status success";
          progressBar.style.width = "100%";

          setTimeout(() => location.reload(), 1500);
        } else {
          statusText.textContent = "❌ Upload failed!";
          statusText.className = "status error";
        }
      };

      xhr.onerror = () => {
        statusText.textContent = "❌ Network error!";
        statusText.className = "status error";
      };

      xhr.send(formData);
    });

    // Logout
    document.getElementById("logoutBtn").onclick = () => {
      localStorage.removeItem("loggedInUser");
      window.location.href = "login.html";
    };