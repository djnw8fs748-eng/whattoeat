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

1. Edit `recipes.json` only — `index.html` never needs to change for a recipe update. Each entry follows this shape:

   ```json
   {
     "title": "Recipe Name",
     "category": "Pasta",
     "time": 20,
     "teaser": "One sentence describing the dish.",
     "ingredients": ["200g pasta", "..."],
     "steps": ["First step.", "Second step.", "..."]
   }
   ```

2. `git add recipes.json && git commit -m "Update recipes" && git push` (or edit directly on GitHub).
3. GitHub Actions rebuilds and republishes the image automatically (a minute or two) — it copies whatever's in `recipes.json` at push time, so no other step is needed there.
4. In Portainer, go to the `recipes` stack and hit **Update the stack** (or **Pull and redeploy**) to grab the new image and restart the container with it.

That last step is the only manual part — Portainer won't automatically notice a new image unless you tell it to check, though tools like Watchtower can automate that too if you'd rather not do it by hand.

This split is also what makes a scheduled/automated update job practical: an agent just needs to read `recipes.json`, append new entries in the same shape, and push — it never has to parse or touch the page's HTML/CSS/JS to do it.
