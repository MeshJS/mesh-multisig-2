// Preload script to initialize libsodium before tests run
const sodium = require("libsodium-wrappers-sumo");

// Initialize sodium synchronously by accessing the ready promise
// This ensures it's initialized before any tests run
sodium.ready
  .then(() => {
    // Sodium is now ready
  })
  .catch((err) => {
    console.error("Failed to initialize libsodium:", err);
    process.exit(1);
  });
