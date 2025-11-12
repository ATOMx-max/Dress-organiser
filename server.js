// 🌐 Dress Organizer Backend (v11.6 — Fixed verification link, feedback email, improved mailer stability, + auto-reply)

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
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// ---------- Startup checks ----------
const requiredEnv = [
  "MONGO_URI",
  "EMAIL_USER",
  "EMAIL_PASS",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLIENT_URL",
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

// ---------- MongoDB ----------
async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message || err);
    throw err;
  }
}

// ---------- Cloudinary ----------
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

// ---------- Multer ----------
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

// ---------- Mailer ----------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
});

async function verifyMailer() {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Verification timeout")), 8000)
  );
  try {
    await Promise.race([transporter.verify(), timeout]);
    console.log("✅ Mailer connected and ready!");
  } catch (err) {
    console.warn("⚠️ Mailer verification skipped:", err.message);
  }
}

async function sendEmailAsync(mailOptions) {
  setImmediate(async () => {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`📧 Email sent to ${mailOptions.to}`);
    } catch (error) {
      console.error(`❌ Failed to send email to ${mailOptions.to}:`, error.message);
    }
  });
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

    // ✅ fixed link to backend verify route
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

    sendEmailAsync({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "🌸 Verify Your Email - Dress Organizer",
      html,
    });

    res.json({ message: "✅ Registered successfully! Please check your email." });
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

    await Token.deleteMany({ userId: user._1, purpose: "reset" }).catch(() => {});

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);
    await Token.create({ userId: user._id, token: hashedToken, purpose: "reset" });

    const resetLink = `${process.env.CLIENT_URL}/reset.html?token=${rawToken}&id=${user._id}`;
    const html = `
      <div style="font-family:Poppins,sans-serif;padding:20px;">
        <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
          <h2 style="color:#4f46e5;">Password reset requested</h2>
          <p>Click below to reset your password (valid for 1 hour).</p>
          <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">Reset Password</a>
        </div>
      </div>
    `;
    sendEmailAsync({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "🔑 Password Reset - Dress Organizer",
      html,
    });

    res.json({ message: "✅ Password reset email sent." });
  } catch (err) {
    console.error("❌ Forgot password error:", err);
    res.status(500).json({ message: "Error processing reset request." });
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { id, token, password } = req.body;
    if (!id || !token || !password)
      return res.status(400).json({ message: "id, token and password are required." });

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

    // Send admin notification
    sendEmailAsync({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "💬 New Feedback Received - Dress Organizer",
      html: `
        <div style="font-family:Poppins,sans-serif;padding:20px;">
          <h3 style="color:#4f46e5;">💌 New Feedback from ${user || "Anonymous"}</h3>
          <p style="color:#333;white-space:pre-line;">${message}</p>
        </div>
      `,
    });

    // Optional: send a thank-you/confirmation back to the submitter if it looks like an email
    try {
      if (user && typeof user === "string" && user.includes("@")) {
        sendEmailAsync({
          from: process.env.EMAIL_USER,
          to: user,
          subject: "Thanks for your feedback — Dress Organizer",
          html: `
            <div style="font-family:Poppins,sans-serif;padding:20px;">
              <h3 style="color:#4f46e5;">Thanks for your feedback!</h3>
              <p style="color:#333;">We received your message and appreciate you taking the time to write to us. We'll review it and get back if needed.</p>
              <p style="color:#777;font-size:12px;">— Dress Organizer Team</p>
            </div>
          `,
        });
      }
    } catch (e) {
      console.error("❌ Failed to send feedback confirmation to user:", e.message || e);
    }

    res.json({ message: "✅ Feedback received successfully!" });
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

// ---------- DRESSES (upload/delete) ----------
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

      const result = await cloudinary.uploader.upload(req.file.path, { folder: "dress_organizer" });

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

// ---------- Serve Frontend ----------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/verify.html", (req, res) => res.sendFile(path.join(__dirname, "public", "verify.html")));
app.get("/reset.html", (req, res) => res.sendFile(path.join(__dirname, "public", "reset.html")));

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
