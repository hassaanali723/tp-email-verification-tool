const mongoose = require("mongoose");

const emailValidationSchema = new mongoose.Schema({
  email: { type: String, required: true },
  isValid: { type: Boolean, required: true },
  riskLevel: { type: String, enum: ["high", "medium", "low"], default: "low" },
  deliverabilityScore: { type: Number, min: 0, max: 100 },
  processedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EmailValidation", emailValidationSchema);
