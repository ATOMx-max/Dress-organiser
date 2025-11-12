// 🌐 Dress Organizer Backend (v11.8 — Resend + Gmail Fallback + Full Email Fix + Session & Fetch Fix)

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

// ---------- Required ENV ----------
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
    origin: [process.env.CLIENT_URL, "http://localhost:8080"],
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, sameSite: "lax" },
  })
);

// ---------- MongoDB ----------
async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1);
  }
}

// ---------- Cloudinary ----------
try {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log("✅ Cloudinary Configured");
} catch (err) {
  console.error("❌ Cloudinary config error:", err.message);
  process.exit(1);
}

// ---------- Multer ----------
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ---------- Schemas ----------
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  verified: { type: Boolean, default: false },
});

const tokenSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  token: String,
  purpose: String,
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
  { name: "Jewelry", categories: ["Earrings", "Necklaces", "Bracelets", "Rings", "Anklets"] },
  { name: "Dresses", categories: ["Casual", "Party", "Traditional", "Formal", "Summer"] },
  { name: "Accessories", categories: ["Bags", "Belts", "Scarves", "Watches", "Hats"] },
  { name: "Shoes", categories: ["Sneakers", "Heels", "Flats", "Boots", "Sandals"] },
];

// ---------- Mailer (Resend + Gmail fallback) ----------
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmailAsync({ to, subject, html }) {
  try {
    await resend.emails.send({
      from: "Dress Organizer 💃 <no-reply@resend.dev>",
      to,
      subject,
      html,
    });
    console.log(`📧 [Resend] Sent to ${to}`);
  } catch (err) {
    console.error(`⚠️ Resend failed: ${err.message}`);
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const fallback = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });
        await fallback.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
        console.log(`📧 [Fallback Gmail] Sent to ${to}`);
      } catch (gmailErr) {
        console.error(`❌ Gmail fallback failed: ${gmailErr.message}`);
      }
    }
  }
}

// ---------- Seed Defaults ----------
async function seedDefaults() {
  const count = await Section.countDocuments({ userEmail: null });
  if (count === 0) {
    await Section.insertMany(defaultSections.map((s) => ({ ...s, userEmail: null })));
    console.log("🌱 Default sections seeded");
  }
}

// ---------- AUTH ----------
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists." });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed });

    const token = crypto.randomBytes(32).toString("hex");
    await Token.create({ userId: user._id, token, purpose: "verify" });

    const verifyLink = `${process.env.CLIENT_URL}/verify.html?status=success&id=${user._id}&token=${token}`;
    const html = `
      <div style="font-family:Poppins,sans-serif;text-align:center;">
        <h2>Welcome to Dress Organizer 💃</h2>
        <p>Click below to verify your email:</p>
        <a href="${verifyLink}" style="background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">Verify Email</a>
      </div>`;

    await sendEmailAsync({
      to: user.email,
      subject: "🌸 Verify Your Email - Dress Organizer",
      html,
    });

    res.json({ message: "✅ Registered successfully! Please check your email." });
  } catch (err) {
    console.error("❌ Registration error:", err.message);
    res.status(500).json({ message: "Server error during registration." });
  }
});

app.get("/verify", async (req, res) => {
  try {
    const { id, token } = req.query;
    const found = await Token.findOne({ userId: id, token, purpose: "verify" });
    if (!found) return res.redirect("/verify.html?status=invalid");
    await User.updateOne({ _id: id }, { verified: true });
    await Token.deleteOne({ _id: found._id });
    res.redirect("/verify.html?status=success");
  } catch (err) {
    console.error("❌ Verify error:", err.message);
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
    console.error("❌ Login error:", err.message);
    res.status(500).json({ message: "Login failed." });
  }
});

// ---------- PASSWORD RESET ----------
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found." });

    await Token.deleteMany({ userId: user._id, purpose: "reset" });
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);
    await Token.create({ userId: user._id, token: hashedToken, purpose: "reset" });

    const resetLink = `${process.env.CLIENT_URL}/reset.html?token=${rawToken}&id=${user._id}`;
    const html = `
      <div style="font-family:Poppins,sans-serif;">
        <h2>Password Reset Request</h2>
        <p>Click below to reset your password:</p>
        <a href="${resetLink}" style="background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">Reset Password</a>
      </div>`;

    await sendEmailAsync({
      to: user.email,
      subject: "🔑 Reset Your Password - Dress Organizer",
      html,
    });

    res.json({ message: "✅ Password reset email sent." });
  } catch (err) {
    console.error("❌ Forgot password error:", err.message);
    res.status(500).json({ message: "Error processing reset request." });
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { id, token, password } = req.body;
    const tokenDoc = await Token.findOne({ userId: id, purpose: "reset" });
    if (!tokenDoc) return res.status(400).json({ message: "Invalid or expired reset token." });

    const isValid = await bcrypt.compare(token, tokenDoc.token);
    if (!isValid) return res.status(400).json({ message: "Invalid or expired reset token." });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.updateOne({ _id: id }, { password: hashedPassword });
    await Token.deleteOne({ _id: tokenDoc._id });

    res.json({ message: "✅ Password reset successful." });
  } catch (err) {
    console.error("❌ Reset password error:", err.message);
    res.status(500).json({ message: "Error resetting password." });
  }
});

// ---------- FEEDBACK ----------
app.post("/feedback", async (req, res) => {
  try {
    const { user, message } = req.body;
    if (!message) return res.status(400).json({ message: "Feedback message required." });
    await Feedback.create({ user: user || "Anonymous", message });

    await sendEmailAsync({
      to: process.env.EMAIL_USER || "souvik2072005@gmail.com",
      subject: "💬 New Feedback - Dress Organizer",
      html: `<p><b>${user || "Anonymous"}:</b> ${message}</p>`,
    });

    if (user && user.includes("@")) {
      await sendEmailAsync({
        to: user,
        subject: "💖 Thanks for Your Feedback — Dress Organizer",
        html: `<p>We appreciate your feedback! 💌</p>`,
      });
    }

    res.json({ message: "✅ Feedback sent successfully!" });
  } catch (err) {
    console.error("❌ Feedback error:", err.message);
    res.status(500).json({ message: "Error sending feedback." });
  }
});

// ---------- Sections / Dresses ----------
app.get("/api/sections", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const sections = await Section.find({
    $or: [{ userEmail: null }, { userEmail: user.email }],
  }).sort({ name: 1 });
  res.json(sections);
});

// ---------- Static Frontend ----------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/verify.html", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/reset.html", (req, res) => res.sendFile(path.join(__dirname, "public", "reset.html")));

// ---------- Startup ----------
async function startServer() {
  await connectMongo();
  await seedDefaults();
  app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on ${PORT}`));
}

startServer();
