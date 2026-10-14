# Scene Manager

Plan films, shorts, and visual storytelling projects directly inside Obsidian. Organize your workflow through **projects → scenes → shots**, attach vault images natively without duplication, and maintain generation prompts and notes for every shot—all inside a clean visual board.

![Scene Manager](docs/screenshot.png)

---

## ✨ Features

* **Visual Board View**: Manage projects, scenes, and shots seamlessly with built-in reordering, renaming, and deletion tools.
* **Stable Permanent IDs**: Rename any project, scene, or shot freely. Renaming never breaks links to underlying notes, prompts, or attached images.
* **Native Vault Integration**: Select images directly from your vault via a searchable list. Files are referenced securely by path without duplication.
* **Automatic Path Tracking**: Moving or renaming image files or folders anywhere in your vault automatically updates references inside the plugin.
* **Dedicated Prompt Fields**: Each shot includes a custom prompt field with a one-click copy button, placed right alongside a dedicated notes field for AI generation workflows.
* **Independent Project Thumbnails**: Assign a dedicated visual thumbnail to each project independent of its scene or shot imagery.
* **Advanced Folding & Views**: Collapse individual shots to thumbnails, fold entire scenes into thumbnail strips, toggle grid-only modes, and persist your layout states.
* **100% Local & Private**: Operates entirely offline with no accounts or external network calls required.

---

## 📦 Installation

### From the Community Plugin Directory
1. Open Obsidian **Settings → Community plugins → Browse**.
2. Search for **Scene Manager**.
3. Click **Install**, then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/phidahussain66/obsidian-film-scene-manager/releases/latest).
2. Create a new folder named `scene-manager` inside your vault's plugin directory: `<your-vault>/.obsidian/plugins/scene-manager/`.
3. Place the three downloaded files into that folder.
4. Restart Obsidian, then enable **Scene Manager** under **Settings → Community plugins**.

### Beta Testing via BRAT
1. Install the **BRAT** plugin from the community directory.
2. Choose **Add a beta plugin for testing**.
3. Enter your repository address: `phidahussain66/obsidian-film-scene-manager`.

---

## 🚀 Getting Started

1. Click the **clapperboard icon** in the left ribbon, or open the Command Palette and run **Open Scene Manager**.
2. Click **New project** to initialize your storyboard.
3. Optionally select an independent thumbnail for your project from your vault.
4. Click **Add scene**, then use the **+** button in the scene header to add individual shots.
5. Choose an image for each shot, jot down notes, and enter your image or video generation prompts.

---

## 📋 Board Quick Reference

| Action | How to do it |
| :--- | :--- |
| **Rename a project/scene** | Click the pencil icon next to its name |
| **Rename a shot** | Edit the title text field directly on the shot card |
| **Change/Clear an image** | Use **Change image** or **Clear** on the shot card |
| **Copy a prompt** | Click the copy icon next to the **Prompt** field |
| **Reorder scenes/shots** | Use the directional arrow buttons in headers/cards |
| **Fold a shot/scene** | Click the collapse chevron icon |
| **Thumbnails-only view** | Click the grid icon in project or scene headers |
| **Fold/Unfold all** | Use the double-chevron icons in the project header |
| **Delete item** | Click the trash icon (prompts for confirmation) |

> 💡 *Note: Deleting projects, scenes, or shots only removes their entry inside Scene Manager. Your original image files remain untouched in your vault.*

---

## ⚙️ Commands

* **Open Scene Manager**: Launches the visual planning interface.
* **Back up Scene Manager data to the vault**: Generates a timestamped JSON backup copy in your vault root directory.

---

## 🔒 Data Storage

* All data is safely stored locally in `data.json` inside `<your-vault>/.obsidian/plugins/scene-manager/`.
* Images are referenced by vault path and are never duplicated, altered, or moved.

---

## 🛠️ Development

If you wish to build or modify from source:
1. Clone this repository directly into your vault's plugin directory: `<your-vault>/.obsidian/plugins/scene-manager/`.
2. Reload Obsidian (`Ctrl/Cmd + R`) and enable the plugin.

---

## 📄 License

Distributed under the [MIT License](LICENSE).
