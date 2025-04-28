# Connection Detection in IFC Viewer

An overview of how we find the connections between building elements in our hackathon project.

---

## 1. Collecting Candidate Elements

The process starts by traversing all loaded models to gather candidate elements. Only objects whose names start with `Element_` and that have an associated `expressID` are selected. This filtering ensures that we focus on the elements representing real building parts.

---

## 2. Pairwise Comparison & Intersection Testing

With the candidate elements collected, the system compares every pair of elements. For each pair, it calls a function (named `findIntersection`) to determine whether the two elements are in contact.

The heavy lifting is performed by a specialized component called the **FastIntersectionDetector**, which efficiently tests for spatial intersections.

---

## 3. Fast Intersection Detector

The **FastIntersectionDetector** works in two main stages:

- **Bounding Box Check:**  
  It computes axis‐aligned bounding boxes for each element and checks if they intersect. Even if the boxes do not directly intersect, it checks whether the centers are within a **5 mm tolerance**.

- **Raycasting:**  
  If the bounding boxes indicate potential contact, the detector samples vertices (up to about 100 points) from one element. For each vertex, it casts rays in six principal directions (±X, ±Y, ±Z) using Three.js’s `Raycaster`. If a ray intersects the other element within a short distance (around **1 cm**), that intersection point is recorded.

Finally, the detector deduplicates these intersection points using a **1 mm tolerance**, ensuring that nearby points are merged.

---

## 4. Classifying the Connection

With a set of deduplicated intersection points, the connection is classified into one of three types:

- **Point Connection:**  
  When only one unique intersection point is found or the two furthest points are extremely close.

- **Line Connection:**  
  When the intersection points lie nearly along a straight line. A line geometry is created between the two most distant points, and its length is computed.

- **Surface Connection:**  
  When the points are spread over an area. For example, if exactly four points are found, they can be ordered to form a rectangle and triangulated to create a surface mesh. The area of contact is then calculated.

The resulting connection object includes a unique ID (typically a combination of the two elements’ `expressID`s), the connection type, measurements (like length or area), and geometry (buffer geometries for visualization).

---

## 5. Storing, Visualizing, and UI Integration

Each connection is stored in a map keyed by its unique ID. The system also updates mappings so that each element “knows” its connections. An **IntersectionVisualizer** then creates 3D visual representations (points, lines, or surfaces) for each connection.

The UI displays a list of connections and provides options to export the data as CSV or in IFC5 format. This makes the tool ideal for hackathon scenarios where rapid feedback and data export are critical.
