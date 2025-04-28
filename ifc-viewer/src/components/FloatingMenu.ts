import { IFCViewer } from "../IFCViewer";
import { Connections } from "./Connections";

export class FloatingMenu {
  private viewer: IFCViewer;
  private connections: Connections;
  private menu: HTMLElement | null = null;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.connections = new Connections(viewer);
    this.setupFloatingMenu();
  }

  private setupFloatingMenu(): void {
    this.menu = document.createElement("div");
    this.menu.className = "floating-menu";

    const style = document.createElement("style");
    style.textContent = `
      .floating-menu {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .menu-row {
        display: flex;
        flex-direction: row;
        gap: 4px;
      }

      .menu-row.connection-controls {
        display: none;
      }

      .menu-row.connection-controls.active {
        display: flex;
      }

      .menu-btn {
        position: relative;
      }

      .menu-btn.active i {
        color: #2196F3;
      }

      .menu-btn input[type="checkbox"] {
        display: none;
      }

      .menu-btn input[type="checkbox"]:not(:checked) + i {
        opacity: 0.5;
      }

      .menu-btn input[type="checkbox"]:checked + i {
        opacity: 1;
        color: #2196F3;
      }

      .menu-btn.visibility-btn {
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .menu-btn.visibility-btn:not(.disabled) {
        opacity: 1;
      }

      .menu-btn.visibility-btn.active i {
        color: #2196F3;
        opacity: 1;
      }

      .menu-btn.visibility-btn:not(.active) i {
        opacity: 0.5;
      }
    `;
    document.head.appendChild(style);

    this.menu.innerHTML = `
      <div class="menu-row main-controls">
        <button class="menu-btn" title="Hide/Show Selected (Space)">
          <i class="fas fa-eye"></i>
        </button>
        <button class="menu-btn" title="Isolate Selected">
          <i class="fas fa-expand"></i>
        </button>
        <button class="menu-btn" title="Show All">
          <i class="fas fa-border-all"></i>
        </button>
        <button class="menu-btn analyze-btn" title="Analyze Connections">
          <i class="fas fa-project-diagram"></i>
        </button>
      </div>
      <div class="menu-row connection-controls">
        <button class="menu-btn visibility-btn" title="Show Points" disabled>
          <input type="checkbox" class="type-visibility" data-type="point" checked>
          <i class="fas fa-circle"></i>
        </button>
        <button class="menu-btn visibility-btn" title="Show Lines" disabled>
          <input type="checkbox" class="type-visibility" data-type="line" checked>
          <i class="fas fa-minus"></i>
        </button>
        <button class="menu-btn visibility-btn" title="Show Surfaces" disabled>
          <input type="checkbox" class="type-visibility" data-type="surface" checked>
          <i class="fas fa-square"></i>
        </button>
        <button class="menu-btn visibility-btn" title="Show Labels" disabled>
          <input type="checkbox" class="show-labels">
          <i class="fas fa-tag"></i>
        </button>
      </div>
    `;

    // Update the visibility buttons to handle clicks
    const visibilityBtns = this.menu.querySelectorAll(".visibility-btn");
    visibilityBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (btn.hasAttribute("disabled")) return;

        const checkbox = btn.querySelector(
          'input[type="checkbox"]'
        ) as HTMLInputElement;
        if (!checkbox) return;

        // Toggle checkbox
        checkbox.checked = !checkbox.checked;

        // Manually trigger change event
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));

        // Prevent double-triggering
        e.stopPropagation();
      });
    });

    // Keep existing checkbox change handlers
    const typeToggles =
      this.menu.querySelectorAll<HTMLInputElement>(".type-visibility");
    typeToggles.forEach((toggle) => {
      toggle.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        const type = target.dataset.type;
        const button = target.closest(".menu-btn");

        console.log("Visibility toggle clicked:", {
          type,
          checked: target.checked,
          button: button?.className,
          hasVisualizer: !!this.connections?.connectionVisualizer,
        });

        if (this.connections?.connectionVisualizer && type) {
          console.log("Calling setTypeVisibility:", type, target.checked);
          this.connections.connectionVisualizer.setTypeVisibility(
            type,
            target.checked
          );

          // Update button state
          if (button) {
            console.log("Updating button state:", target.checked);
            button.classList.toggle("active", target.checked);
          }
        }
      });
    });

    // Add event listener for label visibility
    const labelToggle =
      this.menu.querySelector<HTMLInputElement>(".show-labels");
    if (labelToggle) {
      labelToggle.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        const button = target.closest(".menu-btn");

        console.log("Label toggle clicked:", {
          checked: target.checked,
          button: button?.className,
          hasVisualizer: !!this.connections?.connectionVisualizer,
        });

        if (this.connections?.connectionVisualizer) {
          console.log("Calling setGlobalLabelVisibility:", target.checked);
          this.connections.connectionVisualizer.setGlobalLabelVisibility(
            target.checked
          );

          // Update button state
          if (button) {
            console.log("Updating button state:", target.checked);
            button.classList.toggle("active", target.checked);
          }
        }
      });
    }

    // Add event listeners
    const buttons = this.menu.querySelectorAll(".menu-btn");
    const [hideBtn, isolateBtn, showAllBtn, connectionsBtn] =
      Array.from(buttons);

    if (hideBtn) {
      hideBtn.addEventListener("click", () => {
        hideBtn.classList.toggle("active");
        this.viewer.toggleSelectedVisibility();
      });
    }

    if (isolateBtn) {
      isolateBtn.addEventListener("click", () => {
        isolateBtn.classList.toggle("active");
        this.viewer.isolateSelected();
      });
    }

    if (showAllBtn) {
      showAllBtn.addEventListener("click", () => this.viewer.showAll());
    }

    if (connectionsBtn) {
      connectionsBtn.addEventListener("click", () => {
        const connectionsSection = document.querySelector<HTMLElement>(
          ".connections-section"
        );
        const connectionControls = this.menu!.querySelector(
          ".connection-controls"
        );
        const visibilityBtns =
          connectionControls?.querySelectorAll(".visibility-btn");

        if (connectionsSection) {
          const isHidden = connectionsSection.classList.toggle("hidden");
          connectionsBtn.classList.toggle("active", !isHidden);
          connectionControls?.classList.toggle("active", !isHidden);

          if (!isHidden) {
            this.connections.analyzeConnections();
            visibilityBtns?.forEach((btn) => {
              btn.removeAttribute("disabled");
              btn.classList.remove("disabled");

              // Initialize visibility states
              const checkbox = btn.querySelector(
                'input[type="checkbox"]'
              ) as HTMLInputElement;
              if (checkbox) {
                const type = checkbox.dataset.type;
                if (type) {
                  this.connections.connectionVisualizer?.setTypeVisibility(
                    type,
                    checkbox.checked
                  );
                } else {
                  // Handle label visibility
                  this.connections.connectionVisualizer?.setGlobalLabelVisibility(
                    checkbox.checked
                  );
                }
                btn.classList.toggle("active", checkbox.checked);
              }
            });
          } else {
            this.connections.exitConnectionMode();
            visibilityBtns?.forEach((btn) => {
              btn.setAttribute("disabled", "");
              btn.classList.add("disabled");
              btn.classList.remove("active");
            });
          }
        }
      });
    }

    document.body.appendChild(this.menu);

    // Create connections section in the left panel
    const modelsContent = document.querySelector(".models-content");
    if (modelsContent) {
      const connectionsSection = document.createElement("div");
      connectionsSection.className = "connections-section hidden";
      connectionsSection.innerHTML = `
        <div class="section-header">
          <h3>Connections</h3>
        </div>
        <div class="connections-list"></div>
      `;

      modelsContent.appendChild(connectionsSection);
    }
  }
}
