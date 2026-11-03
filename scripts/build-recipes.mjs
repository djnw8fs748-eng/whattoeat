/* Builds recipes.json from the files in recipes/, and checks the data first.

   recipes.json is NOT stored in git — it's generated from:
     - recipes/_index.json   one entry per recipe, in the order they were added
     - recipes/<category>.json  the full recipes, one file per category
   It runs automatically before `npm run build` and `npm run dev`
   (see "prebuild"/"predev" in package.json), or on its own with
   `npm run recipes`.

   If anything is wrong (bad JSON, a duplicate title, an index entry with no
   matching recipe, a plain-string ingredient…) it prints every problem and
   exits with an error, so a broken recipe update fails the GitHub build
   instead of reaching the live site. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function readJson(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    problems.push(`${path}: file not found`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (err) {
    problems.push(`${path}: not valid JSON (${err.message})`);
    return null;
  }
}

const isNumber = v => typeof v === 'number' && Number.isFinite(v);
const isText = v => typeof v === 'string' && v.trim() !== '';

const index = readJson('recipes/_index.json');
if (!Array.isArray(index)) {
  if (index !== null) problems.push('recipes/_index.json: must be a list');
  fail();
}

// Same order as before: each category file once, in the order it first
// appears in the index, its recipes concatenated in file order.
const files = [];
index.forEach((entry, i) => {
  if (!isText(entry?.title) || !isText(entry?.file)) {
    problems.push(`recipes/_index.json entry ${i + 1}: needs "title" and "file"`);
  } else if (!files.includes(entry.file)) {
    files.push(entry.file);
  }
});

const recipes = [];
const fileOf = new Map();
for (const file of files) {
  const list = readJson(`recipes/${file}`);
  if (list === null) continue;
  if (!Array.isArray(list)) {
    problems.push(`recipes/${file}: must be a list of recipes`);
    continue;
  }
  for (const r of list) {
    recipes.push(r);
    fileOf.set(r, file);
  }
}

const seen = new Set();
for (const r of recipes) {
  const where = `recipes/${fileOf.get(r)}: "${r?.title ?? '(no title)'}"`;
  if (!isText(r?.title)) { problems.push(`${where} has no title`); continue; }
  if (seen.has(r.title)) problems.push(`${where} is a duplicate title`);
  seen.add(r.title);

  if (!isText(r.category)) problems.push(`${where} has no category`);
  if (!isNumber(r.time)) problems.push(`${where} "time" must be a number`);
  if (!isText(r.teaser)) problems.push(`${where} has no teaser`);
  if (!Number.isInteger(r.servings) || r.servings < 1) problems.push(`${where} "servings" must be a whole number of 1 or more`);
  if (!Array.isArray(r.steps) || r.steps.length === 0 || !r.steps.every(isText)) problems.push(`${where} "steps" must be a list of text`);

  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    problems.push(`${where} has no ingredients`);
  } else {
    r.ingredients.forEach((ing, i) => {
      const at = `${where} ingredient ${i + 1}`;
      if (typeof ing !== 'object' || ing === null) {
        problems.push(`${at} must be {qty, unit, item}, not ${JSON.stringify(ing)}`);
        return;
      }
      if (!isText(ing.item)) problems.push(`${at} has no "item"`);
      if (ing.qty !== null && !isNumber(ing.qty)) problems.push(`${at} "qty" must be a number or null`);
      if (ing.unit !== null && typeof ing.unit !== 'string') problems.push(`${at} "unit" must be text or null`);
      if (/mushroom/i.test(`${ing.unit ?? ''} ${ing.item ?? ''}`)) problems.push(`${at} contains mushroom`);
    });
  }
}

// The index and the category files must list exactly the same recipes.
const indexTitles = new Set(index.map(e => e?.title));
for (const e of index) {
  if (isText(e?.title) && !seen.has(e.title)) problems.push(`recipes/_index.json: "${e.title}" has no matching recipe in recipes/${e.file}`);
}
for (const title of seen) {
  if (!indexTitles.has(title)) problems.push(`"${title}" is in a category file but missing from recipes/_index.json`);
}

if (problems.length > 0) fail();

writeFileSync(join(root, 'recipes.json'), JSON.stringify(recipes, null, 2) + '\n');
console.log(`Built recipes.json: ${recipes.length} recipes from ${files.length} category files`);

function fail() {
  console.error(`Recipe data has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
