"use strict";
/*
 * Scene Manager v1.6
 *
 * v1.6: scenes and shots can be folded. A folded shot shows only its thumbnail,
 *       a folded scene shows only its header plus a strip of shot thumbnails.
 *       Fold state is saved (`collapsed` on scenes and shots).
 * Data model (stored in this plugin's data.json):
 *   project { id, name, thumbnail, scenes[] }
 *   scene   { id, name, description, shots[] }
 *   shot    { id, name, notes, prompt, image }
 *
 * - Everything is linked by permanent IDs, never by name. Renaming a project,
 *   scene or shot only changes its `name` field, so images and text stay put.
 * - Images are NOT copied. `image` / `thumbnail` hold the path of a file that
 *   already exists in your vault. If you rename or move that image in
 *   Obsidian, the stored path is updated automatically.
 * - A project has its own `thumbnail`, independent of its scenes' images.
 */
const { Plugin, ItemView, Modal, Notice, FuzzySuggestModal, TFile, setIcon } = require("obsidian");

const VIEW_TYPE = "scene-manager-view";
const VERSION = "1.6";
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);

const uid = (prefix) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

/** Make sure every item has an id and every field exists. Unknown fields are kept. */
function normalizeStore(raw) {
  const store = raw && typeof raw === "object" ? raw : {};
  if (!Array.isArray(store.projects)) store.projects = [];
  for (const p of store.projects) {
    p.id = p.id || uid("proj");
    p.name = p.name || "Untitled project";
    p.thumbnail = typeof p.thumbnail === "string" ? p.thumbnail : "";
    if (!Array.isArray(p.scenes)) p.scenes = [];
    for (const s of p.scenes) {
      s.id = s.id || uid("sc");
      s.name = s.name || "Untitled scene";
      s.description = s.description ?? s.notes ?? "";
      s.collapsed = !!s.collapsed;
      if (!Array.isArray(s.shots)) s.shots = [];
      for (const sh of s.shots) {
        sh.id = sh.id || uid("sh");
        sh.name = sh.name || "Untitled shot";
        sh.notes = sh.notes ?? sh.description ?? "";
        sh.prompt = sh.prompt ?? "";
        sh.image = sh.image ?? sh.img ?? sh.imagePath ?? "";
        sh.collapsed = !!sh.collapsed;
      }
    }
  }
  store.version = VERSION;
  return store;
}

/** If a stored path equals (or lives inside) oldPath, rewrite it to newPath. */
function remapPath(p, oldPath, newPath) {
  if (!p || typeof p !== "string") return p;
  if (p === oldPath) return newPath;
  if (p.startsWith(oldPath + "/")) return newPath + p.slice(oldPath.length);
  return p;
}

function moveItem(arr, index, delta) {
  const j = index + delta;
  if (j < 0 || j >= arr.length) return false;
  [arr[index], arr[j]] = [arr[j], arr[index]];
  return true;
}

/* ------------------------------------------------------------------ modals */

class TextModal extends Modal {
  constructor(app, title, initial, onSubmit) {
    super(app);
    this.heading = title;
    this.initial = initial || "";
    this.onSubmit = onSubmit;
  }
  onOpen() {
    this.titleEl.setText(this.heading);
    const input = this.contentEl.createEl("input", { cls: "sm-input", attr: { type: "text" } });
    input.value = this.initial;
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      this.close();
      this.onSubmit(v);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    const row = this.contentEl.createDiv("sm-modal-buttons");
    row.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    row.createEl("button", { text: "Save", cls: "mod-cta" }).onclick = submit;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 20);
  }
  onClose() {
    this.contentEl.empty();
  }
}

class ConfirmModal extends Modal {
  constructor(app, message, onYes) {
    super(app);
    this.message = message;
    this.onYes = onYes;
  }
  onOpen() {
    this.titleEl.setText("Are you sure?");
    this.contentEl.createEl("p", { text: this.message });
    const row = this.contentEl.createDiv("sm-modal-buttons");
    row.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    row.createEl("button", { text: "Delete", cls: "mod-warning" }).onclick = () => {
      this.close();
      this.onYes();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
}

class ImageModal extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Search for an image in your vault...");
  }
  getItems() {
    return this.app.vault.getFiles().filter((f) => IMAGE_EXT.has(f.extension.toLowerCase()));
  }
  getItemText(file) {
    return file.path;
  }
  onChooseItem(file) {
    this.onChoose(file.path);
  }
}

