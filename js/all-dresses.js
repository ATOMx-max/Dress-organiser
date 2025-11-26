// Scripts for all-dresses page (extracted from inline <script>)

const API_URL = window.location.origin.includes("localhost")
      ? "http://localhost:8080"
      : "https://dress-organiser.onrender.com";

    // Redirect if not logged in
    if (!localStorage.getItem("loggedInUser")) {
      window.location.href = "login.html";
    }

    const grid = document.getElementById("grid");
    const emptyMsg = document.getElementById("emptyMsg");

    // Load all dresses
    async function loadDresses() {
      try {
        const res = await fetch(`${API_URL}/api/dresses`, {
          credentials: "include",
        });

        if (res.status === 401) {
          localStorage.removeItem("loggedInUser");
          window.location.href = "login.html";
          return;
        }

        const dresses = await res.json();

        if (dresses.length === 0) {
          emptyMsg.style.display = "block";
          return;
        }

        dresses.forEach((d) => {
          const card = document.createElement("div");
          card.className = "card";

          card.innerHTML = `
            <img src="${d.imageUrl}" alt="${d.name}" />
            <div class="dress-name">${d.name}</div>
            <div class="meta">${d.section} → ${d.category}</div>
            <button class="delete-btn" onclick="deleteDress('${d._id}')">Delete</button>
          `;

          grid.appendChild(card);
        });
      } catch (err) {
        console.error("Error loading dresses:", err);
      }
    }

    loadDresses();

    // Delete a dress
    async function deleteDress(id) {
      if (!confirm("Delete this dress?")) return;

      try {
        const res = await fetch(`${API_URL}/api/dresses/${id}`, {
          method: "DELETE",
          credentials: "include",
        });

        const data = await res.json();

        alert(data.message);
        location.reload();
      } catch (err) {
        alert("❌ Failed to delete.");
      }
    }

    function logout() {
      localStorage.removeItem("loggedInUser");
      window.location.href = "login.html";
    }