# 🌟 IFC and Neo4j Viewer 🌟

## How to run it

1. Make sure to load and start your Neo4j Graph in your Neo4j Desktop Application.
2. Then, add a new file `.env` in `/api` with your Neo4j Graph Credentials. Here is an example:

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
PORT=3001
```

3. In one terminal window: Go to `/api` and install all packages by running `npm install`, then start the server by running `node server.js`
4. In another terminal window: Go to `ifc-viewer` and install all packages by running `npm install`, then run the frontend by running `npm run dev`
