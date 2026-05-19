// BotForge Local Server — proxies requests to Groq API (FREE)
// Run: node server.js
// Then open: http://localhost:3000

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve the chatbot HTML
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const htmlPath = path.join(__dirname, 'chatbot.html');
    fs.readFile(htmlPath, (err, data) => {
      if (err) { res.writeHead(500); res.end('Could not load chatbot.html'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // Proxy POST /chat to Groq API
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON' } }));
        return;
      }

      const { messages, system, model } = payload;
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Server API key missing' } }));
        return;
      }

      // Groq uses OpenAI-compatible format
      // Prepend system message into the messages array
      const groqMessages = system
        ? [{ role: 'system', content: system }, ...messages]
        : messages;

      const requestBody = JSON.stringify({
        model: model || 'llama3-8b-8192',
        max_tokens: 1024,
        messages: groqMessages
      });

      const options = {
        hostname: 'api.groq.com',
        port: 443,
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let responseData = '';
        proxyRes.on('data', chunk => { responseData += chunk; });
        proxyRes.on('end', () => {
          // Convert Groq's OpenAI-format response to our expected format
          try {
            const groqData = JSON.parse(responseData);
            if (groqData.error) {
              res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: groqData.error }));
            } else {
              // Normalize to { content: [{ text: "..." }] }
              const text = groqData.choices[0].message.content;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ content: [{ text: text }] }));
            }
          } catch(e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Failed to parse Groq response' } }));
          }
        });
      });

      proxyReq.on('error', (e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Proxy error: ' + e.message } }));
      });

      proxyReq.write(requestBody);
      proxyReq.end();
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   BotForge (Groq) running on port ' + PORT + '    ║');
  console.log('  ║   Open: http://localhost:' + PORT + '             ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
