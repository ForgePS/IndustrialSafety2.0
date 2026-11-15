# FX Foundation Components

**Family:** Foundation  
**Tokens:** surface, text, space, radius, elevation, typography

Shared sections for all foundation components:

- **Permissions:** Presentation only; hide/disable slots based on caller-provided auth flags
- **Accessibility:** Landmarks and headings as noted; focus order follows reading order
- **Keyboard:** Tab moves through interactive slots; Esc closes overlays owned by children
- **Screen reader:** Landmark labels; decorative separators hidden
- **Responsive:** Collapse side regions per shell breakpoints
- **Anti-patterns:** Product-specific chrome forks; hard-coded colors
- **Future extension points:** Slots for product tools without replacing structure

---

## AppShell

**Purpose:** Single shared frame for every Forge product.  
**Properties:** `product`, `theme`, `tenant`, `environment`, `nav`, `notifications`, `user`, slots: `header`, `nav`, `content`, `context`, `statusBar`.  
**Variants:** Desktop · Tablet · Phone · Public · Employee · Creator · Administration · Digital Dashboard · Kiosk · Full Screen Operations.  
**States:** Online · Degraded · Offline · Loading.  
**Examples:** RMS operations shell; Creator portal shell.  
**See:** [08-application-shell.md](../08-application-shell.md)

## PageHeader

**Purpose:** Title, description, primary actions for a page.  
**Properties:** `title`, `description`, `breadcrumbs`, `actions`, `meta`.  
**Variants:** Standard · Compact · Record-linked.  
**States:** Default · Loading skeleton.  
**Keyboard:** Actions in tab order after title.  
**Examples:** “Inspections” list header with New action.  
**Anti-patterns:** Multiple H1s; actions unrelated to the page.

## SectionHeader

**Purpose:** Subsection labeling inside pages/records.  
**Properties:** `title`, `level`, `actions`, `hint`.  
**Variants:** Plain · Divider · Disclosure.  
**States:** Default · Collapsed (with accordion).  
**Examples:** “Related hydrants” on occupancy record.

## ContentPanel

**Purpose:** Primary padded content surface.  
**Properties:** `padding`, `elevation`, `scroll`.  
**Variants:** Flush · Raised · Bordered.  
**Examples:** Main list/detail body.

## WorkspaceHeader

**Purpose:** Workspace title + tabs + tools.  
**Properties:** `title`, `tabs`, `tools`.  
**Variants:** Standard · Dense ops.  
**Examples:** Prevention workspace header.

## SummaryPanel

**Purpose:** At-a-glance metrics/attention beside or above work.  
**Properties:** `items`, `density`.  
**Variants:** Horizontal · Vertical.  
**Examples:** Open / Overdue / Critical counts.

## Sidebar

**Purpose:** Host primary/secondary navigation.  
**Properties:** `collapsed`, `sections`, `footer`.  
**Variants:** Expanded · Rail · Hidden (phone).  
**Keyboard:** Arrow navigation within nav lists.  
**Examples:** Left nav in desktop shell.

## Toolbar

**Purpose:** Contextual actions for the current view.  
**Properties:** `primary`, `secondary`, `overflow`.  
**Variants:** Page · Table · Editor.  
**Examples:** Table filter + export toolbar.

## Footer

**Purpose:** Shell or page footer for legal/status/meta.  
**Properties:** `left`, `center`, `right`.  
**Variants:** App status footer · Page footer.  
**Examples:** Connection + environment indicators.

## SplitView

**Purpose:** Master/detail without losing list context.  
**Properties:** `primary`, `secondary`, `ratio`, `collapseSecondary`.  
**Variants:** Horizontal · Vertical.  
**Responsive:** Stack on phone (list → detail route).  
**Examples:** Inbox-style task queues.

## ResponsiveGrid

**Purpose:** Tokenized grid for dashboards and forms.  
**Properties:** `columns`, `gap`, `breakpoints`.  
**Variants:** 12-col · Auto-fill cards.  
**Examples:** Dashboard metric layout.

## WorkspaceTabs

**Purpose:** Level-3 navigation within a workspace/record.  
**Properties:** `items`, `value`, `onChange`.  
**Variants:** Underline · Enclosed.  
**Keyboard:** Arrows between tabs.  
**Anti-patterns:** Nested tab sets; using tabs past level 3 IA.
