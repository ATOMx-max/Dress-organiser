// backend-v11.4.js
// 🌐 Dress Organizer Backend (v11.4)
// - safer hashed tokens for verify/reset
// - token comparison via bcrypt.compare
// - sessionStore exposed to remove all sessions for a user on password reset / account delete
// - all features preserved

require("dotenv").config();
// =========
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const multer = require("multer");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 8080;

// ---------- Startup checks for required environment variables ----------
function extractEmailFromEnv() {
  const from = process.env.EMAIL_FROM || "";
  const match = from.match(/<\s*([^>]+)\s*>/);
  if (match && match[1]) return match[1];
  if (/\S+@\S+\.\S+/.test(from)) return from;
  return "souvik2072005@gmail.com";
}

if (typeof fetch === "undefined") {
  global.fetch = (...args) =>
    import("node-fetch").then(({ default: f }) => f(...args));
}

const requiredEnv = [
  "MONGO_URI",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLIENT_URL",
  "BREVO_API_KEY",
  "EMAIL_FROM",
];

const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `❌ Missing required .env variables: ${missing.join(", ")}\nPlease add them and restart the server.`
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

// trust proxy for secure cookies if production
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));


// Create a session store instance and keep a reference so we can manipulate session documents
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGO_URI,
  collectionName: "sessions",
  ttl: 14 * 24 * 60 * 60,
  autoRemove: "native",
});

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  })
);

// --- MongoDB helper ---
async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message || err);
    throw err;
  }
}

// --- Cloudinary config ---
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

// ensure uploads folder
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// multer setup
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
  email: { type: String, required: true, index: true },
  password: { type: String, required: true },
  verified: { type: Boolean, default: false },
  name: { type: String, default: "" },
  username: { type: String, default: "" },
  profilePic: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  passwordChangedAt: { type: Date },
});

const tokenSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  token: String, // store hashed token
  purpose: { type: String, default: "verify" }, // 'verify' or 'reset'
  createdAt: { type: Date, default: Date.now, expires: 3600 }, // 1 hour TTL
});

const sectionSchema = new mongoose.Schema({
  name: String,
  categories: [String],
  userEmail: { type: String, default: null },
});

const dressSchema = new mongoose.Schema({
  name: String,
  section: String,
  category: String,
  imageUrl: String,
  userEmail: String,
  isFavorite: { type: Boolean, default: false },
  tags: { type: [String], default: [] },
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

// default sections
const defaultSections = [
  { name: "Jewelry", categories: ["Earrings", "Necklaces", "Bracelets", "Rings", "Anklets"] },
  { name: "Dresses", categories: ["Casual", "Party", "Traditional", "Formal", "Summer"] },
  { name: "Accessories", categories: ["Bags", "Belts", "Scarves", "Watches", "Hats"] },
  { name: "Shoes", categories: ["Sneakers", "Heels", "Flats", "Boots", "Sandals"] },
];

// mailer via Brevo
async function sendEmail({ to, subject, html }) {
  try {
    console.log(`📬 Sending email via Brevo API to: ${to}`);
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Dress Organizer", email: extractEmailFromEnv() },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    const data = await resp.json().catch(() => null);
    if (resp.ok) {
      console.log(`✅ Email sent successfully via Brevo API to ${to}`);
    } else {
      console.error("❌ Brevo API failed:", resp.status, data);
    }
  } catch (err) {
    console.error("❌ Brevo API error:", err.message || err);
  }
}

// ---------- AUTH ROUTES ----------

// Register: create user, create hashed verify token, send raw token via email
app.post("/register", async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required." });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name?.trim() || "",
      username: username?.trim() || "",
      email,
      password: hashedPassword,
    });

    // generate raw token and store hashed version
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);

    await Token.create({ userId: user._id, token: hashedToken, purpose: "verify" });

    const baseURL = process.env.CLIENT_URL.replace(/\/+$/, "");
    const verifyLink = `${baseURL}/verify?token=${rawToken}&id=${user._id}`;

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

    await sendEmail({ to: user.email, subject: "🌸 Verify Your Email - Dress Organizer", html: htmlContent });

    res.json({ message: "✅ Registered successfully! Please check your email for verification." });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ message: "Server error during registration." });
  }
});

