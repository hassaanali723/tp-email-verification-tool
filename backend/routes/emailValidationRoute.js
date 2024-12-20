const express = require("express");
const mongoose = require("mongoose");
const XLSX = require("xlsx");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const File = require("../models/File"); // Model for uploaded files
const EmailValidation = require("../models/EmailValidation");

const router = express.Router();

// POST Endpoint to process and validate emails
router.post("/process-file", async (req, res) => {
  const { fileId, emailColumn } = req.body;

  if (!fileId || !emailColumn) {
    return res.status(400).json({ error: "File ID and email column are required" });
  }

  try {
    // Fetch the file from MongoDB
    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ error: "File not found" });

    // Write the file to a temporary location
    const tempFilePath = path.join(__dirname, "..", "temp_file");
    fs.writeFileSync(tempFilePath, file.data);

    const emails = [];

    // Process based on file type
    if (file.contentType === "text/csv") {
      fs.createReadStream(tempFilePath)
        .pipe(csv())
        .on("data", (row) => {
          if (row[emailColumn]) emails.push(row[emailColumn]);
        })
        .on("end", () => processEmails(fileId, emailColumn, emails, res));
    } else if (file.contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      const workbook = XLSX.readFile(tempFilePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      sheet.forEach((row) => {
        if (row[emailColumn]) emails.push(row[emailColumn]);
      });

      processEmails(fileId, emailColumn, emails, res);
    } else {
      res.status(400).json({ error: "Unsupported file format" });
    }

    // Clean up the temporary file
    fs.unlinkSync(tempFilePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "File processing failed" });
  }
});

// Function to process emails and call Python script
async function processEmails(fileId, emailColumn, emails, res) {
  const pythonProcess = spawn("python", ["validate_emails.py", JSON.stringify(emails)]);

  let pythonOutput = "";
  pythonProcess.stdout.on("data", (data) => {
    pythonOutput += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error(`Python Error: ${data}`);
  });

  pythonProcess.on("close", async (code) => {
    if (code === 0) {
      try {
        const results = JSON.parse(pythonOutput);

        // Format validation results
        const validationRecords = results.map((result) => ({
          email: result.email,
          isValid: result.is_valid_format && result.domain_exists,
          riskLevel: result.is_valid_format ? "low" : "high",
          deliverabilityScore: result.domain_exists ? 100 : 0,
        }));

        // Save validation results to MongoDB with auto-generated `_id` and `fileId` reference
        const document = {
          fileId, // Reference to the file
          emailColumn,
          processedAt: new Date(),
          validations: validationRecords,
        };

        const savedDocument = await EmailValidation.create(document);

        res.json({ status: "success", savedDocument });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to save validation results" });
      }
    } else {
      res.status(500).json({ error: "Python script execution failed" });
    }
  });
}

module.exports = router;
