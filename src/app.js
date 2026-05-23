app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://ascent-music-center.netlify.app',
      'https://ascent-music.vercel.app',
    ];
    // Cho phép tất cả domain vercel.app của project
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());