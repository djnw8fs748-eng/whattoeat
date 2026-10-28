import { SimpleTag } from '@atlaskit/tag';

/* Each category gets one of nine Atlassian accent colours, assigned in
   alphabetical order so the same category always gets the same colour. */
export const CATEGORY_COLORS = [
  'blue', 'green', 'purple', 'orange', 'magenta', 'teal', 'lime', 'red', 'yellow',
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export function colorForIndex(index: number): CategoryColor {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export default function CategoryTag({ text, color }: { text: string; color: CategoryColor }) {
  return <SimpleTag text={text} color={color} />;
}
