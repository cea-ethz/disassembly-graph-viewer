export class TogglingPanel {
  private panel: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private content: HTMLElement | null = null;

  constructor(
    panelId: string,
    toggleSelector = ".toggle-button",
    containerSelector = ".toggle-panel",
    contentSelector = ".toggle-content"
  ) {
    this.panel = document.querySelector(`#${panelId}`);
    if (!this.panel) {
      console.error("Failed to find panel with ID:", panelId);
      return;
    }

    this.container = this.panel.querySelector(containerSelector);
    if (!this.container) {
      console.error("Failed to find panel container:", containerSelector);
      return;
    }

    this.content = this.panel.querySelector(contentSelector);
    if (!this.content) {
      console.error("Failed to find panel content:", contentSelector);
      return;
    }

    const toggleBtn = this.panel.querySelector(
      toggleSelector
    ) as HTMLButtonElement;
    if (!toggleBtn) {
      console.error("Failed to find panel toggle button:", toggleSelector);
      return;
    }

    toggleBtn.addEventListener("click", () => {
      this.container!.classList.toggle("collapsed");
    });
  }

  public getContainer(): HTMLElement | null {
    return this.container;
  }

  public getContent(): HTMLElement | null {
    return this.content;
  }

  public observeCollapseOf(
    otherPanelId: string,
    onChange: (isCollapsed: boolean) => void
  ): void {
    const otherPanel = document.querySelector(
      `#${otherPanelId} > .properties-panel`
    );
    if (!otherPanel) {
      console.error("Failed to find other panel to observe:", otherPanelId);
      return;
    }

    const observer = new MutationObserver(() => {
      const isCollapsed = otherPanel.classList.contains("collapsed");
      onChange(isCollapsed);
    });

    observer.observe(otherPanel, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
}
