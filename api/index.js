const express = require('express');
const cors = require('cors');
const mongoose = require("mongoose");
const User = require('./models/User');
const Post = require('./models/Post');
const bcrypt = require('bcryptjs');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
const fs = require('fs');

const salt = bcrypt.genSaltSync(process.env.SALT);
const secret = process.env.SECRET;

app.use(cors({credentials:true,origin:'http://localhost:3000'}));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));

mongoose.connect('mongodb+srv://blog:RD8paskYC8Ayj09u@cluster0.pflplid.mongodb.net/?retryWrites=true&w=majority');

app.post('/register', async (req,res) => {
  const {username,password} = req.body;
  try{
    const userDoc = await User.create({
      username,
      password:bcrypt.hashSync(password,salt),
    });
    res.json(userDoc);
  } catch(e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post('/login', async (req,res) => {
  const body = req.body;
  const {username,password} = body;
  const userDoc = await User.findOne({username});
  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    // logged in
    jwt.sign({username,id:userDoc._id}, secret, {}, (err,token) => {
      if (err) throw err;
      res.cookie('token', token).json({
        id:userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json('wrong credentials');
  }
});

app.get('/profile', (req,res) => {
  const {token} = req.cookies;
  jwt.verify(token,processsecret, {}, (err,info) => {
    if (err) throw err;
    res.json(info);
  });
});

app.post('/logout', (req,res) => {
  res.cookie('token', '').json('ok');
});

//Fixed path traversal issue 1
const { sanitizeFilename } = require('sanitize-filename'); // Import the sanitize-filename module

app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Sanitize the original filename to prevent path traversal
  const originalname = sanitizeFilename(req.file.originalname);

  const parts = originalname.split('.');
  const ext = parts[parts.length - 1];

  // Construct the safe path for the uploaded file
  const newPath = `${Date.now()}.${ext}`;

  // Move the uploaded file to the safe path
  try {
    fs.renameSync(req.file.path, newPath);
  } catch (error) {
    console.error('Error moving file:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // Handle the rest of the post creation logic
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, summary, content } = req.body;
    try {
      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: newPath, // Save the sanitized filename to the database
        author: info.id,
      });
      res.json(postDoc);
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

//fixed path traversal issue 2
const { sanitizeFilename } = require('sanitize-filename'); // Import the sanitize-filename module

app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
  let newPath = null;

  if (req.file) {
    // Sanitize the original filename to prevent path traversal
    const originalname = sanitizeFilename(req.file.originalname);

    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];

    // Construct the safe path for the uploaded file
    newPath = `${Date.now()}.${ext}`;

    // Move the uploaded file to the safe path
    try {
      fs.renameSync(req.file.path, newPath);
    } catch (error) {
      console.error('Error moving file:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Handle the rest of the update logic
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id, title, summary, content } = req.body;
    try {
      const postDoc = await Post.findById(id);

      if (!postDoc) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const isAuthor = postDoc.author.toString() === info.id;

      if (!isAuthor) {
        return res.status(403).json({ error: 'You are not the author' });
      }

      // Update the post with new or existing cover path
      await postDoc.updateOne({
        title,
        summary,
        content,
        cover: newPath || postDoc.cover,
      });

      res.json(postDoc);
    } catch (error) {
      console.error('Error updating post:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});


app.get('/post', async (req,res) => {
  res.json(
    await Post.find()
      .populate('author', ['username'])
      .sort({createdAt: -1})
      .limit(20)
  );
});

app.get('/post/:id', async (req, res) => {
  const {id} = req.params;
  const postDoc = await Post.findById(id).populate('author', ['username']);
  res.json(postDoc);
})

app.listen(4000);
//