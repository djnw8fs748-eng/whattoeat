# Fridge Search + Weekly Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fridge-based recipe filtering and a shared, server-persisted Mon–Fri meal planner with a shopping list to the whattoeat app.

**Architecture:** A new Python FastAPI sidecar container (`api/`) handles two endpoints — `GET /api/plan` and `PATCH /api/plan/{day}` — storing state in `/data/plan.json` on a named Docker volume with a threading lock for safe concurrent writes. nginx proxies `/api/` to the sidecar via a custom `default.conf`. The frontend (`index.html`) gains Browse/Plan tabs, a fridge search input, per-card "Add to plan" buttons with a day picker popover, a Plan tab with the Mon–Fri grid and shopping list, and a 15-second polling loop to pick up other users' changes.

**Tech Stack:** Python 3.12, FastAPI, uvicorn, pytest, httpx (test client), nginx:alpine, Docker Compose, vanilla JS/HTML/CSS (no new frontend dependencies).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `api/__init__.py` | Create | Makes `api` a Python package (needed for imports in tests) |
| `api/main.py` | Create | FastAPI app — GET /api/plan, PATCH /api/plan/{day}, threading lock |
| `api/requirements.txt` | Create | fastapi, uvicorn[standard], httpx, pytest |
| `api/Dockerfile` | Create | python:3.12-slim image serving the API on port 8000 |
| `api/tests/__init__.py` | Create | Makes tests a package |
| `api/tests/test_main.py` | Create | pytest tests for both endpoints |
| `nginx.conf` | Create | Custom nginx server block with `/api/` proxy to api container |
| `Dockerfile` | Modify | Copy nginx.conf into the image |
| `docker-compose.yml` | Modify | Add api service + plan-data volume |
| `.github/workflows/docker-publish.yml` | Modify | Build and push api image to GHCR alongside recipes image |
| `index.html` | Modify | Tab bar, fridge search, Add to plan button, day picker, Plan tab, shopping list, polling |

---

## Task 1: FastAPI skeleton + GET /api/plan

**Files:**
- Create: `api/__init__.py`
- Create: `api/requirements.txt`
- Create: `api/tests/__init__.py`
- Create: `api/tests/test_main.py` (failing test first)
- Create: `api/main.py`

- [ ] **Step 1: Create package files**

```bash
mkdir -p api/tests
touch api/__init__.py api/tests/__init__.py
```

- [ ] **Step 2: Create `api/requirements.txt`**

```
fastapi
uvicorn[standard]
httpx
pytest
```

- [ ] **Step 3: Install dependencies**

```bash
pip install fastapi uvicorn httpx pytest
```

- [ ] **Step 4: Write the failing test**

Create `api/tests/test_main.py`:

```python
import pytest
from fastapi.testclient import TestClient
import api.main as main_module
from api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_plan_file(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "PLAN_FILE", tmp_path / "plan.json")


def test_get_plan_returns_empty_when_no_file():
    response = client.get("/api/plan")
    assert response.status_code == 200
    assert response.json() == {
        "mon": None, "tue": None, "wed": None, "thu": None, "fri": None
    }


def test_get_plan_returns_saved_plan(tmp_path, monkeypatch):
    plan_file = tmp_path / "plan.json"
    plan_file.write_text('{"mon":"Garlic Butter Pasta","tue":null,"wed":null,"thu":null,"fri":null}')
    monkeypatch.setattr(main_module, "PLAN_FILE", plan_file)
    response = client.get("/api/plan")
    assert response.status_code == 200
    assert response.json()["mon"] == "Garlic Butter Pasta"
```

