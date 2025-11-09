Context:
# We're building a FastAPI backend for a multi-banking app for self-employed users.
# The app connects to 3 sandbox banks (VBank, ABank, SBank) using the OpenBanking Russia v2.1 API.
#
# Each bank requires its own consent to access account data:
# - VBank, ABank — automatic consent approval
# - SBank — manual approval by the client
#
# 🧩 Required flow:
# 1. Authorize via POST /auth/bank-token (use CLIENT_ID, CLIENT_SECRET from .env)
# 2. Request consent via POST /account-consents/request (one per bank)
# 3. For SBank: poll GET /account-consents/{consent_id} until status == "authorized"
# 4. Use the consent_id to call /accounts and /transactions endpoints
#
# 🗃️ Data persistence:
# Store consents in PostgreSQL (table: consents)
# Fields: id, bank_name, client_id, consent_id, status, created_at, updated_at
# Status values: awaitingAuthorization | authorized | revoked
#
# ⚙️ Requirements:
# - Before creating a new function, check if it already exists (avoid duplicates).
#   Example: use `dir()` or search within backend/ to detect existing definitions.
# - Follow API documentation precisely:
#   https://vbank.open.bankingapi.ru/docs#/
#   https://sbank.open.bankingapi.ru/docs#/
#   https://abank.open.bankingapi.ru/docs#/
# - Include robust error handling for HTTP 403, 422, and timeout cases.
# - Use environment variables from .env (CLIENT_ID, CLIENT_SECRET, BASE_URL).
# - Use async HTTP calls (httpx or aiohttp) instead of requests for better performance.
# - Each consent must be requested and stored per bank (don’t reuse across banks).
#
# 🧠 Implementation tips:
# - Create a class ConsentService with methods:
#     get_bank_token(bank_name)
#     create_consent(bank_name, client_id)
#     check_consent_status(bank_name, consent_id)
#     list_consents()
# - Expose FastAPI routes:
#     POST /consents/request  -> create consent
#     GET /consents/{bank}    -> get list of consents for a specific bank
#     GET /consents/status/{id} -> check status of a consent
#
# Example expected behavior:
# - For VBank/ABank: create_consent() should immediately save consent with status="authorized"
# - For SBank: create_consent() should save consent as "awaitingAuthorization" and start background polling
#
# After implementation:
# ✅ Verify with curl:
# curl -X POST "http://localhost:8000/consents/request" -H "Content-Type: application/json" \
#   -d '{"bank_name":"vbank","client_id":"team286-1"}'
#
# Expected: JSON response with consent_id and status.
#
# ⚠️ Ensure Copilot reuses existing modules or routes if they already exist, instead of duplicating them.