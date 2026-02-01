# VideoQ

🎥 **Upload videos. Ask questions. Get instant answers.**

VideoQ is an AI-powered video navigator that automatically transcribes your videos and lets you chat with them using natural language.

**[日本語版README](README.ja.md) | [English README](README.md)**

![VideoQ Application Screenshot](assets/videoq-app-screenshot.png)

## ✨ What can you do?

- **Upload any video** - MP4, MOV, AVI, and more
- **Ask questions** - "What did they say about the budget?" or "Summarize the key points"
- **Search content** - Find specific moments without scrubbing through hours of footage
- **Organize with tags** - Keep your videos organized with custom tags and colors
- **Share insights** - Create shareable groups of videos for team collaboration

## 🚀 Quick Start (5 minutes)

### What you'll need

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) installed
- An [OpenAI API key](https://platform.openai.com/api-keys) (don't worry, we'll show you how to get one)

### Step 1: Get your OpenAI API key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-...`)



### Step 2: Set up VideoQ

```bash
# Clone and enter the project
git clone https://github.com/yukiharada1228/videoq.git
cd videoq

# Copy the configuration file
cp .env.example .env
```

Now edit the `.env` file and add your OpenAI API key:

```bash
OPENAI_API_KEY=sk-your-key-here
```

### Step 3: Start VideoQ

```bash
# Start all services (this might take a few minutes the first time)
docker compose up --build -d

# Set up the database
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py collectstatic --noinput

# Create your admin account
docker compose exec backend python manage.py createsuperuser
```

### Step 4: Start using VideoQ!

Open [http://localhost](http://localhost) in your browser and you're ready to go!

**Other useful links:**
- **Admin Panel:** [http://localhost/api/admin](http://localhost/api/admin) (manage users, videos)
- **API Docs:** [http://localhost/api/docs/](http://localhost/api/docs/) (for developers)

### 📋 User Management

**Important:** New users are created with a video upload limit of 0 (no uploads allowed). As an administrator, you need to set appropriate video limits for users through the admin panel.

**To set video limits:**
1. Go to the [Admin Panel](http://localhost/api/admin)
2. Click on "Users" 
3. Select a user to edit
4. Set the "Video limit" field:
   - `0` = No uploads allowed (default for new users)
   - Any positive number = Maximum videos the user can upload
   - Leave blank = Unlimited uploads

This design ensures administrators have full control over resource usage and user permissions.

## 💰 Want to save money? Use local alternatives

VideoQ can run completely offline using free, local AI models. This eliminates OpenAI costs entirely!

<details>
<summary><strong>🖥️ Local Whisper (Free transcription)</strong></summary>

Use your computer's GPU for faster, cost-free transcription.

**Quick setup:**

```bash
# 1. Get whisper.cpp (from VideoQ root directory)
git submodule update --init --recursive
cd whisper.cpp

# 2. Build it
cmake -B build
cmake --build build -j --config Release

# 3. Download a model
bash ./models/download-ggml-model.sh large-v3-turbo

# 4. Start the server
./build/bin/whisper-server -m models/ggml-large-v3-turbo.bin --inference-path /audio/transcriptions
```

**Configure VideoQ to use it:**

Edit your `.env` file:
```bash
WHISPER_BACKEND=whisper.cpp
WHISPER_LOCAL_URL=http://host.docker.internal:8080
```

Then restart: `docker compose restart backend celery-worker`

</details>

<details>
<summary><strong>🤖 Local AI Chat with Ollama (Free ChatGPT alternative)</strong></summary>

**Install Ollama:**
1. Download from [ollama.com](https://ollama.com)
2. Install and run it

**Get a model:**
```bash
ollama pull qwen3:0.6b  # Small, fast model
# or
ollama pull llama3:8b   # Larger, more capable model
```

**Configure VideoQ:**

Edit your `.env` file:
```bash
LLM_PROVIDER=ollama
LLM_MODEL=qwen3:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Then restart: `docker compose restart backend celery-worker`

</details>

<details>
<summary><strong>🔍 Local Embeddings (Free text search)</strong></summary>

**Get an embedding model:**
```bash
ollama pull qwen3-embedding:0.6b
```

**Configure VideoQ:**

Edit your `.env` file:
```bash
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Then restart: `docker compose restart backend celery-worker`

**Important:** If you switch from OpenAI to local embeddings, you'll need to re-index your existing videos in the admin panel.

</details>

## 🛠️ Development & Customization

<details>
<summary><strong>Frontend Development</strong></summary>

Want to customize the UI? Run the frontend separately for faster development:

```bash
cd frontend
npm install
npm run dev  # Runs at http://localhost:3000
```

Make sure the backend is still running via Docker.

</details>

<details>
<summary><strong>Backend Development</strong></summary>

```bash
cd backend
pip install -r requirements.txt
python manage.py runserver
```

</details>

<details>
<summary><strong>Running Tests</strong></summary>

**Frontend:**
```bash
cd frontend
npm run test              # Run tests
npm run test:watch        # Watch mode
```

**Backend:**
```bash
cd backend
python manage.py test
```

</details>

<details>
<summary><strong>Useful Docker Commands</strong></summary>

```bash
docker compose ps                                          # See what's running
docker compose logs -f                                     # Watch all logs
docker compose logs -f backend                             # Watch backend logs only
docker compose exec backend python manage.py shell         # Django shell
docker compose down                                        # Stop everything
docker compose restart backend                             # Restart just backend
```

</details>

## 🏗️ How it works

VideoQ is built with modern, reliable technologies:

**Frontend:** React + TypeScript + Tailwind CSS  
**Backend:** Django + PostgreSQL + Redis  
**AI:** OpenAI APIs + pgvector for semantic search  
**Infrastructure:** Docker + Nginx

**The magic happens like this:**
1. **Upload** → Video saved securely
2. **Transcribe** → AI converts speech to text  
3. **Index** → Text broken into searchable chunks
4. **Chat** → Your questions matched against video content
5. **Answer** → AI responds with relevant context

## 🚀 Production Deployment

<details>
<summary><strong>Deploy to your own server</strong></summary>

**Frontend Configuration:**

Create `frontend/.env.production`:

```bash
# Same domain (recommended)
VITE_API_URL=/api

# Or different domain
VITE_API_URL=https://api.yourdomain.com/api
```

**Backend Configuration:**

Update your `.env`:

```bash
ALLOWED_HOSTS=yourdomain.com
CORS_ALLOWED_ORIGINS=https://yourdomain.com
SECURE_COOKIES=true
FRONTEND_URL=https://yourdomain.com
```

**Build and deploy:**

```bash
cd frontend
npm run build  # Creates dist/ folder
# Upload dist/ to your web server
```

**Important:** Use HTTPS in production for security.

</details>

## ❓ Troubleshooting

**"I can't access VideoQ at localhost"**
- Make sure Docker is running: `docker compose ps`
- Check if services started: `docker compose logs`

**"OpenAI API errors"**
- Verify your API key is correct in `.env`
- Check your OpenAI account has credits
- Make sure there are no extra spaces in the key

**"Video upload fails"**
- Check your host system has enough disk space (videos are stored in `./backend/media/`)
- Verify video format is supported (MP4, MOV, AVI, etc.)
- For large videos (>1GB), nginx is configured to allow up to 1000MB uploads
- Check nginx logs if upload stops: `docker compose logs nginx`

**"Transcription is slow"**
- Consider using local Whisper (see cost-saving section above)
- Larger videos take longer - this is normal

**Need more help?** Check the logs: `docker compose logs -f`

## 🤝 Contributing

Found a bug? Want to add a feature? Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## 📄 License

See [LICENSE](LICENSE) file for details.