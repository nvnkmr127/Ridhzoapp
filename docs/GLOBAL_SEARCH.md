# Universal Search & Command Palette (`CommandPalette`)

## 1. Executive Summary & Purpose

The **Universal Search & Command Palette** is Ridhzo CRM's central keyboard-driven navigation and search system. Triggered via `⌘K` (macOS) or `Ctrl+K` (Windows/Linux), or by clicking the search bar in the global header, it provides instant access to leads, team members, and CRM views without page reloads.

Key design principles include:
- **Universal Multi-Entity Search:** Simultaneously searches across leads (by name, email, phone, company) and organization team members (by first name, last name, full name, email).
- **Debounced Server Search:** 200ms debounce window prevents typing lag and database connection exhaustion.
- **Server-Driven Ranking (`shouldFilter={false}`):** Delegates fuzzy matching and relevance sorting to PostgreSQL ILIKE queries rather than client-side string filters, ensuring live, accurate results.
- **Instant Keyboard Navigation:** Arrow key selection and `Enter` key execution with direct route transitions via Next.js `useRouter`.

---

## 2. File & Component Architecture

| Purpose | File Path |
| :--- | :--- |
| **Command Palette Modal** | [`src/components/layout/CommandPalette.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/layout/CommandPalette.tsx) |
| **Header Search Trigger** | [`src/components/layout/Header.tsx:23-58`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/layout/Header.tsx#L23-L58) |
| **Server Search Action** | [`src/lib/actions/search.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/search.ts) |
| **Underlying Command Primitives (`cmdk`)** | [`src/components/ui/command.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/ui/command.tsx) |
| **Database Schema** | [`src/db/schema/leads.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts), [`src/db/schema/users.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/users.ts) |

---

## 3. Global Header Integration & Keyboard Shortcuts

The global header mounts the command palette and registers a global event listener:

```typescript
// Header.tsx
React.useEffect(() => {
  const isMac =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");
  setShortcutLabel(isMac ? "⌘K" : "Ctrl+K");

  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setSearchOpen((o) => !o);
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, []);
```

### Visual Search Bar Trigger:
On desktop displays, the header features a prominent search box:
```tsx
<button
  type="button"
  onClick={() => setSearchOpen(true)}
  className="relative w-full max-w-md hidden md:flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
>
  <Search className="mr-2 h-4 w-4" />
  Search leads, team members, or jump to…
  <kbd className="ml-auto text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono">{shortcutLabel}</kbd>
</button>
```

---

## 4. Universal Search Engine (`searchUniversalAction`)

When the user types at least 2 characters, a 200ms debounced request dispatches to [`searchUniversalAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/search.ts):

### 4.1 Parallel Multi-Entity Query Execution
The server executes two queries simultaneously using `Promise.all`:

```typescript
const [leadRows, userRows] = await Promise.all([
  // Query 1: Leads Matching
  db
    .select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, company: leads.company })
    .from(leads)
    .where(and(
      eq(leads.organizationId, organizationId),
      or(
        ilike(leads.name, like),
        ilike(leads.email, like),
        ilike(leads.phone, like),
        ilike(leads.company, like)
      ),
    ))
    .orderBy(desc(leads.createdAt))
    .limit(10),

  // Query 2: Team Members Matching
  db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      roleName: roles.name,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(and(
      eq(users.organizationId, organizationId),
      isNull(users.deletedAt),
      or(
        ilike(users.email, like),
        ilike(users.firstName, like),
        ilike(users.lastName, like),
        ilike(sql<string>`concat_ws(' ', ${users.firstName}, ${users.lastName})`, like),
      ),
    ))
    .limit(5),
]);
```

### 4.2 Security & Multi-Tenant Boundaries
Both queries enforce strict tenant boundaries:
- Enforces `eq(leads.organizationId, organizationId)` and `eq(users.organizationId, organizationId)`.
- Ignores soft-deleted team members (`isNull(users.deletedAt)`).
- Caps results at 10 leads and 5 team members to maintain instantaneous response times.

---

## 5. Result Groups & Direct Actions

The palette organizes results into three distinct categories:

### 1. Leads Group
- **Display:** Shows lead name, primary contact channel (email, phone), and company.
- **Action:** Selecting a lead immediately closes the modal and navigates to the 360° lead dossier at `/leads/${lead.id}`.

### 2. Team Members Group
- **Display:** Shows team member full name, assigned role badge (e.g. `Admin`, `Sales Rep`), and email.
- **Action:** Selecting a team member routes to the filtered leads list showing only leads owned by that user: `/leads?owner=${user.id}`.

### 3. Navigation Shortcuts ("Go to")
Always accessible at the bottom of the list for rapid hotkey jumping:
- **Leads:** Jumps to `/leads` (List triage).
- **Kanban:** Jumps to `/leads/kanban` (Visual stage board).
- **Follow-ups:** Jumps to `/follow-ups` (Task hub and calendar).
- **Settings:** Jumps to `/settings` (System configuration).