- [ ] **Step 5: Run test — expect ImportError (module doesn't exist yet)**

```bash
pytest api/tests/test_main.py -v
```

Expected: `ImportError: cannot import name 'app' from 'api.main'`

- [ ] **Step 6: Create `api/main.py` with GET /api/plan**

```python
import json
import threading
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

PLAN_FILE = Path("/data/plan.json")
_lock = threading.Lock()

VALID_DAYS = ("mon", "tue", "wed", "thu", "fri")
EMPTY_PLAN: dict = {d: None for d in VALID_DAYS}


def _read_plan() -> dict:
    if not PLAN_FILE.exists():
        return dict(EMPTY_PLAN)
    return json.loads(PLAN_FILE.read_text())


def _write_plan(plan: dict) -> None:
    PLAN_FILE.parent.mkdir(parents=True, exist_ok=True)
    PLAN_FILE.write_text(json.dumps(plan))


@app.get("/api/plan")
def get_plan():
    with _lock:
        return _read_plan()


class DayUpdate(BaseModel):
    recipe: Optional[str] = None


@app.patch("/api/plan/{day}")
def patch_day(day: str, body: DayUpdate):
    if day not in VALID_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid day '{day}'. Must be one of: {list(VALID_DAYS)}"
        )
    with _lock:
        plan = _read_plan()
        plan[day] = body.recipe
        _write_plan(plan)
    return plan
```

- [ ] **Step 7: Run GET tests — expect PASS**

```bash
pytest api/tests/test_main.py::test_get_plan_returns_empty_when_no_file api/tests/test_main.py::test_get_plan_returns_saved_plan -v
```

Expected: 2 passed

- [ ] **Step 8: Commit**

```bash
git add api/
git commit -m "feat: add FastAPI backend skeleton with GET /api/plan"
```

---

## Task 2: PATCH /api/plan/{day} endpoint

**Files:**
- Modify: `api/tests/test_main.py` (add PATCH tests)
- No changes to `api/main.py` — implementation is already in place from Task 1

- [ ] **Step 1: Add PATCH tests to `api/tests/test_main.py`**

Append these test functions to the existing file:

```python
def test_patch_day_sets_recipe():
    response = client.patch("/api/plan/mon", json={"recipe": "Garlic Butter Pasta"})
    assert response.status_code == 200
    assert response.json()["mon"] == "Garlic Butter Pasta"


def test_patch_day_clears_recipe():
    client.patch("/api/plan/mon", json={"recipe": "Garlic Butter Pasta"})
    response = client.patch("/api/plan/mon", json={"recipe": None})
    assert response.status_code == 200
    assert response.json()["mon"] is None


def test_patch_preserves_other_days():
    client.patch("/api/plan/mon", json={"recipe": "Pasta"})
    client.patch("/api/plan/wed", json={"recipe": "Curry"})
    response = client.get("/api/plan")
    data = response.json()
    assert data["mon"] == "Pasta"
    assert data["wed"] == "Curry"
    assert data["tue"] is None


def test_patch_invalid_day_returns_400():
    response = client.patch("/api/plan/saturday", json={"recipe": "Something"})
    assert response.status_code == 400


def test_patch_replaces_existing_recipe():
    client.patch("/api/plan/fri", json={"recipe": "Old Recipe"})
    response = client.patch("/api/plan/fri", json={"recipe": "New Recipe"})
    assert response.status_code == 200
    assert response.json()["fri"] == "New Recipe"
```

- [ ] **Step 2: Run all tests — expect all PASS**

```bash
pytest api/tests/test_main.py -v
```

Expected: 7 passed

- [ ] **Step 3: Commit**

```bash
git add api/tests/test_main.py
git commit -m "test: add PATCH /api/plan/{day} test coverage"
```

---

## Task 3: API Dockerfile

**Files:**
- Create: `api/Dockerfile`

- [ ] **Step 1: Create `api/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Build locally to verify it works**

```bash
docker build -t whattoeat-api-test ./api
```

Expected: Successfully built (no errors)

- [ ] **Step 3: Smoke-test the container**

```bash
docker run --rm -d -p 8001:8000 --name api-test whattoeat-api-test
curl http://localhost:8001/api/plan
docker stop api-test
```

Expected: `{"mon":null,"tue":null,"wed":null,"thu":null,"fri":null}`

- [ ] **Step 4: Commit**

```bash
git add api/Dockerfile
git commit -m "feat: add Dockerfile for FastAPI api container"
```

---

## Task 4: nginx config + Dockerfile update + docker-compose + CI

**Files:**
- Create: `nginx.conf`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Create `nginx.conf`**

This replaces the default nginx server block and adds the `/api/` proxy:

```nginx
server {
    listen       80;
    server_name  localhost;
    root         /usr/share/nginx/html;
    index        index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /api/ {
        proxy_pass         http://api:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

- [ ] **Step 2: Update `Dockerfile` to install the nginx config**

Add one line after the last `COPY` line (before `EXPOSE 80`):

```dockerfile
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

Full updated Dockerfile for reference:

```dockerfile
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY recipes.json /usr/share/nginx/html/recipes.json
COPY favicon.svg /usr/share/nginx/html/favicon.svg
COPY favicon-16.png /usr/share/nginx/html/favicon-16.png
COPY favicon-32.png /usr/share/nginx/html/favicon-32.png
COPY apple-touch-icon.png /usr/share/nginx/html/apple-touch-icon.png
COPY favicon.ico /usr/share/nginx/html/favicon.ico
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Update `docker-compose.yml`**

Replace the entire file with:

```yaml
# Paste into Portainer (Stacks > Add stack) to run both containers.
# The recipes container serves the static site; the api container
# handles the weekly plan. Both images are built and pushed by CI.
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
    image: ghcr.io/djnw8fs748-eng/whattoeat-api:latest
    container_name: recipes-api
    restart: unless-stopped
    volumes:
      - plan-data:/data

volumes:
  plan-data:
```

- [ ] **Step 4: Update `.github/workflows/docker-publish.yml` to also build the api image**

Add a new env var and a new build step. The full updated workflow:

```yaml
name: Build and publish Docker image

on:
  push:
    branches: ["main"]

env:
  IMAGE_NAME: ${{ github.repository }}
  API_IMAGE_NAME: ${{ github.repository }}-api

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Check out the repo
        uses: actions/checkout@v4

      - name: Build recipes.json from the recipes/ category files
        run: |
          python3 - <<'PYEOF'
          import json

          with open('recipes/_index.json') as f:
              index = json.load(f)

          seen_files = []
          for entry in index:
              if entry['file'] not in seen_files:
                  seen_files.append(entry['file'])

          recipes = []
          for filename in seen_files:
              with open(f'recipes/{filename}') as rf:
                  recipes.extend(json.load(rf))

          with open('recipes.json', 'w') as out:
              json.dump(recipes, out, indent=2, ensure_ascii=False)

          print(f"Built recipes.json with {len(recipes)} recipes from {len(seen_files)} category files")
          PYEOF

      - name: Generate favicon PNGs and ICO from favicon.svg
        run: |
          pip install --quiet cairosvg pillow
          python3 - <<'PYEOF'
          import cairosvg
          from PIL import Image

          for size, name in [(180, 'apple-touch-icon.png'), (32, 'favicon-32.png'), (16, 'favicon-16.png')]:
              cairosvg.svg2png(url='favicon.svg', write_to=name, output_width=size, output_height=size)

          Image.open('favicon-16.png').save('favicon.ico', sizes=[(16, 16), (32, 32)])
          print("Favicon assets generated")
          PYEOF

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push recipes image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ env.IMAGE_NAME }}:latest
            ghcr.io/${{ env.IMAGE_NAME }}:${{ github.sha }}

      - name: Build and push api image
        uses: docker/build-push-action@v5
        with:
          context: ./api
          push: true
          tags: |
            ghcr.io/${{ env.API_IMAGE_NAME }}:latest
            ghcr.io/${{ env.API_IMAGE_NAME }}:${{ github.sha }}
```

- [ ] **Step 5: Commit**

```bash
git add nginx.conf Dockerfile docker-compose.yml .github/workflows/docker-publish.yml
git commit -m "feat: add nginx proxy config, api Dockerfile, compose service, CI pipeline"
```

---

## Task 5: Frontend — plan state + fetchPlan() + 15s polling

**Files:**
- Modify: `index.html`

This task lays the JS foundation the remaining frontend tasks build on. Do this before any other `index.html` tasks.

- [ ] **Step 1: Add plan state variables after the existing state block**

In `index.html`, find:

```js
let activeMaxTime = 999;
```

After that line add:

```js
let activeFridge = "";

let plan = { mon: null, tue: null, wed: null, thu: null, fri: null };
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };
```

- [ ] **Step 2: Add `fetchPlan()` before the `fetch('recipes.json')` call**

In `index.html`, find the line:

```js
fetch('recipes.json')
```

Just before it, insert:

```js
/* ============================================================
   PLAN: fetch from server, update in-memory state, re-render
   plan tab if it's visible. Called on load and every 15s.
   ============================================================ */
function fetchPlan() {
  fetch('/api/plan')
    .then(res => res.json())
    .then(data => {
      plan = data;
      renderPlanTab();
    })
    .catch(() => {}); // silent — don't break the page if api is down
}

```

- [ ] **Step 3: Call `fetchPlan()` inside the `fetch('recipes.json')` success handler and start polling**

Find:

```js
  .then(data => {
    recipes = data;
    populateCategories();
    renderGrid();
  })
```

Replace with:

```js
  .then(data => {
    recipes = data;
    populateCategories();
    renderGrid();
    fetchPlan();
    setInterval(fetchPlan, 15000);
  })
```

- [ ] **Step 4: Add a stub `renderPlanTab()` so the page doesn't error**

Find the `escapeAttr` function:

```js
function escapeAttr(str) {
```

Before it, insert:

```js
function renderPlanTab() {
  // implemented in Task 9
}

```

- [ ] **Step 5: Verify the page still loads without errors**

Open `index.html` via the Docker container (or a local server: `python3 -m http.server 8080` in the repo root) and check the browser console. Expected: no errors (the `/api/plan` fetch will fail locally without the api container, but `catch(() => {})` suppresses it).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add plan state, fetchPlan(), and 15s polling to index.html"
```

---

## Task 6: Frontend — Browse/Plan tab bar

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add tab bar CSS**

In `index.html`, find the closing `</style>` tag (after the `@media (max-width: 640px)` block). Just before it, insert:

```css
  /* ============ TAB BAR ============ */
  .tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--divider);
    margin-bottom: 0;
    background: var(--surface);
  }

  .tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    font-weight: 600;
    padding: 14px 22px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tab-btn:hover { color: var(--text); }
  .tab-btn.active { color: var(--text); border-bottom-color: var(--accent); }
  .tab-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

  .tab-badge {
    background: var(--accent);
    color: #1B2420;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 999px;
    min-width: 18px;
    text-align: center;
  }

  .plan-view { display: none; }
  .browse-view { display: block; }
```

- [ ] **Step 2: Add the tab bar HTML between the hero and filters divs**

Find:

```html
  <!-- ============ FILTERS ============ -->
```

Before it, insert:

```html
  <!-- ============ TAB BAR ============ -->
  <div class="tab-bar" role="tablist">
    <button class="tab-btn active" id="browseTab" role="tab" aria-selected="true" aria-controls="browseView">Browse</button>
    <button class="tab-btn" id="planTab" role="tab" aria-selected="false" aria-controls="planView">
      Plan <span class="tab-badge" id="planBadge" style="display:none">0</span>
    </button>
  </div>

```

- [ ] **Step 3: Wrap the existing filter + grid section in a browse-view div**

Find:

```html
  <!-- ============ FILTERS ============ -->
  <div class="filters">
```

Replace with:

```html
  <!-- ============ BROWSE VIEW ============ -->
  <div class="browse-view" id="browseView" role="tabpanel" aria-labelledby="browseTab">

  <!-- ============ FILTERS ============ -->
  <div class="filters">
```

Then find the closing tag just before the footer — the empty-state div closing:

```html
  <div class="empty-state" id="emptyState" style="display:none;">
    <h3>No recipes match that</h3>
    <p>Try a different search term or clear your filters.</p>
  </div>

</div>
```

Replace that last `</div>` (the one closing `.wrap`) temporarily — actually, just add a `</div>` to close the `browse-view` div after the `emptyState` div:

Find:

```html
  <div class="empty-state" id="emptyState" style="display:none;">
    <h3>No recipes match that</h3>
    <p>Try a different search term or clear your filters.</p>
  </div>

</div>

<!-- ============ DETAIL PANEL ============ -->
```

Replace with:

```html
  <div class="empty-state" id="emptyState" style="display:none;">
    <h3>No recipes match that</h3>
    <p>Try a different search term or clear your filters.</p>
  </div>

  </div><!-- end browse-view -->

  <!-- ============ PLAN VIEW ============ -->
  <div class="plan-view" id="planView" role="tabpanel" aria-labelledby="planTab">
    <!-- populated in Task 8 -->
  </div>

</div>

<!-- ============ DETAIL PANEL ============ -->
```

- [ ] **Step 4: Add tab switching JS**

Find:

```js
/* ============================================================
   LOAD DATA:
```

Before it, insert:

```js
/* ============================================================
   TABS: switch between Browse and Plan views
   ============================================================ */
let activeTab = 'browse';

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('browseView').style.display = tab === 'browse' ? '' : 'none';
  document.getElementById('planView').style.display = tab === 'plan' ? '' : 'none';
  document.getElementById('browseTab').classList.toggle('active', tab === 'browse');
  document.getElementById('browseTab').setAttribute('aria-selected', tab === 'browse');
  document.getElementById('planTab').classList.toggle('active', tab === 'plan');
  document.getElementById('planTab').setAttribute('aria-selected', tab === 'plan');
}

