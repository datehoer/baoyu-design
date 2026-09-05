---
name: "gemini-image"
description: "Gemini image\nAI-generated images via Google"
---
This is a hosted Gemini workflow, available only when the current runtime exposes a compatible image-generation tool. Resolve the backend through [generate-images.md](generate-images.md); if the user explicitly requested Gemini and it is unavailable, explain that limitation before choosing another provider. Use only model names, batching fields, and output paths supported by the actual tool schema. Show the returned image through the current harness's delivery tools.
