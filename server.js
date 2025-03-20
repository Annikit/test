const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');


const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Для разработки можно оставить false, для production следует использовать https
}));

// Пути для загрузки и хранения данных
const uploadDir = path.join(__dirname, 'uploads');
const videoDir = path.join(uploadDir, 'videos');
const thumbnailDir = path.join(uploadDir, 'thumbnails');
const videosFile = path.join(uploadDir, 'videos.json');
const votesFile = path.join(__dirname, 'votes.json');
const commentsFile = path.join(__dirname, 'comments.json');
const usersFile = path.join(__dirname, 'users.json');

// Создаем необходимые папки и файлы, если их нет
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
if (!fs.existsSync(thumbnailDir)) fs.mkdirSync(thumbnailDir, { recursive: true });
if (!fs.existsSync(videosFile)) fs.writeFileSync(videosFile, '[]', 'utf-8');
if (!fs.existsSync(votesFile)) fs.writeFileSync(votesFile, '{}', 'utf-8');
if (!fs.existsSync(commentsFile)) fs.writeFileSync(commentsFile, '{}', 'utf-8');
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]', 'utf-8');

// Функции для работы с пользователями
function readUsers() {
  return JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf-8');
}

// Функции для работы со списком видео
function getVideos() {
  return JSON.parse(fs.readFileSync(videosFile, 'utf-8'));
}

function saveVideos(videos) {
  fs.writeFileSync(videosFile, JSON.stringify(videos, null, 2), 'utf-8');
}

// Функции для работы с голосами
function readVotes() {
  return JSON.parse(fs.readFileSync(votesFile, 'utf-8'));
}

function writeVotes(data) {
  fs.writeFileSync(votesFile, JSON.stringify(data, null, 2), 'utf-8');
}

// Функции для работы с комментариями
function readComments() {
  return JSON.parse(fs.readFileSync(commentsFile, 'utf-8'));
}

function writeComments(data) {
  fs.writeFileSync(commentsFile, JSON.stringify(data, null, 2), 'utf-8');
}

// Настройка multer для загрузки
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.mimetype.startsWith('image') ? thumbnailDir : videoDir;
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10 ГБ
});

// Раздаем загруженные файлы
app.use('/uploads', express.static(uploadDir));

// Регистрация пользователя
app.post('/register', (req, res) => {
  const { email, nickname, password } = req.body;

  // Чтение существующих пользователей
  const users = readUsers();

  // Проверка, существует ли уже такой никнейм
  const existingUser = users.find(user => user.nickname === nickname);
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'Никнейм уже существует!' });
  }

  // Проверка существования такой почты
  const existingEmail = users.find(user => user.email === email);
  if (existingEmail) {
    return res.status(400).json({ success: false, message: 'Почта уже зарегистрирована!' });
  }

  // Создание нового пользователя
  const newUser = {
    email,
    nickname,
    password, // Здесь должен быть процесс хеширования пароля
    createdAt: Date.now()
  };

  users.push(newUser);

  // Сохранение пользователей в файл
  saveUsers(users);

  res.json({ success: true, message: 'Регистрация прошла успешно!' });
});

// Вход пользователя
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Чтение существующих пользователей
  const users = readUsers();

  // Поиск пользователя с данной почтой и паролем
  const user = users.find(user => user.email === email && user.password === password);

  if (!user) {
    return res.status(400).json({ success: false, message: 'Неверные почта или пароль!' });
  }

  // Сохраняем в сессии информацию о пользователе
  req.session.userId = user.nickname; // или какой-либо другой уникальный идентификатор
  res.json({ success: true, message: 'Вход выполнен успешно!' });
});

// Проверка авторизации
app.get('/upload', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/auth.html'); // Перенаправление на страницу авторизации
  }

  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// Маршрут для загрузки видео
app.post('/upload', upload.fields([{ name: 'video' }, { name: 'thumbnail' }]), (req, res) => {
  try {
    if (!req.files || !req.files.video || !req.files.thumbnail) {
      return res.status(400).json({ success: false, message: 'Файлы не загружены!' });
    }
    const videoFilename = req.files.video[0].filename;
    const thumbnailFilename = req.files.thumbnail[0].filename;
    const newVideo = {
      title: req.body.title,
      author: req.session.userId, // Используем никнейм из сессии
      video: `/uploads/videos/${videoFilename}`,
      thumbnail: `/uploads/thumbnails/${thumbnailFilename}`
    };
    const videos = getVideos();
    videos.push(newVideo);
    saveVideos(videos);
    console.log('Видео загружено:', newVideo);
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// Маршрут для получения списка видео
app.get('/videos', (req, res) => {
  res.json(getVideos());
});

// Голосования
app.get('/votes', (req, res) => {
  const videoId = req.query.video;
  const userId = req.query.userId;
  const votes = readVotes();
  if (!votes[videoId]) {
    votes[videoId] = { likes: 0, dislikes: 0, users: {} };
    writeVotes(votes);
  }
  res.json({
    likes: votes[videoId].likes,
    dislikes: votes[videoId].dislikes,
    userLiked: votes[videoId].users[userId] === 'like' || false,
    userDisliked: votes[videoId].users[userId] === 'dislike' || false
  });
});

app.post('/like', (req, res) => {
  const videoId = req.body.video;
  const userId = req.body.userId;
  const votes = readVotes();
  if (!votes[videoId]) {
    votes[videoId] = { likes: 0, dislikes: 0, users: {} };
  }
  if (votes[videoId].users[userId] === 'like') {
    votes[videoId].likes--;
    delete votes[videoId].users[userId];
  } else {
    if (votes[videoId].users[userId] === 'dislike') {
      votes[videoId].dislikes--;
    }
    votes[videoId].likes++;
    votes[videoId].users[userId] = 'like';
  }
  writeVotes(votes);
  res.json(votes[videoId]);
});

app.post('/dislike', (req, res) => {
  const videoId = req.body.video;
  const userId = req.body.userId;
  const votes = readVotes();
  if (!votes[videoId]) {
    votes[videoId] = { likes: 0, dislikes: 0, users: {} };
  }
  if (votes[videoId].users[userId] === 'dislike') {
    votes[videoId].dislikes--;
    delete votes[videoId].users[userId];
  } else {
    if (votes[videoId].users[userId] === 'like') {
      votes[videoId].likes--;
    }
    votes[videoId].dislikes++;
    votes[videoId].users[userId] = 'dislike';
  }
  writeVotes(votes);
  res.json(votes[videoId]);
});

// Комментарии
app.get('/comments', (req, res) => {
  const videoId = req.query.video;
  const commentsData = readComments();
  if (!commentsData[videoId]) {
    commentsData[videoId] = [];
    writeComments(commentsData);
  }
  res.json(commentsData[videoId]);
});

app.post('/comments', (req, res) => {
  const { video, userId, username, comment } = req.body;
  if (!video || !userId || !username || !comment) {
    return res.status(400).json({ success: false, message: 'Все поля должны быть заполнены' });
  }
  const commentsData = readComments();
  if (!commentsData[video]) {
    commentsData[video] = [];
  }
  const newComment = {
    userId,
    username: username.trim(),
    comment,
    timestamp: Date.now()
  };
  commentsData[video].push(newComment);
  writeComments(commentsData);
  res.json(commentsData[video]);
});

// Обработчик 404, возвращающий JSON
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Страница не найдена' });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