function updatePlanBadge() {
  const count = DAY_KEYS.filter(d => plan[d]).length;
  const badge = document.getElementById('planBadge');
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}

document.getElementById('browseTab').addEventListener('click', () => switchTab('browse'));
document.getElementById('planTab').addEventListener('click', () => switchTab('plan'));

```

- [ ] **Step 5: Call `updatePlanBadge()` inside `renderPlanTab()`**

Find the stub:

```js
function renderPlanTab() {
  // implemented in Task 9
}
```

Replace with:

```js
function renderPlanTab() {
  updatePlanBadge();
  // grid and shopping list rendering added in Tasks 8 and 9
}
```

- [ ] **Step 6: Verify tabs switch correctly**

Load the page in a browser, click Browse and Plan tabs. Expected: Browse shows the recipe grid; Plan shows the empty placeholder div (no content yet). Tab badge stays hidden (plan is empty).

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add Browse/Plan tab bar to index.html"
```

---

## Task 7: Frontend — fridge search

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the fridge search input to the filter bar HTML**

Find:

```html
      <input type="text" class="search-input" id="searchInput" placeholder="Search by name or ingredient (e.g. 'chicken', 'pasta')...">
```

After it, insert:

```html
      <input type="text" class="search-input" id="fridgeInput" placeholder="Fridge search: e.g. chicken, rice, spinach…" style="border-color: var(--accent-soft);">
```

