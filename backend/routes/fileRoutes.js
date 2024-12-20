const express = require('express');
const multer = require('multer');
const File = require('../models/File');

const router = express.Router();

// Multer setup (temporary folder)
const upload = multer({ dest: 'uploads/' });

// POST route to upload file and save to DB
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');

    // Read file content
    const fs = require('fs');
    const fileData = fs.readFileSync(req.file.path);

    // Save file to MongoDB
    const newFile = new File({
      filename: req.file.originalname,
      data: fileData,
      contentType: req.file.mimetype
    });

    await newFile.save();

    // Cleanup: remove file from temporary folder
    fs.unlinkSync(req.file.path);

    res.status(201).json({ message: 'File uploaded successfully.', fileId: newFile._id });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
