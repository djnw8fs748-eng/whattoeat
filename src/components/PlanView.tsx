/* The "Meal plan" tab: the week at a glance, saved templates, past
   weeks, and the shopping list built from the plan. */
import { useState } from 'react';
import Button, { IconButton } from '@atlaskit/button/new';
import Heading from '@atlaskit/heading';
import AddIcon from '@atlaskit/icon/core/add';
import CalendarIcon from '@atlaskit/icon/core/calendar';
import CrossIcon from '@atlaskit/icon/core/cross';
import Select from '@atlaskit/select';
import { api } from '../lib/api';
import { DAY_KEYS, DAY_LABELS, type DayKey, type HistoryWeek, type Plan, type Recipe } from '../types';
import { ConfirmModal, TemplateNameModal, type ConfirmRequest } from './Modals';
import ShoppingList from './ShoppingList';

interface Option { label: string; value: string }

interface Props {
  plan: Plan;
  recipes: Recipe[];
  templateNames: string[];
  onRemoveDay: (day: DayKey) => void;
  onBrowse: () => void;
  onSaveTemplate: (name: string) => void;
  onLoadTemplate: (name: string) => void;
  onCopyHistoryWeek: (weekKey: string) => Promise<boolean>;
}

export default function PlanView(props: Props) {
  const { plan } = props;
  const hasPlan = DAY_KEYS.some(d => plan[d]);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [naming, setNaming] = useState(false);
  const [templateChoice, setTemplateChoice] = useState<string | null>(null);

  const templateOptions: Option[] = props.templateNames.map(n => ({ label: n, value: n }));

  return (
    <div className="plan-tab-inner">
      <div className="view-heading">
        <CalendarIcon label="" color="var(--ds-icon-brand)" />
        <Heading size="large" as="h1">Meal plan</Heading>
      </div>
      <p className="view-subtitle">Plan your week, then build a shopping list from it.</p>

      <div className="plan-grid" id="planGrid">
        {DAY_KEYS.map(d => {
          const entry = plan[d];
          return (
            <div className="day-col" key={d}>
              <div className="day-col-label">{DAY_LABELS[d].slice(0, 3)}</div>
              {entry ? (
                <div className="day-col-recipe">
                  <span>
                    <span className="day-col-recipe-title">{entry.recipe}</span>
                    <span className="day-col-recipe-servings">Serves {entry.servings}</span>
                  </span>
                  <IconButton
                    testId="day-col-remove"
                    icon={CrossIcon}
                    label={`Remove ${entry.recipe} from ${DAY_LABELS[d]}`}
                    appearance="subtle"
                    spacing="compact"
                    onClick={() => props.onRemoveDay(d)}
                  />
                </div>
              ) : (
                <button type="button" className="day-col-empty" data-day={d} onClick={props.onBrowse}>
                  <AddIcon label="" size="small" /> Add recipe
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="plan-toolbar template-controls">
        <Button id="saveTemplateBtn" isDisabled={!hasPlan} onClick={() => setNaming(true)}>Save as template</Button>
        <div className="toolbar-select">
          <Select<Option>
            id="loadTemplateSelect"
            inputId="loadTemplateSelect-input"
            classNamePrefix="template-select"
            aria-label="Saved templates"
            placeholder="Load template…"
            options={templateOptions}
            value={templateOptions.find(o => o.value === templateChoice) ?? null}
            onChange={o => setTemplateChoice(o?.value ?? null)}
            noOptionsMessage={() => 'No saved templates yet'}
            menuPortalTarget={document.body}
            styles={{ menuPortal: base => ({ ...base, zIndex: 600 }) }}
          />
        </div>
        <Button
          id="loadTemplateBtn"
          isDisabled={!templateChoice}
          onClick={() => templateChoice && setConfirm({
            title: `Load "${templateChoice}"?`,
            body: "This will overwrite the current week's plan.",
            confirmLabel: 'Load template',
            onConfirm: () => props.onLoadTemplate(templateChoice),
          })}
        >
          Load
        </Button>
        <HistoryControls onCopy={props.onCopyHistoryWeek} askToConfirm={setConfirm} />
      </div>

      {hasPlan && <ShoppingList plan={plan} recipes={props.recipes} />}

      <TemplateNameModal isOpen={naming} onSave={props.onSaveTemplate} onClose={() => setNaming(false)} />
      <ConfirmModal request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/* "History": pick a past week, see what was planned, copy it into this week. */
function HistoryControls({ onCopy, askToConfirm }: {
  onCopy: (weekKey: string) => Promise<boolean>;
  askToConfirm: (request: ConfirmRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [weeks, setWeeks] = useState<HistoryWeek[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [weekPlan, setWeekPlan] = useState<Plan | null>(null);

  const toggle = () => {
    if (!open) api.getHistoryWeeks().then(setWeeks).catch(() => setWeeks([]));
    setOpen(!open);
  };

  const choose = (weekKey: string | null) => {
    setSelected(weekKey);
    setWeekPlan(null);
    if (weekKey) api.getHistoryWeek(weekKey).then(setWeekPlan).catch(() => setWeekPlan(null));
  };

  const options: Option[] = weeks.map(w => ({ label: `${w.week_key} (${w.days_filled} planned)`, value: w.week_key }));
  const plannedDays = weekPlan ? DAY_KEYS.filter(d => weekPlan[d]) : [];

  return (
    <div className="history-controls">
      <Button id="historyBtn" aria-expanded={open} aria-controls="historyPanel" isSelected={open} onClick={toggle}>
        History
      </Button>
      {open && (
        <div id="historyPanel">
          <div className="toolbar-select">
            <Select<Option>
              id="historyWeekList"
              inputId="historyWeekList-input"
              classNamePrefix="history-select"
              aria-label="Past weeks"
              placeholder="Select a past week…"
              options={options}
              value={options.find(o => o.value === selected) ?? null}
              onChange={o => choose(o?.value ?? null)}
              noOptionsMessage={() => 'No past weeks yet'}
              menuPortalTarget={document.body}
              styles={{ menuPortal: base => ({ ...base, zIndex: 600 }) }}
            />
          </div>
          <div id="historyGrid">
            {weekPlan && (plannedDays.length > 0 ? (
              <ul>
                {plannedDays.map(d => (
                  <li key={d}>{DAY_LABELS[d]}: {weekPlan[d]!.recipe} · serves {weekPlan[d]!.servings}</li>
                ))}
              </ul>
            ) : <p>No recipes planned that week.</p>)}
          </div>
          <div>
            <Button
              id="historyCopyBtn"
              isDisabled={!selected}
              onClick={() => selected && askToConfirm({
                title: 'Copy this week?',
                body: 'This will overwrite the current plan with the selected week.',
                confirmLabel: 'Copy to current week',
                onConfirm: () => { onCopy(selected).then(ok => { if (ok) setOpen(false); }); },
              })}
            >
              Copy to current week
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
