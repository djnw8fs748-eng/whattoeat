/* The whole app. This component owns all the state — recipes, filters,
   the week's plan, ratings — and passes pieces of it down to the
   components that draw each part of the page. When state changes,
   React redraws whatever depends on it automatically. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '@atlaskit/badge';
import Button from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import { AutoDismissFlag, FlagGroup } from '@atlaskit/flag';
import Heading from '@atlaskit/heading';
import SearchIcon from '@atlaskit/icon/core/search';
import StatusErrorIcon from '@atlaskit/icon/core/status-error';
import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';
import { colorForIndex, type CategoryColor } from './components/CategoryTag';
import FilterBar from './components/FilterBar';
import PlanView from './components/PlanView';
import RecipeCard from './components/RecipeCard';
import RecipePanel from './components/RecipePanel';
import TopNav from './components/TopNav';
import { api } from './lib/api';
import { filterRecipes, getCategories, getRecentTitles } from './lib/recipes';
import { applyColorMode, type ColorMode } from './theme';
import {
  DAY_KEYS, EMPTY_PLAN, NO_FILTERS,
  type DayKey, type Filters, type Plan, type Rating, type Ratings, type Recipe,
} from './types';

// Keep the plan and ratings in sync with other devices/tabs.
const REFRESH_MS = 15000;

type View = 'browse' | 'plan';
const VIEWS: View[] = ['browse', 'plan'];

export default function App({ initialColorMode }: { initialColorMode: ColorMode }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [addOrder, setAddOrder] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [ratings, setRatings] = useState<Ratings>({});
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [templateNames, setTemplateNames] = useState<string[]>([]);
  const [view, setView] = useState<View>('browse');
  const [panelTitle, setPanelTitle] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dayPickerFor, setDayPickerFor] = useState<string | null>(null);
  const [flashTitle, setFlashTitle] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>(initialColorMode);
  const [errors, setErrors] = useState<{ id: number; message: string }[]>([]);

  const showError = useCallback((message: string) => {
    setErrors(prev => [{ id: Date.now(), message }, ...prev]);
  }, []);

  const refreshTemplateNames = useCallback(() => {
    api.getTemplateNames().then(setTemplateNames).catch(() => {});
  }, []);

  /* ---------- Load data once the page opens ---------- */
  useEffect(() => {
    let timers: number[] = [];
    // The API being down shouldn't break browsing, so these fail silently.
    const fetchPlan = () => api.getPlan().then(setPlan).catch(() => {});
    const fetchRatings = () => api.getRatings().then(setRatings).catch(() => {});

    api.getRecipes()
      .then(data => {
        setRecipes(data);
        setLoadState('ready');
        fetchPlan();
        fetchRatings();
        refreshTemplateNames();
        timers = [window.setInterval(fetchPlan, REFRESH_MS), window.setInterval(fetchRatings, REFRESH_MS)];
        // Best-effort: only used to work out which recipes get the "New" badge.
        api.getRecipeIndex().then(entries => setAddOrder(entries.map(e => e.title))).catch(() => {});
      })
      .catch(err => {
        console.error('Could not load recipes.json:', err);
        setLoadState('error');
      });

    return () => timers.forEach(t => clearInterval(t));
  }, [refreshTemplateNames]);

  /* ---------- Derived values (recalculated only when their inputs change) ---------- */
  const categories = useMemo(() => getCategories(recipes), [recipes]);
  const categoryColors = useMemo(() => {
    const map: Record<string, CategoryColor> = {};
    categories.forEach((c, i) => { map[c] = colorForIndex(i); });
    return map;
  }, [categories]);
  const filtered = useMemo(() => filterRecipes(recipes, filters, ratings), [recipes, filters, ratings]);
  const recentTitles = useMemo(() => getRecentTitles(recipes, addOrder), [recipes, addOrder]);
  const plannedTitles = useMemo(() => new Set(DAY_KEYS.map(d => plan[d]?.recipe)), [plan]);
  const plannedCount = DAY_KEYS.filter(d => plan[d]).length;
  const panelRecipe = recipes.find(r => r.title === panelTitle) ?? null;

  /* ---------- Actions ---------- */
  const openRecipe = (title: string) => {
    setDayPickerFor(null);
    setPanelTitle(title);
    setPanelOpen(true);
  };
  const closeRecipe = useCallback(() => setPanelOpen(false), []);

  const surprise = () => {
    if (filtered.length === 0) return;
    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    setView('browse');
    openRecipe(pick.title);
    setFlashTitle(pick.title);
    setTimeout(() => setFlashTitle(null), 1600);
  };

  const toggleColorMode = () => {
    const next = colorMode === 'dark' ? 'light' : 'dark';
    setColorMode(next);
    applyColorMode(next);
  };

  const rate = (title: string, rating: Rating) => {
    const next = ratings[title] === rating ? null : rating; // clicking again clears it
    api.setRating(title, next)
      .then(setRatings)
      .catch(err => showError(`Could not save rating — is the API running? (${err.message})`));
  };

  const pickDay = (title: string, day: DayKey, servings: number) => {
    setDayPickerFor(null);
    api.setDay(day, title, servings)
      .then(setPlan)
      .catch(err => showError(`Could not save plan — is the API running? (${err.message})`));
  };

  const removeDay = (day: DayKey) => {
    api.setDay(day, null)
      .then(setPlan)
      .catch(err => showError(`Could not update plan — is the API running? (${err.message})`));
  };

  const saveTemplate = (name: string) => {
    api.saveTemplate(name, plan)
      .then(refreshTemplateNames)
      .catch(err => showError(`Could not save template — is the API running? (${err.message})`));
  };

  const loadTemplate = (name: string) => {
    api.applyTemplate(name)
      .then(setPlan)
      .catch(err => showError(`Could not load template — is the API running? (${err.message})`));
  };

  const copyHistoryWeek = (weekKey: string) =>
    api.copyHistoryWeek(weekKey)
      .then(data => { setPlan(data); return true; })
      .catch(err => { showError(`Could not copy week — is the API running? (${err.message})`); return false; });

  /* ---------- Page ---------- */
  return (
    <>
      <TopNav colorMode={colorMode} onToggleColorMode={toggleColorMode} onSurprise={surprise} />

      <main className="wrap">
        <div className="tabs-shell">
          <Tabs
            id="views"
            selected={VIEWS.indexOf(view)}
            onChange={index => setView(VIEWS[index])}
          >
            <TabList>
              <Tab testId="browseTab">Browse</Tab>
              <Tab testId="planTab">
                <span className="tab-label">
                  Meal plan
                  {plannedCount > 0 && <span id="planBadge"><Badge appearance="primary">{plannedCount}</Badge></span>}
                </span>
              </Tab>
            </TabList>

            <TabPanel>
              <div id="browseView" style={{ width: '100%' }}>
                <div className="view-heading">
                  <SearchIcon label="" color="var(--ds-icon-brand)" />
                  <Heading size="large" as="h1">Browse recipes</Heading>
                </div>
                <p className="view-subtitle">
                  <strong id="resultCount">{filtered.length}</strong> recipes match your filters
                </p>

                <FilterBar filters={filters} setFilters={setFilters} categories={categories} />

                {loadState === 'error' ? (
                  <div id="emptyState">
                    <EmptyState
                      header="Could not load recipes.json"
                      description="Make sure recipes.json is in the same folder as this page."
                      headingLevel={2}
                    />
                  </div>
                ) : loadState === 'ready' && filtered.length === 0 ? (
                  <div id="emptyState">
                    <EmptyState
                      header="No recipes match that"
                      description="Try a different search term or clear your filters."
                      headingLevel={2}
                      primaryAction={<Button appearance="primary" onClick={() => setFilters(() => NO_FILTERS)}>Clear filters</Button>}
                    />
                  </div>
                ) : (
                  <div className="grid" id="grid">
                    {filtered.map(r => (
                      <RecipeCard
                        key={r.title}
                        recipe={r}
                        categoryColor={categoryColors[r.category] ?? colorForIndex(0)}
                        isNew={recentTitles.has(r.title)}
                        rating={ratings[r.title]}
                        isPlanned={plannedTitles.has(r.title)}
                        isFlashing={flashTitle === r.title}
                        plan={plan}
                        isDayPickerOpen={dayPickerFor === r.title}
                        onOpen={() => openRecipe(r.title)}
                        onToggleDayPicker={() => setDayPickerFor(cur => (cur === r.title ? null : r.title))}
                        onCloseDayPicker={() => setDayPickerFor(null)}
                        onPickDay={(day, servings) => pickDay(r.title, day, servings)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </TabPanel>

            <TabPanel>
              <div id="planView" style={{ width: '100%' }}>
                <PlanView
                  plan={plan}
                  recipes={recipes}
                  templateNames={templateNames}
                  onRemoveDay={removeDay}
                  onBrowse={() => setView('browse')}
                  onSaveTemplate={saveTemplate}
                  onLoadTemplate={loadTemplate}
                  onCopyHistoryWeek={copyHistoryWeek}
                />
              </div>
            </TabPanel>
          </Tabs>
        </div>
      </main>

      <footer>Pick something, cook it, eat it. That's the whole system.</footer>

      <RecipePanel
        recipe={panelRecipe}
        isOpen={panelOpen}
        categoryColor={panelRecipe ? categoryColors[panelRecipe.category] ?? colorForIndex(0) : colorForIndex(0)}
        rating={panelRecipe ? ratings[panelRecipe.title] : undefined}
        onRate={rating => panelRecipe && rate(panelRecipe.title, rating)}
        onClose={closeRecipe}
      />

      {/* Error messages pop up in the corner, Atlassian "flag" style */}
      <FlagGroup onDismissed={id => setErrors(prev => prev.filter(e => e.id !== id))}>
        {errors.map(e => (
          <AutoDismissFlag
            key={e.id}
            id={e.id}
            icon={<StatusErrorIcon label="Error" color="var(--ds-icon-danger)" />}
            title="Something went wrong"
            description={<span id="apiErrorMsg">{e.message}</span>}
          />
        ))}
      </FlagGroup>
    </>
  );
}

