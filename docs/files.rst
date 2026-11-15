Files and menus
===============

The Files rail is ``@paperboat/shared/files`` — the same tree as Squero Studio OM. It supports
folders, selection, new file/folder, rename, duplicate, delete, copy path and drag-to-move. ``.jl``
files carry the Julia dots instead of a generic glyph. Both side panels collapse to a standing
tab with the chevron in their header, like Lookout's drawers; ``View`` has matching toggles.

The workspace is the real folder ``~/Documents/paperboat/squero-studio/mx``; there is no
in-memory copy. The dev/preview server exposes it at ``/__mx/workspace`` (set ``MX_WORKSPACE`` to
point elsewhere), so the app opens the files on start with no folder-permission prompt and
create/rename/move/delete/save write straight through. ``npm run build`` served as static files
has no endpoint; there the folder key (or ``File ▸ Open workspace folder…``) uses the browser
picker, which is also how another folder is opened. The chosen handle is remembered in
IndexedDB and restored when its permission is still granted. ``Save`` / ``Ctrl+S`` writes the current
file; an edited file shows ``•``. Double-click the project title in the top bar to rename it in
place. The topbar menus also expose find, clear, chart visibility and run.

When the workspace is inside a git repository, ``/__mx/workspace/git`` returns HEAD's copy of each
tracked ``.jl`` and the ones HEAD lacks. The rail marks files ``M`` (differs from HEAD, unsaved edits
included) or ``U`` (untracked), and the editor's git gutter diffs the live buffer against HEAD: a
signal bar for added lines, a half-tone bar for changed ones, a wedge where lines were deleted.
It reloads when files come or go and when the window regains focus (after a commit elsewhere).
Read-only by design: stage and commit in a terminal or another client. A folder opened through the
browser picker has no git.

About
-----

``About`` opens the dialog shared with OM (``AboutSquero`` in ``@paperboat/shared/squero``, which also holds the logo and the busy wave): the rippling wordmark, the frontend, Julia, kernel, Paperboat
and license facts, and the credits. Floating surfaces follow one rule (shared ``useDismiss``): a
press outside or Escape closes them, the trigger does not immediately reopen them, and focus
returns to where it was — menus, the About dialog and the editor settings all use it.
