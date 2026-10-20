# Hearth — Frontend

Single-file voice UI (`index.html`) for the Hearth MCP server.

## Deploy options

| Platform | Steps |
|---|---|
| **GitHub Pages** | Repo → Settings → Pages → Source: `frontend/` folder |
| **Vercel** | Import repo → Root directory: `frontend` → Framework: Other |
| **Netlify** | Drag & drop the `frontend/` folder into the Netlify UI |
| **Served by backend** | The backend auto-serves this file — no separate deploy needed |

## Backend URL

The file contains a single constant at the top of the `<script>` block:

```js
const BACKEND_URL = 'https://hearth-production-8551.up.railway.app';
```

Change this to point at any Hearth backend deployment.

## No build step

This is a plain HTML file. No npm, no bundler, no framework.
Open it directly in a browser or host it on any static CDN.
