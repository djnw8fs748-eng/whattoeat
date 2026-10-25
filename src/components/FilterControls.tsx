/* The individual filter controls. They're used twice — in the desktop
   filter bar and in the mobile bottom sheet — and both read the same
   React state, so they always stay in sync automatically. */
import Button from '@atlaskit/button/new';
import ThumbsUpIcon from '@atlaskit/icon/core/thumbs-up';
import Select from '@atlaskit/select';
import { ALLERGENS, TIME_OPTIONS } from '../lib/recipes';
import type { Filters } from '../types';

type SetFilters = (update: (prev: Filters) => Filters) => void;

interface Option { label: string; value: string }

export function CategorySelect({ id, categories, value, onChange }: {
  id: string;
  categories: string[];
  value: string;
  onChange: (category: string) => void;
}) {
  const options: Option[] = [
    { label: 'All categories', value: '' },
    ...categories.map(c => ({ label: c, value: c })),
  ];
  return (
    <Select<Option>
      id={id}
      inputId={`${id}-input`}
      classNamePrefix="cat-select"
      aria-label="Category"
      options={options}
      value={options.find(o => o.value === value) ?? options[0]}
      onChange={option => onChange(option?.value ?? '')}
      isSearchable={false}
      menuPortalTarget={document.body}
      styles={{ menuPortal: base => ({ ...base, zIndex: 600 }) }}
    />
  );
}

/** "Under 20 min / Under 30 min / Any time" — only one can be on at a time. */
export function TimeButtons({ filters, setFilters, id }: { filters: Filters; setFilters: SetFilters; id?: string }) {
  return (
    <div id={id} className="button-group" role="group" aria-label="Cooking time">
      {TIME_OPTIONS.map(t => {
        const selected = filters.maxTime === t.value;
        return (
          <Button
            key={t.value}
            data-time={t.value}
            aria-pressed={selected}
            isSelected={selected}
            onClick={() => setFilters(f => ({ ...f, maxTime: t.value }))}
          >
            {t.label}
          </Button>
        );
      })}
    </div>
  );
}

/** "Free from: Gluten, Dairy, …" — any number can be on at once. */
export function AllergenButtons({ filters, setFilters, id }: { filters: Filters; setFilters: SetFilters; id?: string }) {
  const toggle = (key: string) => setFilters(f => ({
    ...f,
    allergens: f.allergens.includes(key) ? f.allergens.filter(a => a !== key) : [...f.allergens, key],
  }));
  return (
    <div id={id} className="button-group" role="group" aria-label="Free from allergens">
      {id && <span className="group-label">Free from:</span>}
      {ALLERGENS.map(a => {
        const selected = filters.allergens.includes(a.key);
        return (
          <Button
            key={a.key}
            data-allergen={a.key}
            aria-pressed={selected}
            isSelected={selected}
            spacing="compact"
            onClick={() => toggle(a.key)}
          >
            {a.label}
          </Button>
        );
      })}
    </div>
  );
}

export function LikedOnlyButton({ filters, setFilters, id }: { filters: Filters; setFilters: SetFilters; id: string }) {
  return (
    <Button
      id={id}
      iconBefore={ThumbsUpIcon}
      aria-pressed={filters.likedOnly}
      isSelected={filters.likedOnly}
      onClick={() => setFilters(f => ({ ...f, likedOnly: !f.likedOnly }))}
    >
      Liked only
    </Button>
  );
}
