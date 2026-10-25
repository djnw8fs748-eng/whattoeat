import Button, { IconButton } from '@atlaskit/button/new';
import RandomizeIcon from '@atlaskit/icon-lab/core/randomize';
import TakeoutFoodIcon from '@atlaskit/icon/core/takeout-food';
import ThemeIcon from '@atlaskit/icon/core/theme';
import type { ColorMode } from '../theme';

interface Props {
  colorMode: ColorMode;
  onToggleColorMode: () => void;
  onSurprise: () => void;
}

export default function TopNav({ colorMode, onToggleColorMode, onSurprise }: Props) {
  const nextMode = colorMode === 'dark' ? 'light' : 'dark';
  return (
    <header className="topnav">
      <div className="topnav-brand">
        <span className="topnav-mark"><TakeoutFoodIcon label="" color="var(--ds-icon-inverse)" /></span>
        <span className="topnav-name">What's for dinner</span>
      </div>
      <div className="topnav-spacer" />
      <IconButton
        id="darkModeToggle"
        icon={ThemeIcon}
        label={`Switch to ${nextMode} mode`}
        isTooltipDisabled={false}
        appearance="subtle"
        onClick={onToggleColorMode}
      />
      <Button id="surpriseBtn" appearance="discovery" iconBefore={RandomizeIcon} onClick={onSurprise}>
        Surprise me
      </Button>
    </header>
  );
}
