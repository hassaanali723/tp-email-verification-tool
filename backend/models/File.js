const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  data: { type: Buffer, required: true }, // Binary data (BLOB)
  contentType: { type: String, required: true }, // File MIME type
  uploadDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('File', fileSchema);
