import { IFCViewer } from "../IFCViewer";

export class SnapshotPanel {
  private container: HTMLElement;
  private panel: HTMLElement;
  private enlargedImageSrc?: string;

  constructor(viewer: IFCViewer) {
    this.container = viewer.getContainer();
    this.createPanel();
  }

  private createPanel(): void {
    this.panel = document.createElement("div");
    this.panel.className = "snapshot-panel";
    Object.assign(this.panel.style, {
      position: "absolute",
      top: "60px",
      left: "370px",
      width: "300px",
      padding: "8px",
      background: "rgba(0, 0, 0, 0.8)",
      border: "1px solid white",
      borderRadius: "4px",
      zIndex: "2000",
      display: "none",
      color: "white",
      maxHeight: "calc(100vh - 70px)",
      overflowY: "auto",
    });

    // Create a container for the buttons at the top
    const buttonContainer = document.createElement("div");
    Object.assign(buttonContainer.style, {
      display: "flex",
      justifyContent: "flex-end",
      gap: "4px",
      marginBottom: "20px",
    });

    // Close button
    const closeButton = document.createElement("button");
    closeButton.innerText = "Close";
    Object.assign(closeButton.style, {
      background: "red",
      color: "white",
      border: "none",
      cursor: "pointer",
      padding: "2px 6px",
      fontSize: "12px",
      borderRadius: "2px",
    });
    closeButton.addEventListener("click", () => this.hide());

    // Enlarge button
    const enlargeButton = document.createElement("button");
    enlargeButton.innerText = "Enlarge";
    Object.assign(enlargeButton.style, {
      background: "#1a73e8",
      color: "white",
      border: "none",
      cursor: "pointer",
      padding: "2px 6px",
      fontSize: "12px",
      borderRadius: "2px",
    });
    enlargeButton.addEventListener("click", () => {
      if (this.enlargedImageSrc) {
        window.open(this.enlargedImageSrc, "_blank");
      }
    });

    buttonContainer.appendChild(enlargeButton);
    buttonContainer.appendChild(closeButton);
    this.panel.appendChild(buttonContainer);

    // Image element to display snapshot
    const imgElem = document.createElement("img");
    imgElem.id = "snapshot-image";
    Object.assign(imgElem.style, {
      width: "100%",
      marginTop: "0", // Remove margin since we have the button container
    });
    imgElem.addEventListener("load", () => {
      console.log("SnapshotPanel: Image loaded successfully.");
    });
    this.panel.appendChild(imgElem);

    this.container.appendChild(this.panel);
  }

  public show(verticalImageSrc: string, horizontalImageSrc?: string): void {
    const imgElem = this.panel.querySelector(
      "#snapshot-image"
    ) as HTMLImageElement;
    imgElem.src = verticalImageSrc;
    this.enlargedImageSrc = horizontalImageSrc || verticalImageSrc;
    console.log(
      "SnapshotPanel: Showing snapshot with src:",
      verticalImageSrc.slice(0, 50) + "..."
    );
    this.panel.style.display = "block";
  }

  public hide(): void {
    this.panel.style.display = "none";
  }
}
