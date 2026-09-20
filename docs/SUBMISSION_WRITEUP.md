# CampusLens — submission write-up draft

Replace bracketed placeholders and remove any claim not shown in the final
video before submitting.

## Problem

College notices often hide a deadline, payment, or required form in several
pages of dense PDF text. Students must manually search every notice, which can
lead to missed actions and incomplete submissions.

## What we built

CampusLens converts an uploaded student-facing PDF into a focused action view:

- deadlines and important dates;
- required student actions;
- document-grounded Q&A; and
- source-page references for every supported answer.

When a question is not supported by the document, CampusLens says so instead of
inventing an answer.

## Build It stack

- React + Vite frontend
- Django + Django REST Framework backend
- SQLite and local development media storage
- pypdf text extraction, chunking, and keyword retrieval
- Strands Agents SDK
- Ollama with `qwen3:4b` locally

## How it works

The system extracts text page by page, preserves page numbers, chunks the
content, and derives structured deadlines, important dates, and actions. For
questions, it retrieves relevant chunks and provides them to a Strands agent.
The agent is instructed to cite evidence and refuse unsupported claims.

## Why it matters

CampusLens turns a “read this whole circular carefully” task into “tell me what
I need to do,” while retaining page references so students can verify the
answer themselves.

## What we learned

We learned how to design a grounded local agent workflow, preserve source
attribution across PDF extraction and retrieval, and design for a refusal when
evidence is missing.

## Team

- [Name — responsibility]
- [Name — responsibility]

## Credits and disclosure

Open-source dependencies are listed in `backend/requirements.txt` and
`frontend/package.json`. Add all external assets, templates, prompts, datasets,
and AI coding tools used by the team here before submission.

AI coding tools used: [complete this accurately].
