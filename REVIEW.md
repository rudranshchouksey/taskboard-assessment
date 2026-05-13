##1 SQL Injection Vulnerability in Task Search

**File/Line** auth/projects/[id]/tasks/route.ts
**Category:** Security
**Severity:** Critical
**Description:** The search functionality utilize $queryRawUnsafe with direct string interpolation of the q parameter. This allows an attacker to break out of the intended query and execute arbitrary SQL, potentially leaking the entire uners table or bypassing project-level permission.
**Recommended Fix:** Replace the raw query with Prisma type-safe findMany query builder or use parameterized $queryRow

##2 Insecure Direct Object Reference (IDOR) on Task Patching

**File/Line** auth/tasks/[id]/route.ts
**Category:** Security
**Severity:** Critical
**Description:** The PATCH endpoint for tasks verifies authentication but fails to verify authorization if does not check if the user is a member of the project the task belongs to, allowing any logged-in user to modify any task by its ID
**Recommended Fix:** Fetch the task first to identify its projectId, then verify the user's Membership and role before allowing an update

##3 JWT stored in `local Storage`

**File/Line** src/lib/api-client.ts
**Category:** Security / Architecture
**Severity:** High

The app stores the session token in `window.localstorage` and reads it on every request.[page:1] If an XSS vulnerability is introduced anywhere in the app or a third part script is compromised, the token can be stolen directly which is why mordern Next.js security guidance prefers `HttpOnly` cookies session tokens,

**Recommended Fix;** Set the JWT as an `HTTPOnly`, `Secure`, `SameSize` cookie from the login route and authenticate server requests from that cookie instead of browser-readable storage

##4 JWT stored in `local Storage`

**File/Line** src/lib/api-client.ts
**Category:** Security / Architecture
**Severity:** High

The app stores the session token in `window.localstorage` and reads it on every request.[page:1] If an XSS vulnerability is introduced anywhere in the app or a third part script is compromised, the token can be stolen directly which is why mordern Next.js security guidance prefers `HttpOnly` cookies session tokens,

**Recommended Fix;** Set the JWT as an `HTTPOnly`, `Secure`, `SameSize` cookie from the login route and authenticate server requests from that cookie instead of browser-readable storage
