#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FILE_KEY = process.env.FIGMA_FILE_KEY;

if (!FIGMA_TOKEN) {
  console.error('Error: FIGMA_TOKEN environment variable not set');
  process.exit(1);
}

if (!FILE_KEY) {
  console.error('Error: FIGMA_FILE_KEY environment variable not set');
  process.exit(1);
}

// Helper to make Figma API requests
function figmaRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.figma.com/v1${endpoint}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_TOKEN,
        'Content-Type': 'application/json'
      }
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    }).on('error', reject).end();
  });
}

// MCP Server handler
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    // Routes
    if (path === '/figma/file') {
      // Get file info
      const data = await figmaRequest(`/files/${FILE_KEY}`);
      res.writeHead(200);
      res.end(JSON.stringify(data));

    } else if (path === '/figma/nodes') {
      // Get specific nodes
      const nodeIds = url.searchParams.get('ids');
      if (!nodeIds) {
        throw new Error('ids parameter required');
      }
      const data = await figmaRequest(`/files/${FILE_KEY}/nodes?ids=${nodeIds}`);
      res.writeHead(200);
      res.end(JSON.stringify(data));

    } else if (path === '/figma/images') {
      // Get image URLs for nodes
      const nodeIds = url.searchParams.get('ids');
      if (!nodeIds) {
        throw new Error('ids parameter required');
      }
      const data = await figmaRequest(`/files/${FILE_KEY}/images?ids=${nodeIds}`);
      res.writeHead(200);
      res.end(JSON.stringify(data));

    } else if (path === '/figma/search') {
      // Search for nodes by name
      const query = url.searchParams.get('q');
      if (!query) {
        throw new Error('q parameter required');
      }
      // Note: Figma API doesn't have direct search, so we fetch the file and filter
      const data = await figmaRequest(`/files/${FILE_KEY}`);
      const results = searchNodes(data.document, query);
      res.writeHead(200);
      res.end(JSON.stringify({ results }));

    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

// Helper to search nodes recursively
function searchNodes(node, query, results = []) {
  if (node.name && node.name.toLowerCase().includes(query.toLowerCase())) {
    results.push({
      id: node.id,
      name: node.name,
      type: node.type
    });
  }
  if (node.children) {
    node.children.forEach(child => searchNodes(child, query, results));
  }
  return results;
}

const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
  console.log(`Figma MCP Server running on http://localhost:${PORT}`);
  console.log(`File Key: ${FILE_KEY}`);
});