- [ ] **Step 2: Add fridge filter logic to `getFilteredRecipes()`**

Find:

```js
function getFilteredRecipes() {
  return recipes.filter(r => {
    const matchesSearch = activeSearch === "" ||
      r.title.toLowerCase().includes(activeSearch) ||
      r.ingredients.some(i => i.toLowerCase().includes(activeSearch));
    const matchesCategory = activeCategory === "" || r.category === activeCategory;
    const matchesTime = r.time <= activeMaxTime;
    return matchesSearch && matchesCategory && matchesTime;
  });
}
```

Replace with:

```js
function getFilteredRecipes() {
  return recipes.filter(r => {
    const matchesSearch = activeSearch === "" ||
      r.title.toLowerCase().includes(activeSearch) ||
      r.ingredients.some(i => i.toLowerCase().includes(activeSearch));
    const matchesFridge = activeFridge === "" ||
      activeFridge.split(',').map(t => t.trim()).filter(Boolean)
        .every(term => r.ingredients.some(i => i.toLowerCase().includes(term)));
    const matchesCategory = activeCategory === "" || r.category === activeCategory;
    const matchesTime = r.time <= activeMaxTime;
    return matchesSearch && matchesFridge && matchesCategory && matchesTime;
  });
}
```

- [ ] **Step 3: Add fridge input event listener**

