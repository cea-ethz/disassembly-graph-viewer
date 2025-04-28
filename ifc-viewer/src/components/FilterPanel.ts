import { TogglingPanel } from "./TogglingPanel";

export abstract class FilterPanel {
  protected togglingPanel: TogglingPanel;
  protected activeFilters: Set<string>;

  constructor(panelId: string, propertiesPanelId: string) {
    this.togglingPanel = new TogglingPanel(panelId);
    this.activeFilters = new Set();

    this.togglingPanel.observeCollapseOf(propertiesPanelId, (isCollapsed) => {
      const container = this.togglingPanel.getContainer();
      if (container) {
        container.style.right = isCollapsed ? "60px" : "340px";
      }
    });
  }

  private createFilterItem(className: string, checked: boolean): HTMLElement {
    const item = document.createElement("div");
    item.className = "filter-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `filter-${className}`;
    checkbox.checked = checked;

    const label = document.createElement("label");
    label.htmlFor = `filter-${className}`;

    if (className.startsWith("Ifc")) {
      label.textContent = `Type ${className}`;
    } else if (className.startsWith("IFC")) {
      label.textContent = className.replace("IFC", "");
    } else {
      label.textContent = className;
    }

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        this.activeFilters.add(className);
      } else {
        this.activeFilters.delete(className);
      }
      this.applyFilters();
    });

    if (checked) {
      this.activeFilters.add(className);
    }

    item.appendChild(checkbox);
    item.appendChild(label);
    return item;
  }

  public updateFilters(data: Map<string, boolean>): void {
    console.log("[FilterPanel] Updating filters:", data);
    const content = this.togglingPanel.getContent();
    if (!content) return;

    content.innerHTML = "";
    this.activeFilters.clear();

    Array.from(data.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([className, isChecked]) => {
        const item = this.createFilterItem(className, isChecked);
        content.appendChild(item);
      });

    this.applyFilters();
  }

  protected abstract applyFilters(): void;
}
