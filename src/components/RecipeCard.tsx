/* One recipe in the Browse grid. Clicking anywhere on the card opens the
   recipe; the title is also a real button so it works by keyboard. */
import { useEffect, useRef } from 'react';
import Button from '@atlaskit/button/new';
import AddIcon from '@atlaskit/icon/core/add';
import CheckMarkIcon from '@atlaskit/icon/core/check-mark';
import ClockIcon from '@atlaskit/icon/core/clock';
import ThumbsDownIcon from '@atlaskit/icon/core/thumbs-down';
import ThumbsUpIcon from '@atlaskit/icon/core/thumbs-up';
import Lozenge from '@atlaskit/lozenge';
import Popup from '@atlaskit/popup';
import type { DayKey, Plan, Rating, Recipe } from '../types';
import CategoryTag, { type CategoryColor } from './CategoryTag';
import DayPicker from './DayPicker';

interface Props {
  recipe: Recipe;
  categoryColor: CategoryColor;
  isNew: boolean;
  rating: Rating | undefined;
  isPlanned: boolean;
  isFlashing: boolean;
  plan: Plan;
  isDayPickerOpen: boolean;
  onOpen: () => void;
  onToggleDayPicker: () => void;
  onCloseDayPicker: () => void;
  onPickDay: (day: DayKey, servings: number) => void;
}

export default function RecipeCard(props: Props) {
  const { recipe: r, rating, isPlanned, isFlashing } = props;
  const cardRef = useRef<HTMLDivElement>(null);

  // "Surprise me" highlights the chosen card; scroll it into view too.
  useEffect(() => {
    if (isFlashing) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [isFlashing]);

  return (
    <div
      ref={cardRef}
      className={`card${isFlashing ? ' flash' : ''}`}
      data-title={r.title}
      onClick={props.onOpen}
    >
      <div className="card-top">
        <span className="card-badges">
          <span className="category-pill"><CategoryTag text={r.category} color={props.categoryColor} /></span>
          {props.isNew && <span className="new-badge"><Lozenge appearance="new">New</Lozenge></span>}
        </span>
        {rating && (
          <span className="rating-indicator" data-rating={rating}>
            {rating === 'up'
              ? <ThumbsUpIcon label="Liked" color="var(--ds-icon-success)" />
              : <ThumbsDownIcon label="Disliked" color="var(--ds-icon-danger)" />}
          </span>
        )}
      </div>
      <h2>
        <button type="button" className="card-title-btn" onClick={e => { e.stopPropagation(); props.onOpen(); }}>
          {r.title}
        </button>
      </h2>
      <p className="teaser">{r.teaser}</p>
      <div className="meta">
        <span className="meta-item"><ClockIcon label="" size="small" /> {r.time} min</span>
        <span className="meta-item">{r.ingredients.length} ingredients</span>
      </div>
      <Popup
        id="dayPicker"
        role="dialog"
        label="Pick a day for this recipe"
        isOpen={props.isDayPickerOpen}
        onClose={props.onCloseDayPicker}
        placement="bottom-start"
        content={() => (
          // Popup content is rendered elsewhere in the page, but React still
          // bubbles its clicks up to this card — stop them opening the recipe.
          <div onClick={e => e.stopPropagation()}>
            <DayPicker recipe={r} plan={props.plan} onPick={props.onPickDay} onCancel={props.onCloseDayPicker} />
          </div>
        )}
        trigger={triggerProps => (
          <Button
            {...triggerProps}
            testId="add-plan-btn"
            data-planned={isPlanned}
            shouldFitContainer
            iconBefore={isPlanned ? CheckMarkIcon : AddIcon}
            onClick={e => { e.stopPropagation(); props.onToggleDayPicker(); }}
          >
            {isPlanned ? 'In plan' : 'Add to plan'}
          </Button>
        )}
      />
    </div>
  );
}
