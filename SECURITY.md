# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, report them privately through either of these channels:

- **Email:** [security@justlucy.ai](mailto:security@justlucy.ai)
- **GitHub:** the **[Report a vulnerability](https://github.com/JustLucyHQ/lucy/security/advisories/new)**
  button (repository → **Security** → **Advisories** → *Report a vulnerability*) — opens a
  private channel visible only to the maintainers.

Please include, where possible:

- The type of issue (e.g. SSRF, RCE, auth bypass, injection, secret exposure).
- The affected file(s) / route(s) and, if relevant, the commit or version.
- Step-by-step instructions to reproduce, and a proof-of-concept if you have one.
- The impact: what an attacker could achieve.

### What to expect

- **Acknowledgement** within **3 business days**.
- An **initial assessment** within **7 business days**.
- Regular updates as we work on a fix, and credit in the published advisory if you'd like it.

We follow coordinated disclosure: please give us a reasonable window to ship a fix
before any public disclosure.

## Supported versions

Lucy is pre-1.0 and ships from `main`. Security fixes are applied to the latest
release only.

| Version          | Supported |
| ---------------- | --------- |
| latest (`main`)  | ✅        |
| older tags       | ❌        |

## Scope

**In scope:** the application code in this repository — chat, workflow engine,
connectors / MCP, embed widgets, authentication, and memory.

**Out of scope / by design for self-hosting:**

- The workflow **Code node** runs server-side JavaScript **by design** for
  single-tenant self-hosting. On a shared / multi-tenant host, set
  `WORKFLOW_MULTI_TENANT=1` — this disables the Code node and enables the
  SSRF guard on the workflow HTTP node. Reports that rely on running a
  multi-tenant host **without** that flag set are configuration issues, not
  vulnerabilities.
- Issues that require an already-compromised or misconfigured deployment
  (e.g. a leaked `SUPABASE_SERVICE_ROLE_KEY`, debug endpoints exposed publicly).

## Handling

Confirmed vulnerabilities are fixed in a private branch, released, and then
disclosed via a **GitHub Security Advisory** once a fix is available.
