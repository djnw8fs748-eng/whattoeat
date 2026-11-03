import { IconButton } from '@atlaskit/button/new';
import AddIcon from '@atlaskit/icon/core/add';
import MinusIcon from '@atlaskit/icon/core/minus';

interface Props {
  /** Prefix for the element ids, e.g. "panelServings" → #panelServingsMinus */
  idPrefix: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

/** "Serves  −  2  +" — servings can never drop below 1. */
export default function ServingsStepper({ idPrefix, label, value, onChange }: Props) {
  return (
    <span className="stepper">
      {label}
      <IconButton
        id={`${idPrefix}Minus`}
        icon={MinusIcon}
        label="Decrease servings"
        spacing="compact"
        appearance="subtle"
        onClick={() => onChange(Math.max(1, value - 1))}
      />
      <span id={`${idPrefix}Value`} className="stepper-value" aria-live="polite">{value}</span>
      <IconButton
        id={`${idPrefix}Plus`}
        icon={AddIcon}
        label="Increase servings"
        spacing="compact"
        appearance="subtle"
        onClick={() => onChange(value + 1)}
      />
    </span>
  );
}
