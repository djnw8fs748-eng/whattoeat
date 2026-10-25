declare interface Window {
  renderGrid(): void;
  fetchPlan(): Promise<void>;
  activeCategory: string;
  activeMaxTime: number;
}
