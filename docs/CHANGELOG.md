# Syntax MVP - Changelog

## [Unreleased]

### Added
- **OpenBanking Consent System**
  - Multi-bank consent management (VBank, ABank, SBank)
  - Auto-approval for VBank and ABank
  - Manual approval with polling for SBank
  - Consent persistence in PostgreSQL
  - Background polling for SBank status updates
  - New models: `Consent` (SQLModel)
  - New service: `ConsentService` with per-bank token management
  - New routes: `/v1/consents/*` (request, list, status)

### Fixed
- Backend database initialization
- Health check compatibility on macOS
- Frontend accessibility on port 5173

### Changed
- Improved error handling in FastAPI routes
- Enhanced logging throughout backend services

---

## [2025-11-08]

### Release Notes
- Initial setup and infrastructure validation
- All services operational (DB, Backend, Frontend)
- Health checks passing
- API documentation accessible at /docs

