Files, Git, and appearance
==========================

Workspace folder
----------------

By default, MX opens ``~/Documents/paperboat/squero-studio/mx`` (override with ``MX_WORKSPACE`` or
``--workspace <dir>``). All create, rename, move, duplicate, delete, and save actions write straight
to disk in that folder.

- Use the **+** button in the Files rail (or **File ▸ New script…** / **New folder…**) to create
  scripts and folders, or drag entries to reorganize them.
- Choose **File ▸ Open workspace folder…** (or the folder icon in the rail header) to switch to a
  different directory.
- Double-click the active filename in the top bar to rename it in place.
- Unsaved files display ``•`` next to their title; press ``Ctrl/Cmd+S`` (or **Save**) to write to
  disk.

Read-only Git indicators
------------------------

When your workspace folder is inside a Git repository, MX tracks working-tree state read-only:

- The Files rail marks files ``M`` (modified relative to ``HEAD``, including unsaved editor edits) or
  ``U`` (untracked).
- The editor gutter shows live diffs against ``HEAD``: a signal bar for added lines, a half-tone
  bar for changed lines, and a wedge where lines were deleted.
- Staging and committing remain in your terminal or Git client; MX refreshes its indicators
  automatically when files change or the window regains focus.

Appearance and menus
--------------------

- Use the sun/moon toggle in the top-right bar to switch between light, dark, and system themes.
- Open **View** to toggle any pane (**Files panel**, **Chart**, **Workspace panel**, **Console**) or
  switch right-pane tabs.
- Open **About** to inspect the running frontend, Julia, kernel image digest, Paperboat attachment
  status, and license information.
