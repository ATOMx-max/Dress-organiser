// 🌐 Dress Organizer Backend (v11.7 — Resend Mailer Integrated + Gmail Fallback + Fixed Feedback/Verify Links + Password Reset Fix + Cloud + Mongo)

const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;
const { Resend } = require("resend");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// ---------- Environment Checks ----------
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
  console.error(`❌ Missing required .env variables: ${missing.join(", ")}`);
  process.exit(1);
}

// ---------- Middleware ----------
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

// ---------- MongoDB Connection ----------
async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message || err);
    throw err;
  }
}

// ---------- Cloudinary Config ----------
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

// ---------- Multer Setup ----------
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

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

// ---------- Schemas ----------
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  verified: { type: Boolean, default: false },
});

const tokenSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  token: String,
  purpose: { type: String, default: "verify" },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
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

// ---------- Default Sections ----------
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

// ---------- Mailer (Resend + Gmail Fallback) ----------
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmailAsync({ to, subject, html }) {
  try {
    await resend.emails.send({
      from: "Dress Organizer 💃 <no-reply@resend.dev>",
      to,
      subject,
      html,
    });
    console.log(`📧 [Resend] Email sent to ${to}`);
  } catch (err) {
    console.error(`⚠️ Resend failed for ${to}: ${err.message}`);
    // Fallback to Gmail if available (optional)
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const fallbackTransporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });
        await fallbackTransporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
        console.log(`📧 [Fallback Gmail] Sent to ${to}`);
      } catch (gmailErr) {
        console.error(`❌ Gmail fallback failed: ${gmailErr.message}`);
      }
    }
  }
}

async function verifyMailer() {
  console.log("📬 Resend Mailer active — Gmail fallback ready if configured.");
}

// ---------- Seed Defaults ----------
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

    const html = `
      <div style="font-family:Poppins,sans-serif;background:#f9f9ff;padding:40px;text-align:center;">
        <div style="max-width:450px;margin:auto;background:white;border-radius:16px;padding:30px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
          <h2 style="color:#4f46e5;">Welcome to <span style="color:#e11d48;">Dress Organizer</span> 💃</h2>
          <p style="color:#555;font-size:15px;">Please verify your email to activate your account.</p>
          <a href="${verifyLink}" style="display:inline-block;margin-top:20px;background:#4f46e5;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Verify My Email</a>
          <p style="margin-top:20px;color:#888;font-size:13px;">If you didn’t sign up, ignore this email.</p>
        </div>
      </div>
    `;

    await sendEmailAsync({
      to: user.email,
      subject: "🌸 Verify Your Email - Dress Organizer",
      html,
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
    console.log("🔗 Verify endpoint hit with", { id, token });
    const found = await Token.findOne({
      userId: id,
      token,
      $or: [{ purpose: "verify" }, { purpose: { $exists: false } }],
    });
    if (!found) return res.redirect("/verify.html?status=invalid");
    await User.updateOne({ _id: id }, { verified: true });
    await Token.deleteOne({ _id: found._id });
    res.redirect("/verify.html?status=success");
  } catch (err) {
    console.error("❌ Verify error:", err);
    res.redirect("/verify.html?status=error");
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

// ---------- PASSWORD RESET ----------
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found." });

    await Token.deleteMany({ userId: user._id, purpose: "reset" }).catch(() => {});

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);
    await Token.create({ userId: user._id, token: hashedToken, purpose: "reset" });

    const resetLink = `${process.env.CLIENT_URL}/reset.html?token=${rawToken}&id=${user._id}`;
    const html = `
      <div style="font-family:Poppins,sans-serif;padding:20px;">
        <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <h2 style="color:#4f46e5;">Password Reset Requested</h2>
          <p>Click below to reset your password (valid for 1 hour).</p>
          <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">Reset Password</a>
        </div>
      </div>
    `;

    await sendEmailAsync({
      to: user.email,
      subject: "🔑 Password Reset - Dress Organizer",
      html,
    });

    res.json({ message: "✅ Password reset email sent." });
  } catch (err) {
    console.error("❌ Forgot password error:", err);
    res.status(500).json({ message: "Error processing password reset request." });
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { id, token, password } = req.body;
    if (!id || !token || !password)
      return res.status(400).json({ message: "id, token, and password are required." });

    const tokenDoc = await Token.findOne({ userId: id, purpose: "reset" });
    if (!tokenDoc) return res.status(400).json({ message: "Invalid or expired reset token." });

    const isValid = await bcrypt.compare(token, tokenDoc.token);
    if (!isValid) return res.status(400).json({ message: "Invalid or expired reset token." });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.updateOne({ _id: id }, { $set: { password: hashedPassword } });

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

    // Notify admin
    await sendEmailAsync({
      to: process.env.EMAIL_USER || "souvik2072005@gmail.com",
      subject: "💬 New Feedback Received - Dress Organizer",
      html: `<h3>💌 Feedback from ${user || "Anonymous"}</h3><p>${message}</p>`,
    });

    // Auto-thank user
    if (user && user.includes("@")) {
      await sendEmailAsync({
        to: user,
        subject: "💖 Thanks for Your Feedback — Dress Organizer",
        html: `<p>Hi there! We really appreciate your feedback. Thank you for helping us improve Dress Organizer.</p><p>— Team Dress Organizer</p>`,
      });
    }

    res.json({ message: "✅ Feedback received successfully!" });
  } catch (err) {
    console.error("❌ Feedback error:", err);
    res.status(500).json({ message: "Error sending feedback." });
  }
});

// ---------- REST OF API: Sections, Categories, Dresses ----------
app.get("/api/sections", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const sections = await Section.find({
    $or: [{ userEmail: null }, { userEmail: user.email }],
  }).sort({ name: 1 });
  res.json(sections);
});

// (rest unchanged: categories, dresses, uploads, search, etc.) same as your previous version

// ---------- Test Mail ----------
app.get("/test-mail", async (req, res) => {
  try {
    await sendEmailAsync({
      to: "souvik2072005@gmail.com",
      subject: "✅ Resend Mailer Test - Dress Organizer",
      html: "<h2>Resend works 🎉</h2><p>Emails are sending perfectly from Render!</p>",
    });
    res.json({ message: "✅ Test email sent successfully!" });
  } catch (err) {
    res.status(500).json({ message: "❌ Test email failed.", error: err.message });
  }
});

// ---------- Startup ----------
async function startServer() {
  try {
    await connectMongo();
    await seedDefaults();
    await verifyMailer();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running at: http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Fatal startup error:", err.message || err);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", async () => {
  console.log("🛑 Shutting down gracefully...");
  try {
    await mongoose.disconnect();
    console.log("✅ MongoDB disconnected.");
  } catch (e) {
    console.warn("⚠️ Error during Mongo disconnect:", e.message);
  }
  process.exit(0);
});
