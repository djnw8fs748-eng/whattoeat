/* Slide-over panel with a recipe's full ingredients and method.
   Close with the ✕ button, by clicking the dimmed backdrop, or Escape. */
import { useEffect, useRef, useState } from 'react';
import Button, { IconButton } from '@atlaskit/button/new';
import Checkbox from '@atlaskit/checkbox';
import Heading from '@atlaskit/heading';
import ClockIcon from '@atlaskit/icon/core/clock';
import CrossIcon from '@atlaskit/icon/core/cross';
import ThumbsDownIcon from '@atlaskit/icon/core/thumbs-down';
import ThumbsUpIcon from '@atlaskit/icon/core/thumbs-up';
import { scaleIngredient } from '../lib/recipes';
import type { Rating, Recipe } from '../types';
import CategoryTag, { type CategoryColor } from './CategoryTag';
import ServingsStepper from './ServingsStepper';

interface Props {
  recipe: Recipe | null;
  isOpen: boolean;
  categoryColor: CategoryColor;
  rating: Rating | undefined;
  onRate: (rating: Rating) => void;
  onClose: () => void;
}

export default function RecipePanel({ recipe, isOpen, categoryColor, rating, onRate, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // Move focus into the panel when it opens, and put it back afterwards.
  useEffect(() => {
    if (isOpen) {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
    } else {
      returnFocusTo.current?.focus();
      returnFocusTo.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <>
      <div id="backdrop" className={`backdrop${isOpen ? ' open' : ''}`} onClick={onClose} />
      <div
        id="panel"
        className={`panel${isOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panelTitle"
      >
        <div className="panel-close">
          <IconButton id="panelClose" ref={closeRef} icon={CrossIcon} label="Close recipe" appearance="subtle" onClick={onClose} />
        </div>
        <div id="panelContent">
          {/* key= resets the servings stepper whenever a different recipe opens */}
          {recipe && <PanelContent key={recipe.title} {...{ recipe, categoryColor, rating, onRate }} />}
        </div>
      </div>
    </>
  );
}

function PanelContent({ recipe: r, categoryColor, rating, onRate }: {
  recipe: Recipe;
  categoryColor: CategoryColor;
  rating: Rating | undefined;
  onRate: (rating: Rating) => void;
}) {
  const [servings, setServings] = useState(r.servings);
  const ratio = servings / r.servings;

  return (
    <>
      <CategoryTag text={r.category} color={categoryColor} />
      <Heading size="xlarge" as="h2" id="panelTitle">{r.title}</Heading>
      <div className="meta">
        <span className="meta-item"><ClockIcon label="" /> {r.time} minutes</span>
        <ServingsStepper idPrefix="panelServings" label="Serves" value={servings} onChange={setServings} />
      </div>
      <div className="panel-rating" id="panelRatingButtons">
        <Button
          id="ratingUpBtn"
          iconBefore={ThumbsUpIcon}
          aria-pressed={rating === 'up'}
          isSelected={rating === 'up'}
          onClick={() => onRate('up')}
        >
          Like
        </Button>
        <Button
          id="ratingDownBtn"
          iconBefore={ThumbsDownIcon}
          aria-pressed={rating === 'down'}
          isSelected={rating === 'down'}
          onClick={() => onRate('down')}
        >
          Dislike
        </Button>
      </div>
      <p className="teaser">{r.teaser}</p>
      <h3 className="panel-section-heading">Ingredients</h3>
      <ul className="ingredient-list" id="panelIngredientList">
        {r.ingredients.map((ing, i) => (
          <li key={i}>
            <Checkbox id={`ing-${i}`} label={scaleIngredient(ing, ratio)} />
          </li>
        ))}
      </ul>
      <h3 className="panel-section-heading">Method</h3>
      <ol className="steps-list">
        {r.steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
    </>
  );
}