// Verify (link-based): token is raw in query; we find tokenDoc by userId & purpose then compare
app.get("/verify", async (req, res) => {
  try {
    const { token, id } = req.query;
    if (!id || !token) return res.redirect("/verify.html?status=invalid");

    const tokenDoc = await Token.findOne({ userId: id, purpose: "verify" });
    if (!tokenDoc) return res.redirect("/verify.html?status=invalid");

    const valid = await bcrypt.compare(token, tokenDoc.token);
    if (!valid) {
      // token invalid
      return res.redirect("/verify.html?status=invalid");
    }

    await User.updateOne({ _id: id }, { verified: true });
    await Token.deleteOne({ _id: tokenDoc._id });

    res.redirect("/verify.html?status=success");
  } catch (err) {
    console.error("❌ Verify error:", err);
    res.redirect("/verify.html?status=error");
  }
});
app.use(express.static("public"));


// API verify for client apps (returns JSON)
app.get("/verify-email", async (req, res) => {
  try {
    const { token, id } = req.query;
    if (!id || !token) return res.status(400).json({ success: false, message: "Missing fields" });

    const tokenDoc = await Token.findOne({ userId: id, purpose: "verify" });
    if (!tokenDoc) return res.status(400).json({ success: false, message: "Invalid or expired token." });

    const valid = await bcrypt.compare(token, tokenDoc.token);
    if (!valid) return res.status(400).json({ success: false, message: "Invalid or expired token." });

    await User.updateOne({ _id: id }, { verified: true });
    await Token.deleteOne({ _id: tokenDoc._id });

    res.json({ success: true, message: "Email verified successfully." });
  } catch (err) {
    console.error("❌ Verify-email error:", err);
    res.status(500).json({ success: false, message: "Verification failed." });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found." });
    if (!user.verified) return res.status(401).json({ message: "Email not verified." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Invalid password." });

    // store safe session info (no password)
    req.session.user = {
      _id: user._id.toString(),
      name: user.name,
      username: user.username,
      email: user.email,
      verified: user.verified,
      profilePic: user.profilePic || "",
      createdAt: user.createdAt,
    };

    res.json({ message: "✅ Login successful", user: req.session.user });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Login failed." });
  }
});

// Get current user
app.get("/api/me", (req, res) => {
  try {
    if (!req.session || !req.session.user) return res.status(401).json({ message: "Unauthorized" });

    const { name, username, email, verified, _id, createdAt, profilePic } = req.session.user;
    res.json({
      name: name || "",
      username: username || "",
      email,
      verified,
      id: _id,
      joined: createdAt,
      profilePic: profilePic || "",
    });
  } catch (err) {
    console.error("❌ /api/me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Logout
app.post("/logout", (req, res) => {
  try {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };

    req.session.destroy((err) => {
      if (err) {
        console.error("❌ Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("sid", cookieOptions);
      res.json({ message: "Logged out" });
    });
  } catch (err) {
    console.error("❌ Logout error:", err);
    res.status(500).json({ message: "Logout failed" });
  }
});

// Update name
app.post("/api/update-name", async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });
    const { name } = req.body;
    if (!name || name.trim() === "") return res.status(400).json({ message: "Name cannot be empty" });

    await User.findByIdAndUpdate(req.session.user._id, { name: name.trim() });
    req.session.user.name = name.trim();
    res.json({ success: true, message: "Name updated successfully" });
  } catch (err) {
    console.error("❌ Update name error:", err);
    res.status(500).json({ message: "Server error updating name." });
  }
});

// Update username
app.post("/api/update-username", async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });
    const { username } = req.body;
    if (!username || username.trim() === "") return res.status(400).json({ message: "Username cannot be empty" });

    await User.findByIdAndUpdate(req.session.user._id, { username: username.trim() });
    req.session.user.username = username.trim();
    res.json({ success: true, message: "Username updated successfully" });
  } catch (err) {
    console.error("❌ Update username error:", err);
    res.status(500).json({ message: "Server error updating username" });
  }
});

// Change password (user must be logged in)
app.post("/api/change-password", async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Both passwords required" });

    const user = await User.findById(req.session.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) return res.status(400).json({ message: "Current password incorrect" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = Date.now();
    await user.save();

    // Destroy all sessions for this user so old sessions are invalidated
    try {
      await sessionStore.client.db().collection("sessions").deleteMany({ "session.user.email": user.email });
    } catch (e) {
      console.warn("⚠️ Could not remove other sessions from store:", e.message || e);
    }

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("❌ Change password error:", err);
    res.status(500).json({ message: "Server error updating password" });
  }
});

