# CampusLens — Build It submission guide

## Track and honest architecture

CampusLens is being submitted to the **Build It** track. Its implemented AI
stack runs locally:

```text
Student browser
  -> React + Vite frontend
  -> Django REST API
  -> SQLite + local PDF media storage
  -> document text extraction, chunking and retrieval
  -> Strands Agents SDK
  -> Ollama local model
```

No AWS account, cloud deployment, Amazon Bedrock, S3, RDS, or public URL is
claimed for this submission. The repository includes future deployment
configuration, but the three-minute demo must show only the implemented local
workflow above.

## Local demo prerequisites

- Python 3.14+
- Node.js 20+
- Ollama
- The local `qwen3.5:9b` model (or another model set in `OLLAMA_MODEL_ID`)

```powershell
ollama pull qwen3.5:9b
```

This machine runs Ollama on CPU. Keep prompts short, preload the model before
recording, and do not enable Qwen thinking mode for the demo.

## Run the backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env.example .env
python manage.py migrate
python manage.py runserver
```

The local `.env` should retain:

```dotenv
DEBUG=True
USE_POSTGRES=False
USE_S3=False
AI_MODEL_PROVIDER=ollama
OLLAMA_MODEL_ID=qwen3.5:9b
OLLAMA_THINK=False
```

Create a test user in the interface, verify its email OTP shown by the console
backend, then sign in. For a live email service, do not claim this local
console delivery is production email.

### Optional real-email demo

CampusLens supports any SMTP provider through Django. This remains local-only
and is not required for the Build It track. In the ignored `backend/.env`, set:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DEFAULT_FROM_EMAIL=<your verified sender address>
EMAIL_HOST=<provider SMTP host>
EMAIL_PORT=587
EMAIL_HOST_USER=<your SMTP username>
EMAIL_HOST_PASSWORD=<provider app password or SMTP credential>
EMAIL_USE_TLS=True
```

Use a provider-specific app password, never your normal email password. Do not
show this file, its values, or the terminal OTP in the video. If real SMTP is
not configured, the code safely remains in the backend console.

## Run the frontend

```powershell
cd frontend
npm ci
npm run dev
```

Open the local Vite URL, typically `http://localhost:5173`.

## Demo flow

1. State the problem: students miss actions and deadlines hidden in college
   notices.
2. Sign in and upload a text-based real or representative college PDF.
3. Show extracted deadlines, dates, and required actions with page numbers.
4. Ask one specific question, such as: “What do I need to do before the
   deadline?”
5. Show the grounded response and page citation.
6. Ask an unsupported question and show the refusal rather than a hallucinated
   answer.
7. Show the local architecture and Strands + Ollama integration briefly.

## Three-minute video outline

| Time | What to show |
| --- | --- |
| 0:00–0:25 | Problem and affected student workflow |
| 0:25–0:55 | Upload a college notice |
| 0:55–1:30 | Actions, deadlines, and page citations |
| 1:30–2:10 | Grounded question and answer |
| 2:10–2:30 | Unsupported-question safety behavior |
| 2:30–2:50 | Local stack: Django, retrieval, Strands, Ollama |
| 2:50–3:00 | Impact, lessons learned, and repository link |

## Submission checklist

- [ ] Public repository link opens while signed out.
- [ ] Demo video is YouTube public or unlisted and under three minutes.
- [ ] Video shows the working app and the Strands/Ollama integration.
- [ ] Write-up describes only functionality shown in the video.
- [ ] All contributors and assets are credited.
- [ ] AI coding tools used during development are disclosed in the write-up.
- [ ] No secrets, `.env`, tokens, databases, or uploaded student documents are
      committed.