/* -------------------------------------------------------------------- view */

class SceneManagerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Scene Manager";
  }
  getIcon() {
    return "clapperboard";
  }
  async onOpen() {
    this.contentEl.addClass("sm-root");
    this.render();
  }
  async onClose() {
    this.contentEl.empty();
  }

  /* helpers */
  iconBtn(parent, icon, label, onClick) {
    const b = parent.createEl("button", {
      cls: "clickable-icon sm-icon-btn",
      attr: { "aria-label": label },
    });
    setIcon(b, icon);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return b;
  }

  renderImage(parent, ref, cls, placeholder) {
    const box = parent.createDiv(cls);
    const src = this.plugin.resolveImage(ref);
    if (src) {
      box.createEl("img", { attr: { src, loading: "lazy" } });
    } else {
      box.createDiv({ cls: "sm-placeholder", text: ref ? "Image not found" : placeholder });
      if (ref) box.setAttr("title", ref);
    }
    return box;
  }

  pickImage(onPick) {
    new ImageModal(this.app, (path) => {
      onPick(path);
      this.plugin.scheduleSave();
      this.render();
    }).open();
  }

  openProject(id) {
    this.plugin.ui.projectId = id;
    this.render();
    this.contentEl.scrollTop = 0;
  }

  render() {
    const el = this.contentEl;
    const top = el.scrollTop;
    el.empty();
    const project = this.plugin.getProject(this.plugin.ui.projectId);
    if (project) {
      this.renderProject(el, project);
    } else {
      this.plugin.ui.projectId = null;
      this.renderHome(el);
    }
    el.scrollTop = top;
  }

  /* home: list of projects */
  renderHome(el) {
    const head = el.createDiv("sm-header");
    head.createEl("h2", { text: "Scene Manager" });
    head.createSpan({ cls: "sm-version", text: `v${VERSION}` });
    head.createDiv("sm-spacer");
    head.createEl("button", { cls: "mod-cta", text: "New project" }).onclick = () => {
      new TextModal(this.app, "New project", "", (name) => {
        const p = { id: uid("proj"), name, thumbnail: "", scenes: [] };
        this.plugin.store.projects.push(p);
        this.plugin.scheduleSave();
        this.openProject(p.id);
      }).open();
    };

    if (!this.plugin.store.projects.length) {
      el.createDiv({ cls: "sm-empty", text: "No projects yet. Create one to get started." });
      return;
    }

    const grid = el.createDiv("sm-grid sm-projects");
    for (const p of this.plugin.store.projects) {
      const card = grid.createDiv("sm-card sm-project-card");
      // The project's OWN thumbnail. Never falls back to a scene or shot image.
      this.renderImage(card, p.thumbnail, "sm-thumb", "No thumbnail");
      const body = card.createDiv("sm-card-body");
      body.createDiv({ cls: "sm-card-title", text: p.name });
      const shotCount = p.scenes.reduce((n, s) => n + s.shots.length, 0);
      body.createDiv({ cls: "sm-muted", text: `${p.scenes.length} scenes · ${shotCount} shots` });
      const actions = body.createDiv("sm-actions");
      this.iconBtn(actions, "pencil", "Rename project", () => this.renameProject(p));
      this.iconBtn(actions, "image", "Set thumbnail", () => this.pickImage((path) => (p.thumbnail = path)));
      if (p.thumbnail) {
        this.iconBtn(actions, "image-off", "Clear thumbnail", () => {
          p.thumbnail = "";
          this.plugin.scheduleSave();
          this.render();
        });
      }
      this.iconBtn(actions, "trash", "Delete project", () => this.deleteProject(p));
      card.onclick = () => this.openProject(p.id);
    }
  }

  renameProject(p) {
    new TextModal(this.app, "Rename project", p.name, (name) => {
      p.name = name; // only the display name changes; scenes, shots and images are untouched
      this.plugin.scheduleSave();
      this.render();
    }).open();
  }

  deleteProject(p) {
    new ConfirmModal(this.app, `Delete project "${p.name}" with all its scenes and shots? Your image files are not deleted.`, () => {
      const list = this.plugin.store.projects;
      list.splice(list.indexOf(p), 1);
      if (this.plugin.ui.projectId === p.id) this.plugin.ui.projectId = null;
      this.plugin.scheduleSave();
      this.render();
    }).open();
  }

  /* a single project */
  renderProject(el, project) {
    const head = el.createDiv("sm-header");
    this.iconBtn(head, "arrow-left", "All projects", () => this.openProject(null));
    head.createEl("h2", { text: project.name });
    this.iconBtn(head, "pencil", "Rename project", () => this.renameProject(project));
    head.createSpan({ cls: "sm-version", text: `v${VERSION}` });
    head.createDiv("sm-spacer");
    this.iconBtn(head, "chevrons-down-up", "Fold all scenes", () => this.setAllScenes(project, true));
    this.iconBtn(head, "chevrons-up-down", "Unfold all scenes", () => this.setAllScenes(project, false));
    this.iconBtn(head, "layout-grid", "Shots: thumbnails only / full cards (all scenes)", () =>
      this.toggleShots(project.scenes.flatMap((s) => s.shots))
    );
    head.createEl("button", { cls: "mod-cta", text: "Add scene" }).onclick = () => {
      project.scenes.push({
        id: uid("sc"),
        name: `Scene ${project.scenes.length + 1}`,
        description: "",
        collapsed: false,
        shots: [],
      });
      this.plugin.scheduleSave();
      this.render();
    };

    const panel = el.createDiv("sm-project-panel");
    this.renderImage(panel, project.thumbnail, "sm-thumb sm-thumb-lg", "No project thumbnail");
    const pbody = panel.createDiv("sm-panel-body");
    pbody.createDiv({ cls: "sm-card-title", text: "Project thumbnail" });
    pbody.createDiv({ cls: "sm-muted", text: "Independent of the images used in scenes and shots." });
    const row = pbody.createDiv("sm-actions");
    row.createEl("button", { text: project.thumbnail ? "Change thumbnail" : "Choose thumbnail" }).onclick = () =>
      this.pickImage((path) => (project.thumbnail = path));
    if (project.thumbnail) {
      row.createEl("button", { text: "Clear" }).onclick = () => {
        project.thumbnail = "";
        this.plugin.scheduleSave();
        this.render();
      };
    }

    if (!project.scenes.length) {
      el.createDiv({ cls: "sm-empty", text: "No scenes yet. Use Add scene." });
    }
    project.scenes.forEach((scene, i) => this.renderScene(el, project, scene, i));
  }

  renderScene(el, project, scene, index) {
    const box = el.createDiv("sm-scene");
    const head = box.createDiv("sm-scene-head");
    this.iconBtn(head, scene.collapsed ? "chevron-right" : "chevron-down", scene.collapsed ? "Unfold scene" : "Fold scene", () => {
      scene.collapsed = !scene.collapsed;
      this.afterChange();
    });
    head.createSpan({ cls: "sm-scene-num", text: String(index + 1) });
    head.createEl("h3", { text: scene.name });
    head.createSpan({ cls: "sm-muted", text: `${scene.shots.length} shots` });
    head.createDiv("sm-spacer");
    this.iconBtn(head, "layout-grid", "Shots: thumbnails only / full cards (this scene)", () => {
      if (scene.collapsed) scene.collapsed = false;
      this.toggleShots(scene.shots);
    });
    this.iconBtn(head, "plus", "Add shot", () => {
      scene.collapsed = false;
      scene.shots.push({
        id: uid("sh"),
        name: `Shot ${scene.shots.length + 1}`,
        notes: "",
        prompt: "",
        image: "",
        collapsed: false,
      });
      this.plugin.scheduleSave();
      this.render();
    });
    this.iconBtn(head, "pencil", "Rename scene", () => {
      new TextModal(this.app, "Rename scene", scene.name, (name) => {
        scene.name = name;
        this.plugin.scheduleSave();
        this.render();
      }).open();
    });
    this.iconBtn(head, "arrow-up", "Move scene up", () => {
      if (moveItem(project.scenes, index, -1)) this.afterChange();
    });
    this.iconBtn(head, "arrow-down", "Move scene down", () => {
      if (moveItem(project.scenes, index, 1)) this.afterChange();
    });
    this.iconBtn(head, "trash", "Delete scene", () => {
      new ConfirmModal(this.app, `Delete scene "${scene.name}" and its shots?`, () => {
        project.scenes.splice(index, 1);
        this.afterChange();
      }).open();
    });

    // Folded scene: header plus a strip of shot thumbnails only.
    if (scene.collapsed) {
      const strip = box.createDiv("sm-strip");
      if (!scene.shots.length) strip.createDiv({ cls: "sm-muted", text: "No shots yet" });
      for (const shot of scene.shots) {
        const t = this.renderImage(strip, shot.image, "sm-thumb sm-mini", "No image");
        t.setAttr("title", shot.name);
        t.addEventListener("click", () => {
          scene.collapsed = false;
          this.afterChange();
        });
      }
      return;
    }

    const desc = box.createEl("textarea", {
      cls: "sm-textarea",
      attr: { placeholder: "Scene description / notes", rows: "2" },
    });
    desc.value = scene.description;
    desc.addEventListener("input", () => {
      scene.description = desc.value;
      this.plugin.scheduleSave();
    });

    const allFolded = scene.shots.length > 0 && scene.shots.every((s) => s.collapsed);
    const grid = box.createDiv("sm-grid sm-shots" + (allFolded ? " sm-shots-compact" : ""));
    scene.shots.forEach((shot, j) => this.renderShot(grid, scene, shot, j));
  }

  afterChange() {
    this.plugin.scheduleSave();
    this.render();
  }

  setAllScenes(project, collapsed) {
    for (const s of project.scenes) s.collapsed = collapsed;
    this.afterChange();
  }

  /** If any shot is open, fold them all to thumbnails; otherwise open them all. */
  toggleShots(shots) {
    const fold = shots.some((s) => !s.collapsed);
    for (const s of shots) s.collapsed = fold;
    this.afterChange();
  }

  renderShot(grid, scene, shot, index) {
    const card = grid.createDiv("sm-card sm-shot");

    // Folded shot: thumbnail only (name as a small caption, click to unfold).
    if (shot.collapsed) {
      card.addClass("sm-shot-collapsed");
      const thumb = this.renderImage(card, shot.image, "sm-thumb", "No image");
      thumb.addEventListener("click", () => {
        shot.collapsed = false;
        this.afterChange();
      });
      const bar = card.createDiv("sm-shot-bar");
      bar.createSpan({ cls: "sm-shot-bar-name", text: shot.name });
      this.iconBtn(bar, "chevron-down", "Unfold shot", () => {
        shot.collapsed = false;
        this.afterChange();
      });
      return;
    }

    this.renderImage(card, shot.image, "sm-thumb", "No image");
    const body = card.createDiv("sm-card-body");

    const top = body.createDiv("sm-shot-top");
    const name = top.createEl("input", { cls: "sm-input sm-shot-name", attr: { type: "text" } });
    this.iconBtn(top, "chevron-up", "Fold shot (thumbnail only)", () => {
      shot.collapsed = true;
      this.afterChange();
    });
    name.value = shot.name;
    name.addEventListener("input", () => {
      shot.name = name.value;
      this.plugin.scheduleSave();
    });

    const imgRow = body.createDiv("sm-actions");
    imgRow.createEl("button", { text: shot.image ? "Change image" : "Choose image" }).onclick = () =>
      this.pickImage((path) => (shot.image = path));
    if (shot.image) {
      imgRow.createEl("button", { text: "Clear" }).onclick = () => {
        shot.image = "";
        this.afterChange();
      };
    }

    body.createDiv({ cls: "sm-label", text: "Notes" });
    const notes = body.createEl("textarea", { cls: "sm-textarea", attr: { rows: "2", placeholder: "Shot notes" } });
    notes.value = shot.notes;
    notes.addEventListener("input", () => {
      shot.notes = notes.value;
      this.plugin.scheduleSave();
    });

    const pl = body.createDiv("sm-label sm-label-row");
    pl.createSpan({ text: "Prompt" });
    this.iconBtn(pl, "copy", "Copy prompt", async () => {
      try {
        await navigator.clipboard.writeText(shot.prompt || "");
        new Notice("Prompt copied");
      } catch (e) {
        new Notice("Could not copy the prompt");
      }
    });
    const prompt = body.createEl("textarea", {
      cls: "sm-textarea sm-prompt",
      attr: { rows: "5", placeholder: "Prompt text for this shot" },
    });
    prompt.value = shot.prompt;
    prompt.addEventListener("input", () => {
      shot.prompt = prompt.value;
      this.plugin.scheduleSave();
    });

    const actions = body.createDiv("sm-actions");
    this.iconBtn(actions, "arrow-left", "Move shot earlier", () => {
      if (moveItem(scene.shots, index, -1)) this.afterChange();
    });
    this.iconBtn(actions, "arrow-right", "Move shot later", () => {
      if (moveItem(scene.shots, index, 1)) this.afterChange();
    });
    this.iconBtn(actions, "trash", "Delete shot", () => {
      new ConfirmModal(this.app, `Delete shot "${shot.name}"?`, () => {
        scene.shots.splice(index, 1);
        this.afterChange();
      }).open();
    });
  }
}

