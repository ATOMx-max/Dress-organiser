// 🌐 Dress Organizer Backend (v11.3 — Corrected startup & DB/Email/Cloudinary checks; password reset added; all features preserved)

const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const cloudinary = require("cloudinary").v2;
const crypto = require("crypto");
const nodemailer = require("nodemailer");




const app = express();
const PORT = process.env.PORT || 8080;

// ---------- Startup checks for required environment variables ----------
const requiredEnv = [
  "MONGO_URI",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLIENT_URL",
  "RESEND_API_KEY",
];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `❌ Missing required .env variables: ${missing.join(
      ", "
    )}\nPlease add them and restart the server.`
  );
  process.exit(1);
}

// --- Middleware ---
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: "7mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: true,
  })
);

// --- MongoDB Connection helper (robust) ---
async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message || err);
    throw err;
  }
}

// --- Cloudinary Config ---
try {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} catch (err) {
  console.error("❌ Cloudinary configuration error:", err.message || err);
  process.exit(1);
}

// --- Ensure uploads folder exists ---
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// --- Multer Setup ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("❌ Only image files are allowed!"));
    }
    cb(null, true);
  },
});

// --- Schemas ---
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  verified: { type: Boolean, default: false },
});

const tokenSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  token: String,
  purpose: { type: String, default: "verify" }, // 'verify' or 'reset'
  createdAt: { type: Date, default: Date.now, expires: 3600 }, // 1 hour TTL
});

const sectionSchema = new mongoose.Schema({
  name: String,
  categories: [String],
  userEmail: { type: String, default: null }, // null = shared default
});

const dressSchema = new mongoose.Schema({
  name: String,
  section: String,
  category: String,
  imageUrl: String,
  userEmail: String,
  createdAt: { type: Date, default: Date.now },
});

const feedbackSchema = new mongoose.Schema({
  user: String,
  message: String,
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Token = mongoose.model("Token", tokenSchema);
const Section = mongoose.model("Section", sectionSchema);
const Dress = mongoose.model("Dress", dressSchema);
const Feedback = mongoose.model("Feedback", feedbackSchema);

// --- 🎯 Default Sections ---
const defaultSections = [
  {
    name: "Jewelry",
    categories: ["Earrings", "Necklaces", "Bracelets", "Rings", "Anklets"],
  },
  {
    name: "Dresses",
    categories: ["Casual", "Party", "Traditional", "Formal", "Summer"],
  },
  {
    name: "Accessories",
    categories: ["Bags", "Belts", "Scarves", "Watches", "Hats"],
  },
  {
    name: "Shoes",
    categories: ["Sneakers", "Heels", "Flats", "Boots", "Sandals"],
  },
];

// --- Mailer ---
async function sendEmail({ to, subject, html }) {
  // 1️⃣ Try Resend first
  try {
    console.log(`📨 Trying Resend for: ${to}`);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Dress Organizer <onboarding@resend.dev>",
      to,
      subject,
      html,
    });
    console.log(`✅ Resend email sent to ${to}`);
    return; // stop here if successful
  } catch (err) {
    console.error("⚠️ Resend failed, switching to Gmail fallback:", err.message || err);
  }

  // 2️⃣ Gmail fallback (Nodemailer)
  try {
    console.log(`📬 Sending via Gmail fallback to: ${to}`);
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Dress Organizer" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log(`✅ Gmail fallback email sent to ${to}`);
  } catch (gmailErr) {
    console.error("❌ Gmail fallback failed:", gmailErr.message || gmailErr);
  }
}

// --- Seed global defaults ---
async function seedDefaults() {
  const count = await Section.countDocuments({ userEmail: null });
  if (count === 0) {
    await Section.insertMany(defaultSections.map((s) => ({ ...s, userEmail: null })));
    console.log("🌱 Default global sections added.");
  }
}