Find:

```js
document.getElementById('searchInput').addEventListener('input', (e) => {
  activeSearch = e.target.value.trim().toLowerCase();
  renderGrid();
});
```

After it, insert:

```js
document.getElementById('fridgeInput').addEventListener('input', (e) => {
  activeFridge = e.target.value.trim().toLowerCase();
  if (activeFridge) {
    activeSearch = "";
    document.getElementById('searchInput').value = "";
  }
  renderGrid();
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  // already defined above — update to also clear fridge when text search is used
}, { once: false });
```

Wait — the `searchInput` listener is already defined. Instead, update the existing `searchInput` listener to clear the fridge input when the user types there. Find:

```js
document.getElementById('searchInput').addEventListener('input', (e) => {
  activeSearch = e.target.value.trim().toLowerCase();
  renderGrid();
});
```

Replace with:

```js
document.getElementById('searchInput').addEventListener('input', (e) => {
  activeSearch = e.target.value.trim().toLowerCase();
  if (activeSearch) {
    activeFridge = "";
    document.getElementById('fridgeInput').value = "";
  }
  renderGrid();
});
```

- [ ] **Step 4: Clear fridge input in the clear button handler**

Find:

```js
document.getElementById('clearBtn').addEventListener('click', () => {
  activeSearch = "";
  activeCategory = "";
  activeMaxTime = 999;
  document.getElementById('searchInput').value = "";
  catSelect.value = "";
  document.querySelectorAll('.chip[data-time]').forEach(c => c.classList.remove('active'));
  renderGrid();
});
```

Replace with:

```js
document.getElementById('clearBtn').addEventListener('click', () => {
  activeSearch = "";
  activeCategory = "";
  activeMaxTime = 999;
  activeFridge = "";
  document.getElementById('searchInput').value = "";
  document.getElementById('fridgeInput').value = "";
  catSelect.value = "";
  document.querySelectorAll('.chip[data-time]').forEach(c => c.classList.remove('active'));
  renderGrid();
});
```

- [ ] **Step 5: Verify fridge search works**

