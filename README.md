# Parity React App (Vite)

Interactive 8×10 parity relation explorer.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

## Usage
- Paste an **80-bit** string (row-major) and click **Load bits**.
- Paste a **parityRelation** mapping and click **Load relations**.
  - Accepts **JSON** OR **Python-style dicts** with tuple keys/values.
- Click any **blue** parity cell to view coverage, XOR(covered), stored bit, and status (even parity).