// Backup export
app.get("/api/backup", async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });

    const email = req.session.user.email;
    const sections = await Section.find({ userEmail: email });
    const dresses = await Dress.find({ userEmail: email });

    const backupData = {
      exportedAt: new Date(),
      user: { name: req.session.user.name, username: req.session.user.username, email: req.session.user.email },
      sections,
      dresses,
    };

    res.attachment("backup.json");
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    console.error("❌ Backup Error:", err);
    res.status(500).json({ message: "Error exporting backup." });
  }
});

// Restore backup
app.post("/api/restore", async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });

    const email = req.session.user.email;
    const { sections, dresses } = req.body;
    if (!sections || !dresses) return res.status(400).json({ message: "Invalid restore data" });

    await Section.deleteMany({ userEmail: email });
    await Dress.deleteMany({ userEmail: email });

    let addedSections = 0;
    let addedDresses = 0;

    for (const s of sections) {
      await Section.create({ name: s.name, categories: s.categories, userEmail: email });
      addedSections++;
    }

    for (const d of dresses) {
      await Dress.create({
        name: d.name,
        section: d.section,
        category: d.category,
        imageUrl: d.imageUrl,
        userEmail: email,
        tags: d.tags || [],
        isFavorite: d.isFavorite || false,
        createdAt: d.createdAt || new Date(),
      });
      addedDresses++;
    }

    res.json({ success: true, message: "Restore completed", addedSections, addedDresses });
  } catch (err) {
    console.error("❌ Restore error:", err);
    res.status(500).json({ message: "Restore failed" });
  }
});

// Upload profile pic
app.post(
  "/api/upload-profile-pic",
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });
      if (!req.file) return res.status(400).json({ message: "No image uploaded" });

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "dress_organizer/profile",
        format: "jpg",
      });

      await User.findByIdAndUpdate(req.session.user._id, { profilePic: result.secure_url });
      req.session.user.profilePic = result.secure_url;

      fs.unlinkSync(req.file.path);

      res.json({ success: true, message: "Profile picture updated", url: result.secure_url });
    } catch (error) {
      console.error("❌ Profile Pic Upload Error:", error);
      res.status(500).json({ message: "Server error uploading profile photo" });
    }
  }
);

// Resend verification (user must be logged in)
app.post("/api/resend-verification", async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(req.session.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.verified) return res.status(400).json({ message: "Already verified" });

    // remove any previous verify tokens
    await Token.deleteMany({ userId: user._id, purpose: "verify" });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);
    await Token.create({ userId: user._id, token: hashedToken, purpose: "verify" });

    const verifyLink = `${process.env.CLIENT_URL.replace(/\/+$/, "")}/verify?token=${rawToken}&id=${user._id}`;

    await sendEmail({ to: user.email, subject: "🌟 Verify Your Email", html: `Click the link to verify: <a href="${verifyLink}">Verify</a>` });

    res.json({ success: true, message: "Verification email sent" });
  } catch (err) {
    console.error("❌ Verification resend error:", err);
    res.status(500).json({ message: "Server error sending verification" });
  }
});

// Delete account
app.delete("/api/delete-account", async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });

    const sessionUser = req.session.user;
    const user = await User.findById(sessionUser._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Delete dresses + cloudinary images
    const dresses = await Dress.find({ userEmail: user.email });
    for (const d of dresses) {
      try {
        const file = d.imageUrl.split("/").pop().split(".")[0];
        const publicId = "dress_organizer/" + file;
        await cloudinary.uploader.destroy(publicId).catch(() => {});
      } catch (e) {}
    }
    await Dress.deleteMany({ userEmail: user.email });

    // Delete user sections
    await Section.deleteMany({ userEmail: user.email });

    // Delete user
    await User.deleteOne({ _id: user._id });

    // remove all sessions for this user
    try {
      await sessionStore.client.db().collection("sessions").deleteMany({ "session.user.email": user.email });
    } catch (e) {
      console.warn("⚠️ Could not remove sessions from store:", e.message || e);
    }

    // clear current session
    req.session.destroy(() => {});
    res.clearCookie("sid", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax" });

    res.json({ success: true, message: "Account permanently deleted" });
  } catch (err) {
    console.error("❌ Delete account error:", err);
    res.status(500).json({ message: "Server error deleting account" });
  }
});

