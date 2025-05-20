const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

// Basic auth middleware that validates the token
const requireAuth = ClerkExpressRequireAuth({
  // Optional: Configure any specific options
  onError: (err, req, res) => {
    console.error('Auth Error:', err);
    res.status(401).json({ 
      success: false, 
      message: 'Unauthorized - Invalid or missing token' 
    });
  }
});

module.exports = {
  requireAuth
}; 