// ---------- AUTH ROUTES ----------
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists." });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed });

    const token = crypto.randomBytes(32).toString("hex");
    await Token.create({ userId: user._id, token, purpose: "verify" });

    const verifyLink = `${process.env.CLIENT_URL}/verify?token=${token}&id=${user._id}`;

    // ✨ Stylish HTML Email
    const htmlContent = `
      <div style="font-family: Poppins, sans-serif; background: #f9f9ff; padding: 40px; text-align: center;">
        <div style="max-width: 450px; margin: auto; background: white; border-radius: 16px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <h2 style="color: #4f46e5;">Welcome to <span style="color:#e11d48;">Dress Organizer</span> 💃</h2>
          <p style="color: #555; font-size: 15px;">Thanks for signing up! Please verify your email to activate your account and start organizing your outfits.</p>
          <a href="${verifyLink}" style="display:inline-block;margin-top:20px;background:#4f46e5;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">
            Verify My Email
          </a>
          <p style="margin-top:20px;color:#888;font-size:13px;">If you didn’t create this account, you can safely ignore this email.</p>
        </div>
        <p style="margin-top:30px;color:#aaa;font-size:12px;">© 2025 Dress Organizer | All Rights Reserved</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: "🌸 Verify Your Email - Dress Organizer",
      html: htmlContent,
    });

    res.json({ message: "✅ Registered successfully! Please check your email for verification." });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ message: "Server error during registration." });
  }
});

app.get("/verify", async (req, res) => {
  try {
    const { token, id } = req.query;
    // Accept tokens with purpose 'verify' OR tokens that lack purpose for backward compatibility
    const found = await Token.findOne({ userId: id, token, $or: [{ purpose: "verify" }, { purpose: { $exists: false } }] });
    if (!found) return res.redirect("/verify.html?status=invalid");
    await User.updateOne({ _id: id }, { verified: true });
    await Token.deleteOne({ _id: found._id });
    res.redirect("/verify.html?status=success");
  } catch (err) {
    console.error("❌ Verify error:", err);
    res.redirect("/verify.html?status=error");
  }
});
app.get("/verify-email", async (req, res) => {
  try {
    const { token, id } = req.query;
    const found = await Token.findOne({ userId: id, token, purpose: "verify" });
    if (!found) return res.status(400).json({ success: false, message: "Invalid or expired token." });
    await User.updateOne({ _id: id }, { verified: true });
    await Token.deleteOne({ _id: found._id });
    res.json({ success: true, message: "Email verified successfully." });
  } catch (err) {
    console.error("❌ Verify-email error:", err);
    res.status(500).json({ success: false, message: "Verification failed." });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found." });
    if (!user.verified) return res.status(401).json({ message: "Email not verified." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Invalid password." });

    req.session.user = user;
    res.json({ message: "✅ Login successful", user });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Login failed." });
  }
});

// ---------- PASSWORD RESET (Added) ----------
// 1) Request reset: sends email with link to /reset.html?token=...&id=...
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found." });

    // Remove any previous reset tokens for this user
    await Token.deleteMany({ userId: user._id, purpose: "reset" });

    // generate a raw token (sent to user) and store a hashed token for safety
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);

    await Token.create({ userId: user._id, token: hashedToken, purpose: "reset" });

    const resetLink = `${process.env.CLIENT_URL}/reset.html?token=${rawToken}&id=${user._id}`;

    const html = `
      <div style="font-family:Poppins,sans-serif;padding:20px;">
        <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <h2 style="color:#4f46e5;">Password reset requested</h2>
          <p style="color:#333;">Click the button below to reset your password. This link is valid for 1 hour.</p>
          <div style="text-align:center;margin-top:20px;">
            <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
          </div>
          <p style="color:#777;margin-top:18px;font-size:13px;">If you didn't request this, you can ignore this email.</p>
        </div>
        <p style="text-align:center;color:#aaa;font-size:12px;margin-top:12px;">© 2025 Dress Organizer</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: "🔑 Password Reset Request - Dress Organizer",
      html,
    });


    res.json({ message: "✅ Password reset email sent." });
  } catch (err) {
    console.error("❌ Forgot password error:", err);
    res.status(500).json({ message: "Error processing password reset request." });
  }
});

