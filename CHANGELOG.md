# Changelog

## Unreleased

### Added

- Desk pane in the sidebar holding a manually curated, ordered list of notes, opened from the
  ribbon icon or the **Desk: Open pane** command.
- Drag a note's tab from the editor area onto the pane to close the tab and put the note on the
  desk, at the position you drop it.
- Drag a note from the pane into the editor area to open it as its own tab and take it off the
  desk.
- Add notes without closing a tab by dragging them from the File Explorer, or by dragging link text
  into the pane.
- Reorder notes by dragging them within the pane.
- Fold a note down to its title, or unfold it to read a preview of the note in the pane, by
  selecting its title. Long titles wrap instead of being cut off.
- Commands **Add current note** and **Remove current note**, plus a right-click menu on each note
  with **Open note**, **Move up**, **Move down**, and **Remove from desk** — the way to use Desk without a mouse,
  since drag and drop needs one.
- Each note sits on its own card. Unfolded previews are capped in height and scroll within the
  card; a CSS snippet can change the cap through `--desk-preview-max-height`.
- A **×** button on each note, shown on hover, to take it off the desk.
- Buttons at the top of the pane to **Collapse all** or **Expand all** notes, and to **Clear desk**
  after confirming.
- The pane highlights while a note or tab is dragged onto it, and an empty desk shows an icon with
  a hint.
- Setting **Add new notes folded** to choose whether notes arrive folded or unfolded.

[unreleased]: https://github.com/Cutuchiqueno/obsidian-desk-pane/compare/0.1.0...HEAD
