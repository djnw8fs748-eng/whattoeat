/* Everything needed for the planned week, grouped by supermarket aisle. */
import { useMemo, useState } from 'react';
import Button from '@atlaskit/button/new';
import Checkbox from '@atlaskit/checkbox';
import Heading from '@atlaskit/heading';
import CopyIcon from '@atlaskit/icon/core/copy';
import { buildShoppingList } from '../lib/shopping';
import type { Plan, Recipe } from '../types';

export default function ShoppingList({ plan, recipes }: { plan: Plan; recipes: Recipe[] }) {
  const groups = useMemo(() => buildShoppingList(plan, recipes), [plan, recipes]);
  const [copied, setCopied] = useState(false);

  const copyList = () => {
    const text = groups.flatMap(g => g.items.map(i => i.label)).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <section className="shopping-section" id="shoppingSection">
      <div className="shopping-header">
        <Heading size="medium" as="h2">Shopping list</Heading>
        <Button id="copyListBtn" iconBefore={CopyIcon} onClick={copyList}>
          {copied ? 'Copied!' : 'Copy list'}
        </Button>
      </div>
      <div id="shoppingGrid">
        {groups.map((g, groupIndex) => (
          <div className="shopping-group" key={g.name}>
            <h3 className="shopping-group-heading">{g.name}</h3>
            <div className="shopping-grid">
              {g.items.map((item, i) => (
                <div className="shopping-item" data-sort-key={item.sortKey} key={item.sortKey + item.label}>
                  <Checkbox id={`shop-${groupIndex}-${i}`} label={item.label} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
