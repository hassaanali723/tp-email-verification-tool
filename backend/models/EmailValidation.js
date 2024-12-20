const mongoose = require("mongoose");

const emailValidationSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true }, // Reference to the file or batch
  emailColumn: { type: String }, // Optional: To track the column name where emails were extracted
  processedAt: { type: Date, default: Date.now }, // Timestamp for processing
  
  validations: [
    {
      email: { type: String, required: true }, // Email address being validated
      isValid: { type: Boolean, required: true }, // Whether the email passed validation
      riskLevel: { type: String, enum: ["high", "medium", "low"], default: "low" }, // Risk level
      deliverabilityScore: { type: Number, min: 0, max: 100 }, // Score based on domain validation
    },
  ],
});

module.exports = mongoose.model("EmailValidation", emailValidationSchema);