// Stats
app.get("/api/stats", async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });

    const userEmail = req.session.user.email;
    const dressCount = await Dress.countDocuments({ userEmail });
    const sections = await Section.find({ $or: [{ userEmail: null }, { userEmail }] });

    let categoryTotal = 0;
    sections.forEach((s) => {
      if (Array.isArray(s.categories)) categoryTotal += s.categories.length;
    });

    const recentUploads = await Dress.find({ userEmail }).sort({ createdAt: -1 }).limit(5);

    res.json({ dresses: dressCount, sections: sections.length, categories: categoryTotal, recent: recentUploads });
  } catch (err) {
    console.error("❌ Stats Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Reset defaults
app.post("/api/reset-defaults", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  await Section.deleteMany({ userEmail: user.email });
  await Dress.deleteMany({ userEmail: user.email });

  res.json({ message: "✅ All sections reset to default." });
});

// ---------- PASSWORD RESET (forgot + reset) ----------
// 1) forgot-password: generate raw reset token, store hashed in Token, email raw token link
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found." });

    await Token.deleteMany({ userId: user._id, purpose: "reset" });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);
    await Token.create({ userId: user._id, token: hashedToken, purpose: "reset" });

    const resetLink = `${process.env.CLIENT_URL.replace(/\/+$/, "")}/reset.html?token=${rawToken}&id=${user._id}`;

    const html = `
      <div style="font-family:Poppins,sans-serif;padding:20px;">
        <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <h2 style="color:#4f46e5;">Password Reset Requested</h2>
          <p style="color:#333;">Click the button below to reset your password. This link is valid for 1 hour.</p>
          <p style="text-align:center;margin-top:20px;">
            <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
          </p>
          <p style="color:#888;font-size:12px;margin-top:20px;">If the button doesn’t work, copy and paste this link in your browser:<br><br><span style="color:#4f46e5;word-break:break-all;">${resetLink}</span></p>
        </div>
      </div>
    `;

    await sendEmail({ to: user.email, subject: "🔑 Password Reset Request - Dress Organizer", html });

    res.json({ message: "✅ Password reset email sent." });
  } catch (err) {
    console.error("❌ Forgot password error:", err);
    res.status(500).json({ message: "Error processing password reset request." });
  }
});

// 2) reset-password: compare raw token to hashed stored token and update password
app.post("/reset-password", async (req, res) => {
  try {
    const { id, token, password } = req.body;
    if (!id || !token || !password) return res.status(400).json({ message: "Missing required fields." });

    const tokenDoc = await Token.findOne({ userId: id, purpose: "reset" });
    if (!tokenDoc) return res.status(400).json({ message: "Invalid or expired reset token." });

    const isValid = await bcrypt.compare(token, tokenDoc.token);
    if (!isValid) return res.status(400).json({ message: "Invalid or expired reset token." });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.updateOne({ _id: id }, { $set: { password: hashedPassword, passwordChangedAt: Date.now() } });

    // delete used token
    await Token.deleteOne({ _id: tokenDoc._id });

    // remove all sessions for this user so old sessions can't be used
    try {
      const user = await User.findById(id);
      if (user && sessionStore?.client) {
        await sessionStore.client.db().collection("sessions").deleteMany({ "session.user.email": user.email });
      }
    } catch (e) {
      console.warn("⚠️ Could not remove sessions from store after reset:", e.message || e);
    }

    // destroy current session if any
    req.session?.destroy(() => {});

    res.json({ message: "✅ Password reset successful." });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    res.status(500).json({ message: "Error resetting password." });
  }
});

// Feedback
app.post("/feedback", async (req, res) => {
  try {
    const { user, message } = req.body;
    if (!message) return res.status(400).json({ message: "Feedback message required." });

    await Feedback.create({ user: user || "Anonymous", message });

    await sendEmail({
      to: process.env.FEEDBACK_EMAIL || "dressorganizer.team@gmail.com",
      subject: "💬 New Feedback Received - Dress Organizer",
      html: `<div style="font-family:Poppins,sans-serif;padding:20px;"><h3 style="color:#4f46e5;">💌 New Feedback from ${user || "Anonymous"}</h3><p style="color:#333;white-space:pre-line;">${message}</p></div>`,
    });

    res.json({ message: "✅ Feedback received and emailed to admin!" });
  } catch (err) {
    console.error("❌ Feedback error:", err);
    res.status(500).json({ message: "Error sending feedback." });
  }
});

// Sections & categories routes (kept same)
app.get("/api/sections", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const sections = await Section.find({ $or: [{ userEmail: null }, { userEmail: user.email }] }).sort({ name: 1 });
  res.json(sections);
});