/* ------------------------------------------------------------------ plugin */

class SceneManagerPlugin extends Plugin {
  async onload() {
    this.store = normalizeStore(await this.loadData());
    this.ui = { projectId: null };

    this.registerView(VIEW_TYPE, (leaf) => new SceneManagerView(leaf, this));
    this.addRibbonIcon("clapperboard", "Open Scene Manager", () => this.activateView());
    this.addCommand({
      id: "open-scene-manager",
      name: "Open Scene Manager",
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "backup-scene-manager",
      name: "Back up Scene Manager data to the vault",
      callback: () => this.backup(),
    });

    // Keep image references valid when image files (or their folders) are renamed/moved.
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.onFileRenamed(file, oldPath)));
  }

  onunload() {
    clearTimeout(this._saveTimer);
    this.saveData(this.store);
  }

  getProject(id) {
    return this.store.projects.find((p) => p.id === id) || null;
  }

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveData(this.store), 400);
  }

  /** Turn a stored reference (path or [[link]]) into a displayable URL, or null. */
  resolveImage(ref) {
    if (!ref || typeof ref !== "string") return null;
    const p = ref.trim().replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0];
    let f = this.app.vault.getAbstractFileByPath(p);
    if (!(f instanceof TFile)) f = this.app.metadataCache.getFirstLinkpathDest(p, "");
    return f instanceof TFile ? this.app.vault.getResourcePath(f) : null;
  }

  onFileRenamed(file, oldPath) {
    let changed = false;
    const fix = (obj, key) => {
      const next = remapPath(obj[key], oldPath, file.path);
      if (next !== obj[key]) {
        obj[key] = next;
        changed = true;
      }
    };
    for (const p of this.store.projects) {
      fix(p, "thumbnail");
      for (const s of p.scenes) for (const sh of s.shots) fix(sh, "image");
    }
    if (changed) {
      this.scheduleSave();
      this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => {
        if (l.view instanceof SceneManagerView) l.view.render();
      });
    }
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async backup() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `Scene Manager backup ${stamp}.json`;
    await this.app.vault.create(path, JSON.stringify(this.store, null, 2));
    new Notice(`Backup saved: ${path}`);
  }
}

module.exports = SceneManagerPlugin;
module.exports.__test = { normalizeStore, remapPath, moveItem };
