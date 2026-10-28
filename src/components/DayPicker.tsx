/* The "Add to which day?" menu that pops up from a card's
   Add to plan button. Shown inside an Atlaskit Popup (see RecipeCard). */
import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { DAY_KEYS, DAY_LABELS, type DayKey, type Plan, type Recipe } from '../types';
import ServingsStepper from './ServingsStepper';

interface Props {
  recipe: Recipe;
  plan: Plan;
  onPick: (day: DayKey, servings: number) => void;
  onCancel: () => void;
}

export default function DayPicker({ recipe, plan, onPick, onCancel }: Props) {
  const [servings, setServings] = useState(recipe.servings);

  return (
    <div className="day-picker">
      <h3>Add to which day?</h3>
      <div className="day-picker-recipe" id="dayPickerTitle">{recipe.title}</div>
      <div className="day-picker-list" id="dayPickerList">
        {DAY_KEYS.map(d => {
          const current = plan[d];
          return (
            <button
              key={d}
              type="button"
              className={`day-picker-row ${current ? 'taken' : 'free'}`}
              data-day={d}
              onClick={() => onPick(d, servings)}
              aria-label={current ? `${DAY_LABELS[d]}, replace ${current.recipe}` : `${DAY_LABELS[d]}, free`}
            >
              <span className="day-name">{DAY_LABELS[d]}</span>
              <span className="day-status">{current ? current.recipe : 'Free'}</span>
            </button>
          );
        })}
      </div>
      <div className="day-picker-footer">
        <ServingsStepper idPrefix="dayPickerServings" label="Servings" value={servings} onChange={setServings} />
        <Button id="dayPickerCancel" appearance="subtle" spacing="compact" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