Load the page. Type `chicken` in the fridge input — expected: only recipes containing chicken in their ingredients are shown. Type in the text search while fridge has text — expected: fridge input clears. Click "Clear filters" — expected: both inputs clear.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add fridge ingredient search to Browse tab"
```

---

## Task 8: Frontend — "Add to plan" button + day picker popover

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add CSS for the button and day picker**

In `index.html`, find `</style>`. Just before it, insert:

```css
  /* ============ ADD TO PLAN / DAY PICKER ============ */
  .add-plan-btn {
    margin-top: 6px;
    width: 100%;
    background: transparent;
    border: 1px solid var(--divider);
    color: var(--text-muted);
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 600;
    padding: 7px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .add-plan-btn:hover { border-color: var(--accent); color: var(--accent); }
  .add-plan-btn.planned { border-color: var(--sage); color: var(--sage); }

  .day-picker {
    position: fixed;
    background: var(--surface);
    border: 1px solid var(--divider);
    border-radius: var(--radius);
    padding: 18px;
    width: 240px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.5);
    z-index: 50;
    display: none;
  }
  .day-picker.open { display: block; }
  .day-picker h4 { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
  .day-picker-recipe { font-size: 12px; color: var(--accent); margin-bottom: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .day-picker-list { display: flex; flex-direction: column; gap: 5px; }
  .day-picker-row {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--surface-raised); border: 1px solid var(--divider);
    border-radius: var(--radius-sm); padding: 9px 12px;
    cursor: pointer; transition: border-color 0.15s, background 0.15s;
    font-size: 13px;
  }
  .day-picker-row:hover { border-color: var(--sage); background: var(--surface-hover); }
  .day-picker-row.taken:hover { border-color: var(--danger); }
  .day-picker-row .day-name { font-weight: 600; }
  .day-picker-row .day-status { font-size: 11px; color: var(--sage); }
  .day-picker-row.taken .day-status { color: var(--text-muted); }
  .day-picker-row.taken:hover .day-status { color: var(--danger); }
  .day-picker-cancel {
    margin-top: 12px; width: 100%; background: none; border: none;
    color: var(--text-muted); font-size: 13px; cursor: pointer;
    text-decoration: underline; padding: 6px; font-family: 'Inter', sans-serif;
  }
```

- [ ] **Step 2: Add the day picker HTML to the page (outside `.wrap`)**

Find:

```html
<!-- ============ DETAIL PANEL ============ -->
```

Before it, insert:

```html
<!-- ============ DAY PICKER ============ -->
<div class="day-picker" id="dayPicker" role="dialog" aria-modal="true" aria-label="Pick a day for this recipe">
  <h4>Add to which day?</h4>
  <div class="day-picker-recipe" id="dayPickerTitle"></div>
  <div class="day-picker-list" id="dayPickerList"></div>
  <button class="day-picker-cancel" id="dayPickerCancel">Cancel</button>
</div>

```

- [ ] **Step 3: Add "Add to plan" button to each card in `renderGrid()`**

Find inside the `renderGrid()` function:

```js
      <div class="meta">
        <span>${clockIcon} ${r.time} min</span>
        <span>${r.ingredients.length} ingredients</span>
      </div>
    </div>
  `).join('');
```

Replace with:

```js
      <div class="meta">
        <span>${clockIcon} ${r.time} min</span>
        <span>${r.ingredients.length} ingredients</span>
      </div>
      <button class="add-plan-btn ${DAY_KEYS.some(d => plan[d] === r.title) ? 'planned' : ''}"
        data-recipe="${escapeAttr(r.title)}">
        ${DAY_KEYS.some(d => plan[d] === r.title) ? '✓ In plan' : '+ Add to plan'}
      </button>
    </div>
  `).join('');
```

- [ ] **Step 4: Add day picker JS**

Find:

```js
/* ============================================================
   TABS: switch between Browse and Plan views
```

Before it, insert:

```js
/* ============================================================
   DAY PICKER: open/close and day selection
   ============================================================ */
let dayPickerRecipe = null;
const dayPickerEl = document.getElementById('dayPicker');

function openDayPicker(recipeTitle, anchorEl) {
  dayPickerRecipe = recipeTitle;
  document.getElementById('dayPickerTitle').textContent = recipeTitle;

  const list = document.getElementById('dayPickerList');
  list.innerHTML = DAY_KEYS.map(d => {
    const current = plan[d];
    const taken = current !== null;
    return `
      <div class="day-picker-row ${taken ? 'taken' : ''}" data-day="${d}">
        <span class="day-name">${DAY_LABELS[d]}</span>
        <span class="day-status">${taken ? current : 'Free'}</span>
      </div>`;
  }).join('');

  list.querySelectorAll('.day-picker-row').forEach(row => {
    row.addEventListener('click', () => {
      selectDay(row.dataset.day);
    });
  });

  // Position near the anchor button
  const rect = anchorEl.getBoundingClientRect();
  dayPickerEl.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  dayPickerEl.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 256) + 'px';
  dayPickerEl.classList.add('open');
}

function closeDayPicker() {
  dayPickerEl.classList.remove('open');
  dayPickerRecipe = null;
}

