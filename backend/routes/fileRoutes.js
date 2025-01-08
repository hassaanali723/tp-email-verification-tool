const express = require('express');
const multer = require('multer');
const File = require('../models/File');
const EmailValidation = require("../models/EmailValidation");
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

// Add this new endpoint to fileRoutes.js
router.get('/list', async (req, res) => {
  try {
      // Fetch all files with their validation status
      const files = await File.find().sort({ createdAt: -1 });
      
      // Get validation results for all files
      const filesWithStatus = await Promise.all(files.map(async (file) => {
          const validation = await EmailValidation.findOne({ fileId: file._id });
          
          return {
              fileName: file.fileName,
              fileId: file._id,
              emailsReady: validation?.validations?.length || 0,
              status: validation ? 'verified' : 'uploaded',
              validationResults: validation?.validations || [],
              deliverableRate: validation ? (validation.validations.filter(v => 
                  v.isValid && v.deliverabilityScore >= 90
              ).length / validation.validations.length * 100) : 0
          };
      }));

      res.json(filesWithStatus);
  } catch (error) {
      console.error('Error fetching files:', error);
      res.status(500).json({ error: 'Failed to fetch files' });
  }
});


module.exports = router;
