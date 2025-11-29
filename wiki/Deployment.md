# Deployment

This page describes recommended deployment approaches: development, systemd (Linux), Docker, and Windows scheduled tasks.

Development (local)
- Use `npm start` for quick testing
- Use `restart-server.sh` / `restart-server.ps1` scripts for convenience

Linux (systemd) - recommended for production
1. Copy project to `/opt/aircraft-dashboard`
2. Create `piaware` system user and adjust permissions
3. Copy `aircraft-dashboard.service` to `/etc/systemd/system/`
4. Create `/etc/default/aircraft-dashboard` with environment overrides
5. `sudo systemctl daemon-reload && sudo systemctl enable aircraft-dashboard && sudo systemctl start aircraft-dashboard`
6. View logs: `sudo journalctl -u aircraft-dashboard -f`

Docker
- `docker-compose.yml` is provided in `LINUX_SETUP.md` examples
- Use Docker Compose for MinIO + dashboard combined deployments

Windows
- Use `restart-server.ps1` for convenience runs
- For service-like behavior, use Task Scheduler to run on startup as SYSTEM or dedicated user

Health checks and monitoring
- Monitor service with systemd health tools and `journalctl`
- Use lightweight process monitors (monit, systemd restart policies)
- Check `/api/cache-status` and `/api/config` endpoints for status

Backups & updates
- Back up MinIO data volumes regularly
- For upgrades, stop service, pull updated repo, `npm install`, restart service
- Consider blue-green deploys or docker image rollouts for zero-downtime

Rollback
- Keep previous release branch/tag available
- If issues arise, stop service and re-checkout stable tag

Security
- Run as limited user
- Use TLS for HTTP/MinIO and secure credentials
- Use firewall rules to only allow trusted hosts to access MinIO and PiAware endpoints