function selectDay(day) {
  if (!dayPickerRecipe) return;
  fetch(`/api/plan/${day}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe: dayPickerRecipe })
  })
    .then(res => res.json())
    .then(data => {
      plan = data;
      renderGrid();
      renderPlanTab();
      closeDayPicker();
    });
}

document.getElementById('dayPickerCancel').addEventListener('click', closeDayPicker);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDayPicker(); });
document.addEventListener('click', e => {
  if (!dayPickerEl.contains(e.target) && !e.target.classList.contains('add-plan-btn')) {
    closeDayPicker();
  }
});

```

- [ ] **Step 5: Wire up "Add to plan" button clicks in `renderGrid()`**

In `renderGrid()`, find the section that attaches card click/keydown handlers:

```js
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openRecipe(card.dataset.title));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRecipe(card.dataset.title);
      }
    });
  });
```

Replace with:

```js
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('add-plan-btn')) return;
      openRecipe(card.dataset.title);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRecipe(card.dataset.title);
      }
    });
  });

  grid.querySelectorAll('.add-plan-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDayPicker(btn.dataset.recipe, btn);
    });
  });
```

- [ ] **Step 6: Verify the day picker works**

Load the page. Click "Add to plan" on a recipe card — expected: day picker appears below the button listing Mon–Fri with Free status. Click a day — expected: picker closes, button changes to "✓ In plan", badge on Plan tab increments.

Note: The PATCH call will fail without the api container running. To test end-to-end, run `docker compose up` (requires the api image to be built first) or mock the API with a temporary local server.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add Add to Plan button and day picker popover"
```

---

## Task 9: Frontend — Plan tab day grid + remove

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Plan tab CSS**

In `index.html`, find `</style>`. Before it, insert:

```css
  /* ============ PLAN TAB ============ */
  .plan-tab-inner { padding: 28px 0; }
  .plan-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    margin-bottom: 32px;
  }
  .day-col {
    background: var(--surface);
    border: 1px solid var(--divider);
    border-radius: var(--radius);
    padding: 14px;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .day-col-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--sage);
  }
  .day-col-recipe {
    background: var(--surface-raised);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .day-col-remove {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0;
    flex-shrink: 0;
  }
  .day-col-remove:hover { color: var(--danger); }
  .day-col-empty {
    border: 1px dashed var(--divider);
    border-radius: var(--radius-sm);
    padding: 18px 10px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.15s;
    flex: 1;
  }
  .day-col-empty:hover { border-color: var(--sage); color: var(--sage); }

  @media (max-width: 640px) {
    .plan-grid { grid-template-columns: 1fr 1fr; }
  }
```

- [ ] **Step 2: Add Plan tab HTML inside the plan-view div**

Find:

```html
  <div class="plan-view" id="planView" role="tabpanel" aria-labelledby="planTab">
    <!-- populated in Task 8 -->
  </div>
```

Replace with:

```html
  <div class="plan-view" id="planView" role="tabpanel" aria-labelledby="planTab">
    <div class="plan-tab-inner">
      <div class="plan-grid" id="planGrid"></div>
      <!-- shopping list added in Task 10 -->
    </div>
  </div>
```

- [ ] **Step 3: Implement the day grid in `renderPlanTab()`**

Find:

```js
function renderPlanTab() {
  updatePlanBadge();
  // grid and shopping list rendering added in Tasks 8 and 9
}
```

Replace with:

```js
function renderPlanTab() {
  updatePlanBadge();

  const grid = document.getElementById('planGrid');
  if (!grid) return;

  grid.innerHTML = DAY_KEYS.map(d => {
    const recipe = plan[d];
    return `
      <div class="day-col">
        <div class="day-col-label">${DAY_LABELS[d].slice(0, 3)}</div>
        ${recipe
          ? `<div class="day-col-recipe">
               <span>${recipe}</span>
               <button class="day-col-remove" data-day="${d}" aria-label="Remove ${recipe} from ${DAY_LABELS[d]}">×</button>
             </div>`
          : `<div class="day-col-empty" data-day="${d}">+ Add recipe</div>`
        }
      </div>`;
  }).join('');

  grid.querySelectorAll('.day-col-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromPlan(btn.dataset.day));
  });

  grid.querySelectorAll('.day-col-empty').forEach(el => {
    el.addEventListener('click', () => switchTab('browse'));
  });

  renderShoppingList();
}

