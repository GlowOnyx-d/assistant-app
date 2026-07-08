const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const pdfParse = require('pdf-parse'); // Triggering nodemon restart

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key_123';
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Helper to read/write users
const getUsers = () => {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};
const saveUsers = (users) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

const CHATS_FILE = path.join(__dirname, 'data', 'chats.json');

const getChats = () => {
  try {
    const data = fs.readFileSync(CHATS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
};
const saveChats = (chats) => {
  fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
};

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const users = getUsers();
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now().toString(), name, email, password: hashedPassword };
    users.push(newUser);
    saveUsers(users);

    const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Middleware to protect chat
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Chat Management Endpoints
app.get('/api/chats', authenticate, (req, res) => {
  const allChats = getChats();
  const userChats = allChats[req.user.id] || [];
  // Return sorted by most recent
  res.json(userChats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/api/chats/:chatId', authenticate, (req, res) => {
  const allChats = getChats();
  const userChats = allChats[req.user.id] || [];
  const chat = userChats.find(c => c.chatId === req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json(chat);
});

app.post('/api/chats', authenticate, (req, res) => {
  const allChats = getChats();
  if (!allChats[req.user.id]) allChats[req.user.id] = [];
  
  const newChat = {
    chatId: Date.now().toString(),
    title: 'New Chat',
    messages: [],
    createdAt: new Date().toISOString()
  };
  
  allChats[req.user.id].push(newChat);
  saveChats(allChats);
  res.json(newChat);
});

app.post('/api/chats/:chatId/messages', authenticate, (req, res) => {
  const { messages, title } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  const allChats = getChats();
  const userChats = allChats[req.user.id] || [];
  const chatIndex = userChats.findIndex(c => c.chatId === req.params.chatId);
  
  if (chatIndex === -1) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  userChats[chatIndex].messages = messages;
  if (title && userChats[chatIndex].title === 'New Chat') {
    userChats[chatIndex].title = title;
  }
  
  saveChats(allChats);
  res.json(userChats[chatIndex]);
});

app.delete('/api/chats/:chatId', authenticate, (req, res) => {
  const allChats = getChats();
  const userChats = allChats[req.user.id] || [];
  
  const chatIndex = userChats.findIndex(c => c.chatId === req.params.chatId);
  if (chatIndex === -1) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  userChats.splice(chatIndex, 1);
  allChats[req.user.id] = userChats;
  
  saveChats(allChats);
  res.json({ success: true });
});

app.post('/api/chats/:chatId/title', authenticate, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const { firstMessage } = req.body;
    
    if (!firstMessage) {
      return res.status(400).json({ error: 'firstMessage is required' });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'Generate a very short 3-5 word title summarizing the user\'s message. Do not use quotes. Do not say "Title:". Just output the exact title.' },
        { role: 'user', content: firstMessage }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
      max_tokens: 15,
    });

    const newTitle = completion.choices[0]?.message?.content?.trim();
    if (!newTitle) return res.status(500).json({ error: 'Failed to generate title' });

    const chatsData = getChats();
    const userChats = chatsData[userId] || [];
    const chatIndex = userChats.findIndex(c => c.chatId === chatId);
    
    if (chatIndex !== -1) {
      userChats[chatIndex].title = newTitle;
      chatsData[userId] = userChats;
      saveChats(chatsData);
    }
    
    res.json({ title: newTitle });
  } catch (error) {
    console.error('Title generation error:', error);
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

app.post('/api/upload', authenticate, upload.single('file'), async (req, res) => {
  console.log('--- BACKEND RECEIVED UPLOAD REQUEST ---');
  
  if (!req.file) {
    console.error('Upload Error: req.file is undefined. Multer failed to parse the multipart data.');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { mimetype, buffer, originalname } = req.file;
  console.log(`Processing File: ${originalname} (Type: ${mimetype}, Size: ${buffer.length} bytes)`);
  try {
    let extractedText = '';

    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      extractedText = data.text;
    } else if (mimetype.startsWith('text/')) {
      extractedText = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Only PDFs and text files are supported for extraction.' });
    }

    res.json({ text: extractedText });
  } catch (error) {
    console.error('Error parsing file:', error);
    res.status(500).json({ 
      error: 'Failed to extract text from file', 
      details: error.message,
      bufferSize: req.file && req.file.buffer ? req.file.buffer.length : 0
    });
  }
});

app.post('/api/generate-image', authenticate, (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  const encodedPrompt = encodeURIComponent(prompt.trim());
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&model=flux`;
  res.json({ imageUrl });
});

app.post('/api/chat', authenticate, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'Groq API Key is not configured on the server.' });
  }

  try {
    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Inject system prompt with the user's name
    messages.unshift({
      role: 'system',
      content: `You are a helpful AI assistant. The user's name is ${req.user.name || 'User'}, but do NOT mention, use, or reference their name in your responses unless the user explicitly asks what their name is or directly asks you to address them by name. Respond normally otherwise, without adding their name to greetings, sign-offs, or any other part of your replies.`
    });

    const stream = await groq.chat.completions.create({
      messages: messages,
      model: 'llama-3.3-70b-versatile',
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        // SSE format: data: { JSON }\n\n
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Send a done event to signal the end of the stream
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error in chat API:', error);
    
    let errorMessage = 'Failed to communicate with Groq API.';
    if (error.status === 429) {
      errorMessage = 'Too many requests — please wait a moment and try again';
    }

    if (!res.headersSent) {
      res.status(error.status === 429 ? 429 : 500).json({ error: errorMessage });
    } else {
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
