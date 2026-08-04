# Recipe Catalogue — Docker image

A self-contained web page (70 easy dinner recipes) packaged as a Docker image, built automatically by GitHub whenever you push a change.

Repo: https://github.com/djnw8fs748-eng/whattoeat

## How the pieces fit together

- **`index.html`** — the recipe page itself.
- **`Dockerfile`** — instructions for turning that HTML file into a runnable container image (a tiny nginx web server with the file baked in).
- **`.github/workflows/docker-publish.yml`** — tells GitHub to build that image and publish it to GitHub's container registry (GHCR) every time you push to `main`. You never run this by hand.
- **`docker-compose.yml`** — what you paste into Portainer to actually run the published image.

## Port details

- **Inside the container**, nginx always listens on port **80** — this comes from the base `nginx:alpine` image and isn't something you configure.
- **On the host**, the container is published on port **8090** (set in `docker-compose.yml` as `"8090:80"` — format is `host:container`).
- To use a different host port, change the left-hand number, e.g. `"8100:80"` to serve it on 8100 instead. The `80` on the right should stay as-is, since that's what nginx is actually listening on inside the container.
- Once running, the page is reachable at `http://<host-address>:8090` — e.g. `http://docker.dom.local:8090` — or via whatever hostname you set up in Nginx Proxy Manager if you're putting it behind a subdomain.

## One-time setup

**1. The GitHub repo**

Already created: [`djnw8fs748-eng/whattoeat`](https://github.com/djnw8fs748-eng/whattoeat) — it currently has just a README in it, so we'll add these files alongside it.

**2. Push this folder's contents to it**

Since the repo already exists with a commit in it, clone it first rather than starting a fresh repo:

```bash
git clone https://github.com/djnw8fs748-eng/whattoeat.git
```

Then copy `index.html`, `Dockerfile`, `docker-compose.yml`, and the `.github` folder from this download into the cloned `whattoeat` folder (overwrite the existing README only if you want to replace it — otherwise just add these alongside it), then:

```bash
cd whattoeat
git add .
git commit -m "Add recipe catalogue and Docker build"
git push
```

(If you haven't set up `gh auth login` or a credential helper, GitHub will prompt you to authenticate the first time you push — follow its instructions.)

**3. Watch it build**

Go to the **Actions** tab on the repo. You'll see "Build and publish Docker image" running. Once it's green, your image is live at:

```
ghcr.io/djnw8fs748-eng/whattoeat:latest
```

**4. If the repo is private**

By default, a package built from a private repo is also private, which means Portainer would need to authenticate to pull it. Easiest fix: go to your GitHub profile → **Packages** → click the `whattoeat` package → **Package settings** → change visibility to **Public**. The image itself contains nothing sensitive (just the HTML page), so this is generally fine even if the repo stays private.

## Deploying it

In Portainer: **Stacks → Add stack**, paste in `docker-compose.yml` from this folder, and deploy — the image name is already set to `ghcr.io/djnw8fs748-eng/whattoeat:latest`, no username swap needed.

Then visit `http://docker.dom.local:8090` (or wherever you pointed it) to see the page. Add an Nginx Proxy Manager proxy host if you want it on a subdomain like `whattoeat.domlittler.com` instead — point it at the same host and the 8090 port.

## Updating the recipes later

1. Edit `index.html` in this folder.
2. `git add . && git commit -m "Update recipes" && git push`
3. GitHub Actions rebuilds and republishes the image automatically (a minute or two).
4. In Portainer, go to the `recipes` stack and hit **Update the stack** (or **Pull and redeploy**) to grab the new image and restart the container with it.

That last step is the only manual part — Portainer won't automatically notice a new image unless you tell it to check, though tools like Watchtower (which I know you already run in your setup) can automate that too if you'd rather not do it by hand.

