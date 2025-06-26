const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');

const PORT = 3000;

// Workspace paths
const WORKSPACE = path.join(__dirname, 'workspace');
const INBOX = path.join(WORKSPACE, 'inbox.md');
const CONVERSATION = path.join(WORKSPACE, 'conversation.json');

// Helper: Write file atomically
async function writeFileAtomic(filePath, content) {
    const tempFile = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, content);
    await fs.rename(tempFile, filePath);
}

// Helper: Read file safely
async function readFileSafe(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

// Helper: Parse JSON body from request
function parseJSON(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

// Helper: Send JSON response
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// Helper: Escape HTML
function escapeHtml(str) {
    const chars = { 
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, m => chars[m]);
}

// Helper: Format timestamp from archive ID
function formatTimestamp(id) {
    const parts = id.split('__');
    if (parts.length >= 2) {
        const date = parts[0].replace(/_/g, '-');
        const time = parts[1].replace(/_/g, ':');
        return `${date} ${time}`;
    }
    return id;
}

// Render the main page
async function renderMainPage() {
    // Read conversation history
    const conversationData = await readFileSafe(CONVERSATION);
    const conversation = conversationData ? JSON.parse(conversationData) : [];
    
    // Filter out system messages
    const messages = conversation.filter(msg => msg.type !== 'system');
    
    // Generate HTML
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Chat</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: #2563eb;
            color: white;
            padding: 20px;
            text-align: center;
        }
        
        .messages {
            padding: 20px;
            min-height: 400px;
            max-height: 60vh;
            overflow-y: auto;
        }
        
        .message {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
        }
        
        .message.user {
            flex-direction: row-reverse;
        }
        
        .message-content {
            max-width: 70%;
            padding: 12px 16px;
            border-radius: 10px;
            white-space: pre-wrap;
            line-height: 1.5;
        }
        
        .message.user .message-content {
            background: #2563eb;
            color: white;
            border-bottom-right-radius: 2px;
        }
        
        .message.assistant .message-content {
            background: #f3f4f6;
            color: #1f2937;
            border-bottom-left-radius: 2px;
        }
        
        .message-time {
            font-size: 11px;
            color: #6b7280;
            margin-top: 4px;
        }
        
        .empty-state {
            text-align: center;
            color: #9ca3af;
            padding: 60px 20px;
        }
        
        .input-form {
            padding: 20px;
            border-top: 1px solid #e5e7eb;
            background: #fafafa;
        }
        
        .input-group {
            display: flex;
            gap: 10px;
        }
        
        #prompt-input {
            flex: 1;
            padding: 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 16px;
            font-family: inherit;
        }
        
        #prompt-input:focus {
            outline: none;
            border-color: #2563eb;
        }
        
        #submit-button {
            padding: 12px 24px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
        }
        
        #submit-button:hover {
            background: #1d4ed8;
        }
        
        #submit-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
        }
        
        .status {
            margin-top: 10px;
            font-size: 14px;
            color: #6b7280;
        }
        
        .status.error {
            color: #dc2626;
        }
        
        .status.success {
            color: #16a34a;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AI Chat</h1>
        </div>
        
        <div class="messages">
            ${messages.length === 0 ? 
                '<div class="empty-state">No messages yet. Start a conversation below!</div>' :
                messages.map(msg => `
                    <div class="message ${msg.type}">
                        <div>
                            <div class="message-content">${escapeHtml(msg.content)}</div>
                            ${msg.id ? `<div class="message-time">${formatTimestamp(msg.id)}</div>` : ''}
                        </div>
                    </div>
                `).join('')
            }
        </div>
        
        <form class="input-form" id="chat-form">
            <div class="input-group">
                <input 
                    type="text" 
                    id="prompt-input" 
                    name="prompt"
                    placeholder="Type your message..."
                    autocomplete="off"
                    required
                />
                <button type="submit" id="submit-button">Send</button>
            </div>
            <div class="status" id="status"></div>
        </form>
    </div>
    
    <script>
        const form = document.getElementById('chat-form');
        const input = document.getElementById('prompt-input');
        const button = document.getElementById('submit-button');
        const status = document.getElementById('status');
        
        // Scroll to bottom on load
        const messages = document.querySelector('.messages');
        messages.scrollTop = messages.scrollHeight;
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const prompt = input.value.trim();
            if (!prompt) return;
            
            // Disable form
            input.disabled = true;
            button.disabled = true;
            status.textContent = 'Sending...';
            status.className = 'status';
            
            try {
                const response = await fetch('/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    status.textContent = 'Prompt sent! The AI is processing your request...';
                    status.className = 'status success';
                    input.value = '';
                    
                    // Keep form disabled since automation will navigate away
                    // The page will be reloaded when automation returns
                } else {
                    throw new Error(result.error || 'Failed to send prompt');
                }
            } catch (err) {
                status.textContent = 'Error: ' + err.message;
                status.className = 'status error';
                
                // Re-enable form on error
                input.disabled = false;
                button.disabled = false;
            }
        });
    </script>
</body>
</html>`;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    try {
        // Route: GET /
        if (req.method === 'GET' && pathname === '/') {
            const html = await renderMainPage();
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        }
        // Route: POST /send
        else if (req.method === 'POST' && pathname === '/send') {
            const data = await parseJSON(req);
            const { prompt } = data;
            
            if (!prompt || !prompt.trim()) {
                sendJSON(res, 400, { error: 'Prompt is required' });
                return;
            }
            
            // Check if inbox already exists (system busy)
            try {
                await fs.access(INBOX);
                sendJSON(res, 409, { error: 'System is already processing a request' });
                return;
            } catch {
                // Good, inbox doesn't exist
            }
            
            // Write prompt to inbox
            await writeFileAtomic(INBOX, prompt.trim());
            
            sendJSON(res, 200, { success: true, message: 'Prompt sent successfully' });
        }
        // 404 for other routes
        else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    } catch (err) {
        console.error('Server error:', err);
        if (res.headersSent) return;
        
        if (pathname === '/send') {
            sendJSON(res, 500, { error: 'Internal server error' });
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    }
});

// Initialize and start server
async function initialize() {
    try {
        // Ensure workspace directory exists
        await fs.mkdir(WORKSPACE, { recursive: true });
        
        // Start server
        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log(`Workspace: ${WORKSPACE}`);
        });
    } catch (err) {
        console.error('Failed to initialize:', err);
        process.exit(1);
    }
}

initialize();
