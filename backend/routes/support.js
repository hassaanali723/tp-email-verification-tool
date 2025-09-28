const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const SupportTicket = require('../models/SupportTicket');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);

// Ensure uploads/support directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'support');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Submit ticket
router.post('/submit', upload.single('image'), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { name, email, problem } = req.body;
    if (!name || !email || !problem) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const imageUrl = req.file ? `/uploads/support/${req.file.filename}` : null;
    const ticket = await SupportTicket.create({ userId, name, email, problem, imageUrl });

    // Notify via email using Nodemailer if SMTP env vars are set
    try {
      const nodemailer = require('nodemailer');
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SUPPORT_TO_EMAIL } = process.env;
      if (SMTP_HOST && SMTP_PORT && (SMTP_USER || SMTP_PASS)) {
        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: Number(SMTP_PORT) || 587,
          secure: false,
          auth: SMTP_USER || SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        });
        const to = SUPPORT_TO_EMAIL || 'hassaanali.dev@gmail.com';
        const html = `
          <h2>New Support Ticket</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>User ID:</strong> ${userId}</p>
          <p><strong>Problem:</strong></p>
          <pre style="white-space:pre-wrap">${problem}</pre>
          ${imageUrl ? `<p><a href="${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/,'')}${imageUrl}" target="_blank">View attachment</a></p>` : ''}
        `;
        await transporter.sendMail({
          from: SMTP_USER || 'no-reply@support',
          to,
          subject: `Support Ticket ${ticket._id}`,
          html,
        });
      } else {
        logger.warn('SMTP not configured; support email not sent');
      }
    } catch (e) {
      logger.error('Failed to send support email', { error: e.message });
    }

    return res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    logger.error('Failed to submit support ticket', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to submit ticket' });
  }
});

// List tickets for current user
router.get('/my', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const tickets = await SupportTicket.find({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: tickets });
  } catch (error) {
    logger.error('Failed to fetch support tickets', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

module.exports = router;