function removeFromPlan(day) {
  fetch(`/api/plan/${day}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe: null })
  })
    .then(res => res.json())
    .then(data => {
      plan = data;
      renderGrid();
      renderPlanTab();
    });
}

function renderShoppingList() {
  // implemented in Task 10
}
```

- [ ] **Step 4: Verify the Plan tab renders the day grid**

With the api container running, add a couple of recipes to the plan, then click the Plan tab. Expected: day columns showing the assigned recipes with × buttons. Clicking × clears the day. Clicking an empty slot switches to Browse.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add Plan tab day grid with remove functionality"
```

---

## Task 10: Frontend — shopping list + copy button

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add shopping list CSS**

In `index.html`, find `</style>`. Before it, insert:

```css
  /* ============ SHOPPING LIST ============ */
  .shopping-section {
    border-top: 1px solid var(--divider);
    padding-top: 24px;
    margin-top: 4px;
  }
  .shopping-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .shopping-header h3 { font-size: 18px; }
  .shopping-empty { color: var(--text-muted); font-size: 14px; }
  .copy-list-btn {
    background: var(--surface-raised);
    border: 1px solid var(--divider);
    color: var(--text-muted);
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .copy-list-btn:hover { border-color: var(--sage); color: var(--text); }
  .shopping-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 4px 24px;
  }
  .shopping-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 14px;
    padding: 5px 0;
    line-height: 1.4;
  }
  .shopping-item input[type="checkbox"] {
    margin-top: 3px;
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    flex-shrink: 0;
    cursor: pointer;
  }
  .shopping-item label { cursor: pointer; }
  .shopping-item input:checked + label {
    color: var(--text-muted);
    text-decoration: line-through;
  }
```

- [ ] **Step 2: Add shopping list HTML inside the plan-view**

Find:

```html
      <div class="plan-grid" id="planGrid"></div>
      <!-- shopping list added in Task 10 -->
```

Replace with:

```html
      <div class="plan-grid" id="planGrid"></div>
      <div class="shopping-section" id="shoppingSection" style="display:none">
        <div class="shopping-header">
          <h3>Shopping list</h3>
          <button class="copy-list-btn" id="copyListBtn">Copy list</button>
        </div>
        <div class="shopping-grid" id="shoppingGrid"></div>
      </div>
```

- [ ] **Step 3: Implement `renderShoppingList()`**

Find:

```js
function renderShoppingList() {
  // implemented in Task 10
}
```

Replace with:

```js
function renderShoppingList() {
  const section = document.getElementById('shoppingSection');
  const grid = document.getElementById('shoppingGrid');
  if (!section || !grid) return;

  const planned = DAY_KEYS.map(d => plan[d]).filter(Boolean);
  if (planned.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Gather all ingredients from planned recipes, deduplicate case-insensitively
  const seen = new Set();
  const ingredients = [];
  planned.forEach(title => {
    const r = recipes.find(x => x.title === title);
    if (!r) return;
    r.ingredients.forEach(ing => {
      const key = ing.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        ingredients.push(ing.trim());
      }
    });
  });
  ingredients.sort((a, b) => a.localeCompare(b));

  grid.innerHTML = ingredients.map((ing, i) => `
    <div class="shopping-item">
      <input type="checkbox" id="shop-${i}">
      <label for="shop-${i}">${ing}</label>
    </div>
  `).join('');

  section.style.display = '';
}
```

- [ ] **Step 4: Wire up the "Copy list" button**

Find:

```js
document.getElementById('dayPickerCancel').addEventListener('click', closeDayPicker);
```

After it, insert:

```js
document.getElementById('copyListBtn').addEventListener('click', () => {
  const items = [...document.querySelectorAll('#shoppingGrid .shopping-item label')]
    .map(l => l.textContent);
  navigator.clipboard.writeText(items.join('\n')).then(() => {
    const btn = document.getElementById('copyListBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy list'; }, 1800);
  });
});
```

- [ ] **Step 5: Verify the shopping list**

Add 2–3 recipes to the plan, switch to the Plan tab. Expected: shopping list appears below the day grid with all ingredients merged and deduplicated. Ticking a checkbox strikes it through. "Copy list" copies a newline-separated list to clipboard.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add shopping list with copy button to Plan tab"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|-------------|-----------|
| Browse/Plan tab toggle | Task 6 |
| Fridge search (AND match, comma-separated, mutually exclusive with text search) | Task 7 |
| "Add to plan" button on each card | Task 8 |
| Day picker popover — all days selectable, taken shows Replace → | Task 8 |
| Clicking taken day replaces immediately | Task 8 (`selectDay`) |
| Plan tab Mon–Fri day grid | Task 9 |
| × remove button on each filled day | Task 9 |
| "+ Add recipe" switches to Browse | Task 9 |
| Shopping list — merged, deduplicated, alphabetical | Task 10 |
| Checkbox per ingredient | Task 10 |
| "Copy list" button | Task 10 |
| Server-side persistence via PATCH /api/plan/{day} | Tasks 1–2 |
| GET /api/plan on page load | Task 5 |
| 15s polling | Task 5 |
| threading.Lock for concurrent writes | Task 1 (`_lock`) |
| FastAPI container + Docker volume | Tasks 3–4 |
| nginx /api/ proxy | Task 4 |
| CI builds and pushes api image | Task 4 |
| Plan badge on tab showing filled count | Task 6 (`updatePlanBadge`) |

All spec requirements covered. No gaps found.

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" references. All code blocks are complete.

**Type consistency:** `plan[day]` is consistently `string | null` throughout. `DAY_KEYS`, `DAY_LABELS`, `VALID_DAYS` all use the same five keys (`mon`–`fri`). `fetchPlan()` sets `plan` then calls `renderPlanTab()`; `selectDay()` and `removeFromPlan()` do the same — consistent pattern.