// 2) Reset password: verify token and update password (called from reset.html form)
app.post("/reset-password", async (req, res) => {
  try {
    const { id, token, password } = req.body;

    // Validate input
    if (!id || !token || !password)
      return res.status(400).json({ message: "Missing required fields." });

    // Find reset token for this user
    const tokenDoc = await Token.findOne({ userId: id, purpose: "reset" });
    if (!tokenDoc)
      return res.status(400).json({ message: "Invalid or expired reset token." });

    // Compare provided token with stored hashed token
    const isValid = await bcrypt.compare(token, tokenDoc.token);
    if (!isValid)
      return res.status(400).json({ message: "Invalid or expired reset token." });

    // Hash new password and update user
    const hashed = await bcrypt.hash(password, 10);
    await User.updateOne({ _id: id }, { $set: { password: hashed } });

    // Delete the used reset token
    await Token.deleteOne({ _id: tokenDoc._id });

    res.json({ message: "✅ Password reset successful." });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    res.status(500).json({ message: "Error resetting password." });
  }
});


// ---------- FEEDBACK ----------
app.post("/feedback", async (req, res) => {
  try {
    const { user, message } = req.body;
    if (!message) return res.status(400).json({ message: "Feedback message required." });

    await Feedback.create({ user: user || "Anonymous", message });

    await sendEmail({
      to: process.env.FEEDBACK_EMAIL || "dressorganizer.team@gmail.com",
      subject: "💬 New Feedback Received - Dress Organizer",
      html: `
        <div style="font-family:Poppins,sans-serif;padding:20px;">
          <h3 style="color:#4f46e5;">💌 New Feedback from ${user || "Anonymous"}</h3>
          <p style="color:#333;white-space:pre-line;">${message}</p>
        </div>
      `,
    });

    res.json({ message: "✅ Feedback received and emailed to admin!" });
  } catch (err) {
    console.error("❌ Feedback error:", err);
    res.status(500).json({ message: "Error sending feedback." });
  }
});

// ---------- SECTIONS & CATEGORIES ----------
app.get("/api/sections", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const sections = await Section.find({
    $or: [{ userEmail: null }, { userEmail: user.email }],
  }).sort({ name: 1 });
  res.json(sections);
});

app.post("/api/sections", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Section name required." });

  const existing = await Section.findOne({
    name,
    $or: [{ userEmail: null }, { userEmail: user.email }],
  });
  if (existing) return res.status(400).json({ message: "Section already exists." });

  await Section.create({ name, categories: [], userEmail: user.email });
  res.json({ message: `✅ Section '${name}' added.` });
});

app.delete("/api/sections/:name", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const name = req.params.name;
  const section = await Section.findOne({ name, userEmail: user.email });
  if (!section)
    return res.status(403).json({ message: "Cannot delete default/shared sections." });

  // delete associated dresses + Cloudinary cleanup
  const dresses = await Dress.find({ section: name, userEmail: user.email });
  for (const d of dresses) {
    const urlParts = d.imageUrl.split("/");
    const fileWithExt = urlParts[urlParts.length - 1];
    const publicId = "dress_organizer/" + fileWithExt.split(".")[0];
    await cloudinary.uploader.destroy(publicId).catch(() => {});
  }

  await Dress.deleteMany({ section: name, userEmail: user.email });
  await Section.deleteOne({ name, userEmail: user.email });

  res.json({ message: `🗑️ Section '${name}' deleted (with all related dresses).` });
});

app.post("/api/categories", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const { sectionName, category } = req.body;
    const sec = await Section.findOne({
      name: sectionName,
      $or: [{ userEmail: null }, { userEmail: user.email }],
    });

    if (!sec) return res.status(404).json({ message: "Section not found." });
    if (sec.categories.includes(category))
      return res.status(400).json({ message: "Category already exists." });

    sec.categories.push(category);
    await sec.save();

    res.json({ message: `✅ Category '${category}' added to '${sectionName}'.` });
  } catch (err) {
    console.error("❌ Add Category Error:", err);
    res.status(500).json({ message: "Error adding category." });
  }
});

