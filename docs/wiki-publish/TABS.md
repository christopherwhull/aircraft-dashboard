# Dashboard Tabs Reference

Screenshots captured from `index.html` (open `http://localhost:3002/index.html`). Images are in `docs/screenshots/`.

## Tabs

- **Live**

![Live tab](https://raw.githubusercontent.com/christopherwhull/aircraft-dashboard/main/docs/screenshots/index-live.png)

- **Airlines**

![Airlines tab](https://raw.githubusercontent.com/christopherwhull/aircraft-dashboard/main/docs/screenshots/index-airlines.png)

- **Flights**

![Flights tab](https://raw.githubusercontent.com/christopherwhull/aircraft-dashboard/main/docs/screenshots/index-flights.png)

- **Positions**

![Positions tab](https://raw.githubusercontent.com/christopherwhull/aircraft-dashboard/main/docs/screenshots/index-positions.png)

- **Squawk**

![Squawk tab](https://raw.githubusercontent.com/christopherwhull/aircraft-dashboard/main/docs/screenshots/index-squawk.png)

- **Heatmap** (links to the Leaflet viewer)

![Heatmap tab](https://raw.githubusercontent.com/christopherwhull/aircraft-dashboard/main/docs/screenshots/index-heatmap.png)

- **Reception**

![Reception tab](https://raw.githubusercontent.com/christopherwhull/aircraft-dashboard/main/docs/screenshots/index-reception.png)

- **Cache Status**

![Cache tab](https://raw.githubusercontent.com/christopherwhull/aircraft-dashboard/main/docs/screenshots/index-cache.png)

---

Notes:

- To regenerate screenshots locally run:

```bash
node tools/screenshot-index-tabs.js
```

- The script expects the server at `http://localhost:3002`; override with `DASHBOARD_URL` environment variable.

If you want, I can prepare a commit adding these files and optionally push to the repository wiki (requires separate wiki repo access).