app.post("/api/sections", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Section name required." });

  const existing = await Section.findOne({ name, $or: [{ userEmail: null }, { userEmail: user.email }] });
  if (existing) return res.status(400).json({ message: "Section already exists." });

  await Section.create({ name, categories: [], userEmail: user.email });
  res.json({ message: `✅ Section '${name}' added.` });
});

app.delete("/api/sections/:name", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const name = req.params.name;
  const section = await Section.findOne({ name, userEmail: user.email });
  if (!section) return res.status(403).json({ message: "Cannot delete default/shared sections." });

  const dresses = await Dress.find({ section: name, userEmail: user.email });
  for (const d of dresses) {
    try {
      const urlParts = d.imageUrl.split("/");
      const fileWithExt = urlParts[urlParts.length - 1];
      const publicId = "dress_organizer/" + fileWithExt.split(".")[0];
      await cloudinary.uploader.destroy(publicId).catch(() => {});
    } catch (e) {}
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
    const sec = await Section.findOne({ name: sectionName, $or: [{ userEmail: null }, { userEmail: user.email }] });

    if (!sec) return res.status(404).json({ message: "Section not found." });
    if (sec.categories.includes(category)) return res.status(400).json({ message: "Category already exists." });

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

// Dress uploads
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
        format: "jpg",
      });

      const dress = await Dress.create({ name, section, category, imageUrl: result.secure_url, userEmail: user.email });

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

// Search
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

// Favourites
app.get("/api/favourites", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const dresses = await Dress.find({ userEmail: user.email, isFavorite: true });
    res.json(dresses);
  } catch (err) {
    console.error("Favourite Fetch Error:", err);
    res.status(500).json({ message: "Server error fetching favourites." });
  }
});

// Update dress details
app.put("/api/dresses/:id", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const { name, section, category, tags } = req.body;
    if (!name || !section || !category) return res.status(400).json({ message: "All fields are required." });

    const updated = await Dress.findOneAndUpdate(
      { _id: req.params.id, userEmail: user.email },
      { name, section, category, tags: Array.isArray(tags) ? tags : [] },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Dress not found." });
    res.json({ success: true, dress: updated });
  } catch (err) {
    console.error("Update Dress Error:", err);
    res.status(500).json({ message: "Server error updating dress." });
  }
});

// Delete dress
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

// Toggle favourite
app.put("/api/dresses/:id/favourite", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const dress = await Dress.findById(req.params.id);
    if (!dress) return res.status(404).json({ message: "Dress not found." });

    dress.isFavorite = !dress.isFavorite;
    await dress.save();
    res.json({ success: true, isFavorite: dress.isFavorite });
  } catch (err) {
    console.error("Favourite Error:", err);
    res.status(500).json({ message: "Server error updating favourite." });
  }
});

// Brevo test
app.get("/test-email", async (req, res) => {
  try {
    await sendEmail({
      to: "souvik2072005@gmail.com",
      subject: "📨 Brevo Test Email - Dress Organizer",
      html: "<p>✅ Your Brevo integration is working perfectly!<br>This email was sent via the Brevo SMTP API from Render.</p>",
    });
    res.send("✅ Test email sent successfully! Check your inbox or spam folder.");
  } catch (err) {
    console.error("❌ Test email error:", err);
    res.status(500).send("❌ Failed to send test email.");
  }
});

// Serve frontend files
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/verify.html", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/reset.html", (req, res) => res.sendFile(path.join(__dirname, "public", "reset.html")));
app.get("/dashboard.html", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/upload.html", (req, res) => res.sendFile(path.join(__dirname, "public", "upload.html")));
app.get("/search.html", (req, res) => res.sendFile(path.join(__dirname, "public", "search.html")));
app.get("/manage.html", (req, res) => res.sendFile(path.join(__dirname, "public", "manage.html")));
app.get("/profile.html", (req, res) => res.sendFile(path.join(__dirname, "public", "profile.html")));
app.get("/all-dresses.html", (req, res) => res.sendFile(path.join(__dirname, "public", "all-dresses.html")));

// seed defaults
async function seedDefaults() {
  const count = await Section.countDocuments({ userEmail: null });
  if (count === 0) {
    await Section.insertMany(defaultSections.map((s) => ({ ...s, userEmail: null })));
    console.log("🌱 Default global sections added.");
  }
}

// startup
async function startServer() {
  try {
    await connectMongo();
    await seedDefaults();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running at: http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Fatal startup error, exiting:", err.message || err);
    process.exit(1);
  }
}

startServer();

// graceful shutdown
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
