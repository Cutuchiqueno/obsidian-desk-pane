# Changelog

## Unreleased

### Added

- Desk pane in the sidebar holding a manually curated, ordered list of notes, opened from the
  ribbon icon or the **Desk Sidebar: Open pane** command.
- Drag a note's tab from the editor area onto the pane to close the tab and put the note on the
  desk, at the position you drop it.
- Drag a note from the pane into the editor area to open it as its own tab and take it off the
  desk.
- Add notes without closing a tab by dragging them from the File Explorer, or by dragging link text
  into the pane.
- Only Markdown notes go on the desk. Other file types — Bases (`.base`), Canvas, PDFs, images —
  and folders are turned away on every route onto the desk, and a note renamed to another file type
  comes off it the way a deleted note does.
- **Add to desk** in Obsidian's own note context menus — the File Explorer (one note or a
  selection), a tab, a note's more-options menu, a link, the graph, Canvas, and Bases — next to
  **Open in new window**. It puts the note at the top of the desk, opens the pane, and leaves the
  note where it is; notes already on the desk don't show the entry.
- Reorder notes by dragging them within the pane. The pointer turns into a hand over a card's
  title row to show that the card can be moved.
- Fold a note down to its title, or unfold it to read a preview of the note in the pane, by
  selecting its title. Long titles wrap instead of being cut off.
- Commands **Add current note** and **Remove current note**, plus a right-click menu on each note
  with **Open note**, **Move up**, **Move down**, and **Remove from desk** — the way to use Desk Sidebar without a mouse,
  since drag and drop needs one.
- Each note sits on its own card, which grows with its unfolded preview up to the **Maximum card
  height** setting and scrolls beyond that; a CSS snippet can still override the cap through
  `--desk-card-max-height`.
- Setting **Maximum card height**, a slider from 20% to 100% of the pane's height (50% by default).
  Open panes follow it as it moves.
- Drag a card's bottom edge to make it shorter, or taller again up to its whole note or the maximum
  card height. The card keeps that height across restarts and while it's folded, filtered, or
  grouped; dragging it all the way open, or **Reset height** in its right-click menu, fits it to
  its note again.
- A **×** button on each note, shown on hover, to take it off the desk.
- Buttons at the top of the pane to **Collapse all** or **Expand all** notes, and to **Clear desk**
  after confirming.
- A **Show search filter** button at the top of the pane, as in the Backlinks pane, that opens a
  search field and shows only the notes whose title or text contains what you type. Hiding the
  field clears the filter.
- The pane highlights while a note or tab is dragged onto it, and an empty desk shows an icon with
  a hint.
- Setting **Add new notes folded** to choose whether notes arrive folded or unfolded.
- Give a note a color with the **Set color** dot on its title row, shown on hover: one of the
  theme's named colors (red, orange, yellow, green, cyan, blue, purple, pink), which tints its card
  the way Canvas tints a colored card.
- A **Group by color** button at the top of the pane, and the **Toggle grouping by color** command,
  that sort the notes into one block per color under headers, with the notes without a color last.
  Changing a note's color while grouped moves it to its new color's block; dragging a note out of
  its block ends the grouping. Selecting the button again removes the headers and keeps the order.
- A **Show color filter** button at the top of the pane that lists the colors in use with their
  note counts. Select colors to show only their notes, together with the search filter. Each color
  has a **×** to take it off all its notes, and **Remove all colors** clears every color after
  confirming. Hiding the list clears the color filter.

[unreleased]: https://github.com/Cutuchiqueno/obsidian-desk-pane/compare/0.1.0...HEAD
