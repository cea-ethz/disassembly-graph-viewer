import express from "express";
import neo4j from "neo4j-driver";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: [/^http:\/\/localhost:\d+$/],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const driver = neo4j.driver(
  process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4j.auth.basic(
    process.env.NEO4J_USER || "neo4j",
    process.env.NEO4J_PASSWORD || "password"
  )
);

app.get("/api/graph", async (req, res) => {
  const session = driver.session();
  const { guid } = req.query;

  try {
    let query;
    let parameters = {};

    if (guid) {
      query = `
        // Start from the IFC element by GUID
        MATCH (ifcElement)
        WHERE (ifcElement:IfcRoof OR ifcElement:IfcWall OR ifcElement:IfcSlab OR ifcElement:IfcWindow OR ifcElement:IfcDoor)
          AND ifcElement.GUID = $guid

        WITH ifcElement

        // Run subquery to collect all paths and return them as n, r, m
        CALL {
          WITH ifcElement

          MATCH (ifcElement)-[:matchedArchetype]->(a:Archetype)
          MATCH (a)-[:hasLayer]->(lc:Layercomposite)
          OPTIONAL MATCH (lc)-[:intracomponentConnection]->(lc2:Layercomposite)
          OPTIONAL MATCH (lc)-[:hasComponent]->(c:Component)-[:hasMaterial]->(m:Material)
          OPTIONAL MATCH (ifcElement)-[:hasMaterialLayer]->(im:IfcMaterial)
          OPTIONAL MATCH (im)-[:connectedIfcMaterial]->(im2:IfcMaterial)
          OPTIONAL MATCH (ifcElement)-[:connectedElement|elConnected]-(connectedIfc)
          WHERE (connectedIfc:IfcRoof OR connectedIfc:IfcWall OR connectedIfc:IfcSlab OR connectedIfc:IfcWindow OR connectedIfc:IfcDoor)

          // Collect all involved nodes
          WITH COLLECT(DISTINCT ifcElement) + COLLECT(DISTINCT a) + COLLECT(DISTINCT lc) +
               COLLECT(DISTINCT lc2) + COLLECT(DISTINCT c) + COLLECT(DISTINCT m) +
               COLLECT(DISTINCT im) + COLLECT(DISTINCT im2) + COLLECT(DISTINCT connectedIfc) AS allNodes

          UNWIND allNodes AS n
          MATCH (n)-[r]->(m)
          WHERE m IN allNodes

          RETURN n, r, m
        }

        RETURN DISTINCT n, r, m


        // MATCH (start {GUID: $guid})
        //
        // CALL {
        //   WITH start
        //   MATCH (start)-[:matchedArchetype]-(mNode)
        //   WITH COLLECT(DISTINCT mNode) AS matchedNodes
        //   UNWIND matchedNodes AS mNode
        //   MATCH (mNode)-[*1..2]-(adjacent)
        //   RETURN COLLECT(DISTINCT mNode) + COLLECT(DISTINCT adjacent) AS allNodes
        // }
        //
        // UNWIND allNodes AS n
        // MATCH (n)-[r]->(m)  // Use undirected match to capture both directions
        // WHERE m IN allNodes
        // RETURN DISTINCT n, r, m
      `;
      parameters = { guid };
    } else {
      query = `
        MATCH (n)
        OPTIONAL MATCH (n)-[r]->(m)
        RETURN n, r, m
      `;
    }

    const result = await session.run(query, parameters);

    const nodes = new Map();
    const links = new Map();

    const getLinkKey = (n, r, m) =>
      `${n.identity.toString()}-${r.type}-${m.identity.toString()}`;

    result.records.forEach((record) => {
      const n = record.get("n");
      const r = record.get("r");
      const m = record.get("m");

      if (!n || !r || !m) {
        return;
      }

      [n, m].forEach((node) => {
        if (!nodes.has(node.identity.toString())) {
          nodes.set(node.identity.toString(), {
            id: node.identity.toString(),
            labels: node.labels,
            properties: node.properties,
          });
        }
      });

      const linkKey = getLinkKey(n, r, m);
      if (!links.has(linkKey)) {
        links.set(linkKey, {
          source: n.identity.toString(),
          target: m.identity.toString(),
          type: r.type,
          properties: r.properties,
        });
      }
    });

    return res.json({
      success: true,
      data: {
        nodes: Array.from(nodes.values()),
        links: Array.from(links.values()),
      },
    });
  } catch (error) {
    console.error("Error fetching graph data:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching graph data",
    });
  } finally {
    await session.close();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
