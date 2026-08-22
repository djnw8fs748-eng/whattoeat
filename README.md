# Recipe Catalogue — Docker image

A self-contained web page (70 easy dinner recipes) packaged as a Docker image, built automatically by GitHub whenever you push a change.

Repo: https://github.com/djnw8fs748-eng/whattoeat

## How the pieces fit together

- **`index.html`** — the page's structure, styling, and logic. It doesn't contain the recipes themselves — it fetches `recipes.json` when the page loads.
- **`recipes.json`** — just the recipe data: a plain list of objects (title, category, time, ingredients, steps). This is the *only* file that needs editing to add, remove, or change recipes — by you or by an automated agent.
- **`Dockerfile`** — instructions for turning those two files into a runnable container image (a tiny nginx web server with both baked in).
- **`.github/workflows/docker-publish.yml`** — tells GitHub to build that image and publish it to GitHub's container registry (GHCR) every time you push to `main`. You never run this by hand.
- **`docker-compose.yml`** — what you paste into Portainer to actually run the published image.

## Port details

- **Inside the container**, nginx always listens on port **80** — this comes from the base `nginx:alpine` image and isn't something you configure.
- **On the host**, the container is published on port **8090** (set in `docker-compose.yml` as `"8090:80"` — format is `host:container`).
- To use a different host port, change the left-hand number, e.g. `"8100:80"` to serve it on 8100 instead. The `80` on the right should stay as-is, since that's what nginx is actually listening on inside the container.
- Once running, the page is reachable at `http://<host-address>:8090` — e.g. `http://docker.dom.local:8090` — or via whatever hostname you set up in Nginx Proxy Manager if you're putting it behind a subdomain.

## One-time setup

**1. The GitHub repo**

Already created: [`djnw8fs748-eng/whattoeat`](https://github.com/djnw8fs748-eng/whattoeat).

**2. Watch it build**

Go to the **Actions** tab on the repo. You'll see "Build and publish Docker image" running. Once it's green, your image is live at:

```
ghcr.io/djnw8fs748-eng/whattoeat:latest
```

**3. If the repo is private**

By default, a package built from a private repo is also private, which means Portainer would need to authenticate to pull it. Easiest fix: go to your GitHub profile → **Packages** → click the `whattoeat` package → **Package settings** → change visibility to **Public**. The image itself contains nothing sensitive (just the HTML page), so this is generally fine even if the repo stays private.

## Deploying it

In Portainer: **Stacks → Add stack**, paste in `docker-compose.yml` from this repo, and deploy — the image name is already set to `ghcr.io/djnw8fs748-eng/whattoeat:latest`, no username swap needed.

Then visit `http://docker.dom.local:8090` (or wherever you pointed it) to see the page. Add an Nginx Proxy Manager proxy host if you want it on a subdomain like `whattoeat.domlittler.com` instead — point it at the same host and the 8090 port.

## Updating the recipes later

`recipes.json` is a **generated build artifact** — don't edit it directly, and don't commit hand edits to it. The real source of truth is the `recipes/` directory: one JSON file per category (`recipes/pasta.json`, `recipes/curry.json`, etc.) plus `recipes/_index.json`, a flat list of `{title, category, time, file}` entries used to build the browse/filter UI and to know which category files to stitch together. GitHub Actions rebuilds `recipes.json` from these files on every push to `main` (see `.github/workflows/docker-publish.yml`).

1. Edit the appropriate `recipes/<category>.json` file (or add a new one for a new category). Each entry follows this shape:

   ```json
   {
     "title": "Recipe Name",
     "category": "Pasta",
     "time": 20,
     "teaser": "One sentence describing the dish.",
     "ingredients": [
       { "qty": 200, "unit": "g", "item": "pasta" },
       { "qty": null, "unit": null, "item": "salt to taste" }
     ],
     "steps": ["First step.", "Second step.", "..."],
     "servings": 2
   }
   ```

   Ingredients must be `{qty, unit, item}` objects, not plain strings — a plain string breaks `renderShoppingList()` in `index.html`. `qty` and `unit` can be `null` for ingredients with no sensible quantity (e.g. "salt to taste"), but `item` is required. `servings` is required and must be an integer — it's the base serving count the ingredient quantities above are written for; the app scales quantities up/down from it, and a missing `servings` produces `NaN` in that scaling.

2. If you added a new file or category, add a matching entry (or entries) to `recipes/_index.json` — one per recipe, pointing at the `file` you just added/edited.
3. `git add recipes/... && git commit -m "Update recipes" && git push` (or edit directly on GitHub).
4. GitHub Actions rebuilds `recipes.json` from `recipes/_index.json` + the category files and republishes the image automatically (a minute or two) — no other step is needed there.
5. In Portainer, go to the `recipes` stack and hit **Update the stack** (or **Pull and redeploy**) to grab the new image and restart the container with it.

That last step is the only manual part — Portainer won't automatically notice a new image unless you tell it to check, though tools like Watchtower can automate that too if you'd rather not do it by hand.

This split is also what makes a scheduled/automated update job practical: an agent just needs to read/write the relevant `recipes/<category>.json` file and keep `recipes/_index.json` in sync, then push — it never has to parse or touch the page's HTML/CSS/JS, or `recipes.json`, to do it.

## Planning features

- **7-day (Mon–Sun) planning.** The Plan tab lets you assign a recipe to any day of the week, not just weekdays — plans are stored per calendar week (keyed by the Monday date) via a small FastAPI backend (`api/main.py`) backed by `/data/store.json`.
- **Servings scaler.** Each planned day carries its own `servings` count; the recipe panel and the shopping list scale ingredient quantities up or down from the recipe's base `servings` to match.
- **Named templates and week history.** You can save the current week's plan as a reusable named template and reload it later (**Save as template** / **Load template**), and you can browse past weeks and copy any of them into the current week (**History**). Both live in the same `store.json`, alongside the current/past weekly plans.
