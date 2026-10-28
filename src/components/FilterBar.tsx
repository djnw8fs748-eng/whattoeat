/* The sticky filter bar above the recipe grid. On phones most of the
   controls are hidden and a "Filters" button opens a bottom sheet
   containing the same controls instead. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@atlaskit/button/new';
import FilterIcon from '@atlaskit/icon/core/filter';
import SearchIcon from '@atlaskit/icon/core/search';
import Textfield from '@atlaskit/textfield';
import { countActiveFilters } from '../lib/recipes';
import { NO_FILTERS, type Filters } from '../types';
import { AllergenButtons, CategorySelect, LikedOnlyButton, TimeButtons } from './FilterControls';

interface Props {
  filters: Filters;
  setFilters: (update: (prev: Filters) => Filters) => void;
  categories: string[];
}

export default function FilterBar({ filters, setFilters, categories }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const activeCount = countActiveFilters(filters);

  const clearAll = () => setFilters(() => NO_FILTERS);
  const setCategory = (category: string) => setFilters(f => ({ ...f, category }));

  const closeSheet = () => {
    setSheetOpen(false);
    filtersBtnRef.current?.focus();
  };

  return (
    <div className="filters">
      <div className="filters-row">
        <div className="filters-search">
          <Textfield
            id="searchInput"
            aria-label="Search recipes"
            placeholder="Search recipes or ingredients… (use commas for AND, e.g. chicken, rice)"
            elemBeforeInput={<span style={{ display: 'flex', paddingInlineStart: 8 }}><SearchIcon label="" color="var(--ds-icon-subtle)" /></span>}
            value={filters.search}
            onChange={e => {
              const search = e.currentTarget.value;
              setFilters(f => ({ ...f, search }));
            }}
          />
        </div>
        <div className="filters-category filters-desktop-only">
          <CategorySelect id="catSelect" categories={categories} value={filters.category} onChange={setCategory} />
        </div>
        <div className="filters-mobile-only">
          <Button
            id="filtersBtn"
            ref={filtersBtnRef}
            iconBefore={FilterIcon}
            aria-expanded={sheetOpen}
            aria-controls="filterSheet"
            isSelected={activeCount > 0}
            onClick={() => (sheetOpen ? closeSheet() : setSheetOpen(true))}
          >
            {activeCount > 0 ? `Filters • ${activeCount}` : 'Filters'}
          </Button>
        </div>
      </div>
      <div className="filters-row filters-desktop-only">
        <TimeButtons id="timeChips" filters={filters} setFilters={setFilters} />
        <AllergenButtons id="allergenChips" filters={filters} setFilters={setFilters} />
        <LikedOnlyButton id="likedChip" filters={filters} setFilters={setFilters} />
        <Button id="clearBtn" appearance="subtle" onClick={clearAll}>Clear filters</Button>
      </div>

      <FilterSheet open={sheetOpen} onClose={closeSheet}>
        <div className="sheet-section">
          <label className="sheet-label" htmlFor="sheetCatSelect-input">Category</label>
          <div className="sheet-full">
            <CategorySelect id="sheetCatSelect" categories={categories} value={filters.category} onChange={setCategory} />
          </div>
        </div>
        <div className="sheet-section">
          <div className="sheet-label">Time</div>
          <TimeButtons id="sheetTimeChips" filters={filters} setFilters={setFilters} />
        </div>
        <div className="sheet-section">
          <div className="sheet-label">Free from</div>
          <AllergenButtons filters={filters} setFilters={setFilters} />
        </div>
        <div className="sheet-section">
          <LikedOnlyButton id="sheetLikedChip" filters={filters} setFilters={setFilters} />
        </div>
        <div className="sheet-section">
          <Button id="sheetClearBtn" appearance="subtle" onClick={clearAll}>Clear all filters</Button>
        </div>
      </FilterSheet>
    </div>
  );
}

/* Slide-up sheet for phones. It stays mounted for the length of the
   closing animation, then disappears. Swipe down, tap outside or press
   Escape to close. It's rendered straight into <body> (a "portal") so it
   layers above the sticky header instead of being trapped inside the
   sticky filter bar's layer. */
function FilterSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Wait a frame so the browser sees the "closed" position first and animates.
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), 250);
    return () => clearTimeout(timer);
  }, [open]);

  // Move keyboard focus into the sheet when it opens
  useEffect(() => {
    if (shown) sheetRef.current?.querySelector<HTMLElement>('input, button')?.focus();
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <>
      <div id="filterSheetBackdrop" className={shown ? 'visible' : ''} aria-hidden="true" onClick={onClose} />
      <div
        id="filterSheet"
        ref={sheetRef}
        className={shown ? 'open' : ''}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        onTouchStart={e => { touchStartY.current = e.touches[0].clientY; }}
        onTouchEnd={e => { if (e.changedTouches[0].clientY - touchStartY.current > 80) onClose(); }}
      >
        <div className="sheet-handle" />
        <div className="sheet-content">{children}</div>
      </div>
    </>,
    document.body,
  );
}
