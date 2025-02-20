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
  console.log(JSON.stringify(emails));
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
        console.log(results);
        
        // Format validation results to match the schema
        const validationRecords = results.map((result) => ({
          email: result.email,
          isValid: result.isValid,
          riskLevel: result.riskLevel,
          deliverabilityScore: result.deliverabilityScore,
          details: {
            general: {
              fullName: result.details.general.fullName,
              gender: result.details.general.gender,
              state: result.details.general.state,
              reason: result.details.general.reason,
              domain: result.details.general.domain
            },
            attributes: {
              free: result.details.attributes.free,
              role: result.details.attributes.role,
              disposable: result.details.attributes.disposable,
              acceptAll: result.details.attributes.acceptAll,
              tag: result.details.attributes.tag,
              numericalChars: result.details.attributes.numericalChars,
              alphabeticalChars: result.details.attributes.alphabeticalChars,
              unicodeSymbols: result.details.attributes.unicodeSymbols,
              mailboxFull: result.details.attributes.mailboxFull,
              noReply: result.details.attributes.noReply
            },
            mailServer: {
              smtpProvider: result.details.mailServer.smtpProvider,
              mxRecord: result.details.mailServer.mxRecord,
              implicitMXRecord: result.details.mailServer.implicitMXRecord
            }
          }
        }));

        // Save validation results to MongoDB
        const document = {
          fileId,
          emailColumn,
          processedAt: new Date(),
          validations: validationRecords
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

// New GET endpoint to fetch results by fileId
router.get("/results/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({ error: "File ID is required" });
    }

    // Find the file first
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    // Find the validation results for this file
    const validationResults = await EmailValidation.findOne({ fileId });
    if (!validationResults) {
      return res.status(404).json({ error: "No validation results found for this file" });
    }

    const validations = validationResults.validations;
    const totalEmails = validations.length;

    // Calculate statistics based on general.state
    const stats = {
      totalEmails,
      deliverable: validations.filter(v => v.details.general.state === "Deliverable").length,
      undeliverable: validations.filter(v => v.details.general.state === "Undeliverable").length,
      risky: validations.filter(v => v.details.general.state === "Risky").length,
      unknown: validations.filter(v => v.details.general.state === "Unknown").length,
      duplicate: validations.filter(v => v.details.general.state === "Duplicate").length
    };

    // Calculate percentages
    const percentages = {
      deliverable: ((stats.deliverable / totalEmails) * 100).toFixed(1),
      undeliverable: ((stats.undeliverable / totalEmails) * 100).toFixed(1),
      risky: ((stats.risky / totalEmails) * 100).toFixed(1),
      unknown: ((stats.unknown / totalEmails) * 100).toFixed(1),
      duplicate: ((stats.duplicate / totalEmails) * 100).toFixed(1)
    };

    // Get detailed subcategories for each state
    const undeliverableDetails = {
      invalidEmail: validations.filter(v => v.details.general.reason === "Invalid Email Format").length,
      invalidDomain: validations.filter(v => v.details.general.reason === "Invalid Domain").length,
      rejectedEmail: validations.filter(v => v.details.general.reason === "Mailbox Not Found").length,
      invalidSMTP: validations.filter(v => v.details.general.reason === "Invalid Mailbox").length
    };

    const riskyDetails = {
      lowQuality: validations.filter(v => v.details.attributes.disposable).length,
      lowDeliverability: validations.filter(v => v.details.attributes.mailboxFull).length
    };

    const unknownDetails = {
      noConnect: validations.filter(v => v.details.general.reason === "Server Temporary Error").length,
      timeout: validations.filter(v => v.details.general.reason?.includes("timeout")).length,
      unavailableSMTP: validations.filter(v => v.details.general.reason?.includes("SMTP unavailable")).length,
      unexpectedError: validations.filter(v => v.details.general.state === "Unknown" && 
        !v.details.general.reason?.includes("timeout") && 
        !v.details.general.reason?.includes("SMTP unavailable")).length
    };

    // Prepare response
    const response = {
      status: "success",
      fileName: file.filename,
      processedAt: validationResults.processedAt,
      emailColumn: validationResults.emailColumn,
      fileId: validationResults.fileId,
      stats: {
        ...stats,
        percentages,
        details: {
          undeliverable: undeliverableDetails,
          risky: riskyDetails,
          unknown: unknownDetails
        }
      },
      validations: validationResults.validations
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: "Error fetching validation results" });
  }
});


module.exports = router;