app.delete("/api/categories/:section/:category", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const { section, category } = req.params;

    // Check if category belongs to default section and is protected
    const defaultSection = defaultSections.find((s) => s.name === section);
    if (defaultSection && defaultSection.categories.includes(category)) {
      return res.status(403).json({ message: `⚠️ Cannot delete default category '${category}' from '${section}'.` });
    }

    const sec = await Section.findOne({ name: section });
    if (!sec) return res.status(404).json({ message: "Section not found." });

    sec.categories = sec.categories.filter((c) => c !== category);
    await sec.save();

    await Dress.deleteMany({ section, category, userEmail: user.email });
    res.json({ message: `🗑️ Category '${category}' removed from '${section}'.` });
  } catch (err) {
    console.error("❌ Delete Category Error:", err);
    res.status(500).json({ message: "Error deleting category." });
  }
});

// ---------- DRESS UPLOADS ----------
app.post(
  "/api/dresses",
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const { name, section, category } = req.body;
      const user = req.session.user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (!req.file) return res.status(400).json({ message: "⚠️ No image uploaded." });

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "dress_organizer",
      });

      const dress = await Dress.create({
        name,
        section,
        category,
        imageUrl: result.secure_url,
        userEmail: user.email,
      });

      fs.unlinkSync(req.file.path);
      res.json({ message: "✅ Dress uploaded successfully!", dress });
    } catch (error) {
      console.error("❌ Upload Error:", error);
      res.status(500).json({ message: "Server error during upload." });
    }
  }
);

app.get("/api/dresses", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const dresses = await Dress.find({ userEmail: user.email }).sort({ createdAt: -1 });
    res.json(dresses);
  } catch (err) {
    console.error("❌ Fetch Dresses Error:", err);
    res.status(500).json({ message: "Server error fetching dresses." });
  }
});

// ---------- 🔍 SEARCH DRESSES ----------
app.get("/api/search", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const { query } = req.query;
    if (!query || query.trim() === "") return res.json([]);

    const results = await Dress.find({
      userEmail: user.email,
      $or: [
        { name: { $regex: query, $options: "i" } },
        { section: { $regex: query, $options: "i" } },
        { category: { $regex: query, $options: "i" } },
      ],
    }).sort({ createdAt: -1 });

    res.json(results);
  } catch (err) {
    console.error("❌ Search Error:", err);
    res.status(500).json({ message: "Server error during search." });
  }
});

// ---------- DELETE DRESS (Cloudinary + MongoDB) ----------
app.delete("/api/dresses/:id", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const dress = await Dress.findById(req.params.id);
    if (!dress) return res.status(404).json({ message: "Dress not found." });
    if (dress.userEmail !== user.email) return res.status(403).json({ message: "Forbidden." });

    const urlParts = dress.imageUrl.split("/");
    const fileWithExt = urlParts[urlParts.length - 1];
    const publicId = "dress_organizer/" + fileWithExt.split(".")[0];
    await cloudinary.uploader.destroy(publicId).catch(() => {});

    await Dress.findByIdAndDelete(req.params.id);
    res.json({ message: "🗑️ Dress deleted from database & Cloudinary." });
  } catch (err) {
    console.error("❌ Delete Dress Error:", err);
    res.status(500).json({ message: "Server error during delete." });
  }
});

// ---------- Serve frontend ----------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/verify.html", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/reset.html", (req, res) => res.sendFile(path.join(__dirname, "public", "reset.html")));

// ---------- Startup sequence: connect DB, verify mailer, seed defaults, then listen ----------
async function startServer() {
  try {
    await connectMongo();
    await seedDefaults(); // ✅ Moved above mailer

    app.listen(PORT,"0.0.0.0",() => {
      console.log(`🚀 Server running at: http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Fatal startup error, exiting:", err.message || err);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 SIGINT received — shutting down gracefully.");
  try {
    await mongoose.disconnect();
    console.log("✅ MongoDB disconnected.");
  } catch (e) {
    console.warn("⚠️ Error during Mongo disconnect:", e.message || e);
  }
  process.exit(0);
});
