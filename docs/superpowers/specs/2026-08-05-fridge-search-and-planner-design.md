# Fridge Search + Weekly Planner — Design Spec

**Date:** 2026-08-05
**Status:** Approved

---

## Overview

Two improvements to the whattoeat app:

1. **Fridge search** — a second filter input on the Browse tab that shows recipes matching ingredients you have on hand, mutually exclusive with the existing text search.
2. **Weekly meal planner** — a Plan tab with a Mon–Fri day grid, day-picker to assign recipes, and a merged shopping list below. Plan persisted server-side (shared across all users on the instance).

---

## Architecture

### Frontend

All changes live in `index.html`. No new pages, no new dependencies.

**Tab bar** — inserted between the hero and the filter bar. Two tabs: Browse and Plan. The Plan tab badge shows how many days are currently filled.

**Browse tab**
- Existing recipe grid, filters, and "Surprise me" button are unchanged.
- A second input ("Fridge: e.g. chicken, rice…") sits alongside the existing search input.
- The two inputs are mutually exclusive: typing in one clears the other and takes over filtering. Fridge search matches recipes where every typed ingredient appears in the ingredient list (substring match, comma-separated input).
- Each recipe card gets an "Add to plan" button. Clicking it opens the day picker popover.

**Day picker popover**
- Appears inline (not a modal) anchored to the card.
- Lists Mon–Fri. Free days show a green "Free" label. Taken days show the existing recipe name and a "Replace →" label.
- All days are clickable. Clicking a taken day replaces it immediately — no confirmation.
- A "Cancel" link dismisses the picker.

**Plan tab**
- Five day columns (Mon–Fri). Each column shows the assigned recipe name with an × to remove it, or a dashed "+ Add recipe" placeholder if empty.
- Clicking "+ Add recipe" switches to the Browse tab so the user can find and add a recipe normally.
- Below the day grid: a shopping list of all ingredients across planned recipes, deduplicated and sorted alphabetically. Each ingredient is a checkbox (tick off as you shop). A "Copy list" button copies the plain-text list to the clipboard.
- The plan is loaded from `GET /api/plan` on page load and saved via `PUT /api/plan` on every change.

**State shape (in-memory JS)**
```js
{
  mon: "Garlic Butter Pasta",   // recipe title or null
  tue: null,
  wed: "Coconut Chickpea Curry",
  thu: null,
  fri: "Chicken Stir-Fry"
}
```

---

### Backend

New `api/` directory in the repo root.

**`api/main.py`** — Python FastAPI app, ~40 lines.

Endpoints:
- `GET /api/plan` — reads `/data/plan.json`, returns the plan object. Returns an empty plan if the file doesn't exist yet.
- `PUT /api/plan` — writes the request body (validated as the plan shape) to `/data/plan.json`.

Plan file lives at `/data/plan.json` inside the container, backed by a named Docker volume so it survives restarts.

**`api/requirements.txt`**
```
fastapi
uvicorn[standard]
```

**`api/Dockerfile`**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

### Docker Compose

`docker-compose.yml` gains a second service and a named volume:

```yaml
services:
  recipes:
    image: ghcr.io/djnw8fs748-eng/whattoeat:latest
    container_name: recipes
    restart: unless-stopped
    ports:
      - target: 80
        published: 8090
        protocol: tcp

  api:
    build: ./api
    container_name: recipes-api
    restart: unless-stopped
    volumes:
      - plan-data:/data

volumes:
  plan-data:
```

The `recipes` (nginx) container needs to proxy `/api/` to the `api` container. This requires a custom `nginx.conf` baked into the `recipes` image:

```nginx
location /api/ {
    proxy_pass http://api:8000/api/;
}
```

The GitHub Actions workflow builds both images. The `recipes` image build gains the custom nginx config.

---

## Data Flow

```
User clicks "Add to plan"
  → day picker opens (no network call)
  → user picks a day
  → JS updates in-memory plan state
  → PUT /api/plan  (nginx → api container → writes plan.json)
  → Plan tab re-renders from updated state

Page load
  → GET /api/plan  (nginx → api container → reads plan.json)
  → JS stores result as plan state
  → Plan tab renders
```

---

## Out of Scope

- Per-user plans (no auth — one shared plan per instance)
- Serving size scaling
- Favourites / cook history
- Weekend days (Sat/Sun)
- Recipe images
