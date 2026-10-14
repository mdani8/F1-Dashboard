# Gridline

Formula 1 standings, weekend/session results, north-oriented circuit maps, driver lap analysis, favourites, calendars and RSS feeds.

The application and Docker Compose files are in [f1-dashboard](f1-dashboard/).

- [Setup, Docker Compose, reverse proxy, RSS and backup/restore](f1-dashboard/README.md)
- [Development, architecture and coding standards](f1-dashboard/CONTRIBUTING.md)
- [Project index](PROJECT_INDEX.md)

Run application commands from `f1-dashboard/`. To build and start the container:

```shell
docker compose up -d --build --wait
```

Open [Gridline](http://127.0.0.1:5173). Keep existing configuration and the RSS volume when updating.
