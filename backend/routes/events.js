const express = require('express');
const router = express.Router();

// In-memory store for SSE connections, keyed by fileId
const sseClients = {};

// SSE endpoint for a specific fileId
router.get('/events/:fileId', (req, res) => {
    const { fileId } = req.params;
    req.socket.setTimeout(0); // No timeout

    // Set headers for SSE
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders();

    // Send initial comment to keep connection open
    res.write(': connected\n\n');

    // Store client
    if (!sseClients[fileId]) sseClients[fileId] = [];
    sseClients[fileId].push(res);

    // Clean up on client disconnect
    req.on('close', () => {
        sseClients[fileId] = sseClients[fileId].filter(client => client !== res);
    });
});

// Helper to send SSE event to all clients for a fileId
function sendSseEvent(fileId, event, data) {
    if (!sseClients[fileId]) return;
    let json = '';
    try {
        json = JSON.stringify(data);
    } catch (e) {
        // Fallback to plain object without circular refs
        json = JSON.stringify({ error: 'serialization_failed' });
    }
    const payload = `event: ${event}\ndata: ${json}\n\n`;
    sseClients[fileId].forEach(res => {
        try {
            res.write(payload);
        } catch (err) {
            // Remove broken connections
            sseClients[fileId] = sseClients[fileId].filter(client => client !== res);
        }
    });
}

module.exports = { router, sendSseEvent }; 