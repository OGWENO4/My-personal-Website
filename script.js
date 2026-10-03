(() => {
  "use strict";

  const STORAGE_KEY = "forma-workspace-items-v1";
  const types = {
    repository: { label: "Repository", icon: "⌘", urlLabel: "Open repository" },
    project: { label: "Project", icon: "◈", urlLabel: "Open project" },
    note: { label: "Note / idea", icon: "▤", urlLabel: "Open link" },
    resource: { label: "Resource", icon: "↗", urlLabel: "Open resource" }
  };
  const filters = ["all", "repository", "project", "note", "resource"];
  const elements = {
    grid: document.querySelector("#item-grid"),
    empty: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyDescription: document.querySelector("#empty-description"),
    modal: document.querySelector("#item-modal"),
    form: document.querySelector("#item-form"),
    formError: document.querySelector("#form-error"),
    search: document.querySelector("#search-input"),
    sort: document.querySelector("#sort-select"),
    count: document.querySelector("#visible-count"),
    favorites: document.querySelector("#favorites-filter"),
    file: document.querySelector("#import-file"),
    sidebar: document.querySelector("#sidebar"),
    mobileMenu: document.querySelector("#mobile-menu"),
    toastRegion: document.querySelector("#toast-region")
  };

  let items = loadItems();
  let activeFilter = "all";
  let favoritesOnly = false;
  let editingId = null;

  function loadItems() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("The saved workspace is not a valid item list.");
      return parsed.filter(isValidItem);
    } catch (error) {
      console.error("Could not load the saved workspace.", error);
      queueMicrotask(() => showToast("Could not read saved data. Your existing items are still in this browser.", true));
      return [];
    }
  }

  function isValidItem(item) {
    return item && typeof item.id === "string" && typeof item.title === "string" &&
      Object.hasOwn(types, item.type) && typeof item.createdAt === "string" &&
      (item.tag === undefined || typeof item.tag === "string") &&
      (item.url === undefined || typeof item.url === "string") &&
      (item.description === undefined || typeof item.description === "string") &&
      (item.favorite === undefined || typeof item.favorite === "boolean");
  }

  function createId() {
    return typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function saveItems() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (error) {
      console.error("Could not save the workspace.", error);
      showToast("Could not save changes. Your browser storage may be full or unavailable.", true);
      return false;
    }
  }

  function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = isError ? "toast toast-error" : "toast";
    toast.setAttribute("role", isError ? "alert" : "status");
    toast.textContent = message;
    elements.toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }

  function formatDate(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function safeLink(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function makeCard(item) {
    const card = document.createElement("article");
    card.className = "item-card";

    const top = document.createElement("div");
    top.className = "card-top";
    const icon = document.createElement("span");
    icon.className = `item-type-icon type-${item.type}`;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = types[item.type].icon;
    const typeLabel = document.createElement("span");
    typeLabel.className = "type-label";
    typeLabel.textContent = types[item.type].label;

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const link = safeLink(item.url);
    if (link) {
      const openLink = document.createElement("a");
      openLink.className = "card-action";
      openLink.href = link;
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
      openLink.setAttribute("aria-label", types[item.type].urlLabel);
      openLink.title = types[item.type].urlLabel;
      openLink.textContent = "↗";
      actions.append(openLink);
    }
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = `card-action favorite-button${item.favorite ? " is-favorite" : ""}`;
    favorite.setAttribute("aria-label", item.favorite ? "Remove from favorites" : "Add to favorites");
    favorite.setAttribute("aria-pressed", String(Boolean(item.favorite)));
    favorite.title = item.favorite ? "Remove from favorites" : "Add to favorites";
    favorite.textContent = item.favorite ? "♥" : "♡";
    favorite.addEventListener("click", () => toggleFavorite(item.id));
    actions.append(favorite);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "card-action";
    edit.setAttribute("aria-label", `Edit ${item.title}`);
    edit.title = "Edit item";
    edit.textContent = "✎";
    edit.addEventListener("click", () => openModal(item.type, item));
    actions.append(edit);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "card-action";
    remove.setAttribute("aria-label", `Delete ${item.title}`);
    remove.title = "Delete item";
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteItem(item.id));
    actions.append(remove);
    top.append(icon, typeLabel, actions);

    const title = document.createElement("h3");
    title.textContent = item.title;
    const description = document.createElement("p");
    description.className = "card-description";
    description.textContent = item.description || "No details added yet.";

    const footer = document.createElement("div");
    footer.className = "card-footer";
    if (item.tag) {
      const tag = document.createElement("span");
      tag.className = "item-tag";
      tag.textContent = item.tag;
      footer.append(tag);
    }
    const date = document.createElement("time");
    date.className = "item-date";
    date.dateTime = item.createdAt;
    date.textContent = formatDate(item.createdAt);
    footer.append(date);
    card.append(top, title, description, footer);
    return card;
  }

  function render() {
    const counts = Object.fromEntries(filters.map(filter => [
      filter,
      filter === "all" ? items.length : items.filter(item => item.type === filter).length
    ]));

    for (const type of Object.keys(types)) {
      const countId = type === "repository" ? "repo-count" : `${type}-count`;
      document.querySelector(`#${countId}`).textContent = counts[type];
      document.querySelector(`#filter-${type}-count`).textContent = counts[type];
    }
    document.querySelector("#stat-repositories").textContent = counts.repository;
    document.querySelector("#stat-projects").textContent = counts.project;
    document.querySelector("#stat-total").replaceChildren(
      document.createTextNode(String(items.length)),
      Object.assign(document.createElement("small"), { textContent: " items" })
    );
    document.querySelector("#stat-notes").textContent = counts.note;
    document.querySelector("#filter-all-count").textContent = counts.all;

    const query = elements.search.value.trim().toLocaleLowerCase();
    const visible = items.filter(item => {
      const matchesFilter = activeFilter === "all" || item.type === activeFilter;
      const matchesFavorite = !favoritesOnly || Boolean(item.favorite);
      const text = `${item.title} ${item.description} ${item.tag} ${types[item.type].label}`.toLocaleLowerCase();
      return matchesFilter && matchesFavorite && text.includes(query);
    });
    if (elements.sort.value === "oldest") visible.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    else if (elements.sort.value === "az") visible.sort((a, b) => a.title.localeCompare(b.title));
    else visible.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    elements.grid.replaceChildren(...visible.map(makeCard));
    elements.count.textContent = visible.length;
    elements.grid.hidden = visible.length === 0;
    elements.empty.classList.toggle("is-visible", visible.length === 0);
    if (items.length === 0) {
      elements.emptyTitle.textContent = "A little space for big things.";
      elements.emptyDescription.textContent = "Save your first repository, project, note, or resource. Everything stays right here in your browser.";
      document.querySelector("#empty-add-button").hidden = false;
    } else if (visible.length === 0) {
      elements.emptyTitle.textContent = "Nothing here just yet.";
      elements.emptyDescription.textContent = query || favoritesOnly ? "Try a different search or filter to find what you’re looking for." : "Add something to this collection and it’ll show up here.";
      document.querySelector("#empty-add-button").hidden = Boolean(query || favoritesOnly || (activeFilter !== "all" && counts[activeFilter] > 0));
    }

    document.querySelectorAll("[data-filter]").forEach(button => {
      const selected = button.dataset.filter === activeFilter;
      if (button.classList.contains("nav-link")) button.classList.toggle("is-active", selected);
      else button.classList.toggle("is-selected", selected);
    });
    const sectionNames = { all: "Overview", repository: "Repositories", project: "Projects", note: "Notes", resource: "Resources" };
    document.querySelector("#breadcrumb-current").textContent = sectionNames[activeFilter];
    document.querySelector("#collection-title").childNodes[0].textContent = activeFilter === "all" ? "Your collection " : `${sectionNames[activeFilter]} `;
    document.querySelector("#page-title").innerHTML = activeFilter === "all"
      ? "Leonard’s HQ,<br><span>learning, building, becoming.</span>"
      : `${sectionNames[activeFilter]},<br><span>all in one place.</span>`;
  }

  function openModal(type = "repository", item = null) {
    elements.form.reset();
    elements.formError.hidden = true;
    editingId = item ? item.id : null;
    document.querySelector("#modal-title").textContent = item ? "Edit your item" : "Add to your space";
    document.querySelector("#modal-description").textContent = item
      ? "Update the details you want to keep."
      : "Save something you want to come back to.";
    document.querySelector("#item-title").value = item ? item.title : "";
    document.querySelector("#item-type").value = item ? item.type : types[type] ? type : "repository";
    document.querySelector("#item-tag").value = item ? item.tag || "" : "";
    document.querySelector("#item-url").value = item ? item.url || "" : "";
    document.querySelector("#item-description").value = item ? item.description || "" : "";
    const saveButton = document.querySelector("#save-item-button");
    saveButton.replaceChildren(document.createTextNode(item ? "Save changes" : "＋ Save to collection"));
    elements.modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => document.querySelector("#item-title").focus(), 0);
  }

  function closeModal() {
    elements.modal.hidden = true;
    document.body.style.overflow = "";
    editingId = null;
    document.querySelector("#top-add-button").focus();
  }

  function deleteItem(id) {
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    const previous = items;
    items = items.filter(entry => entry.id !== id);
    if (!saveItems()) {
      items = previous;
      return;
    }
    render();
    showToast("Item removed from your collection.");
  }

  function toggleFavorite(id) {
    const previous = items;
    items = items.map(item => item.id === id ? { ...item, favorite: !item.favorite } : item);
    if (!saveItems()) {
      items = previous;
      return;
    }
    render();
  }

  function exportItems() {
    const blob = new Blob([JSON.stringify({ app: "Leonard’s HQ", version: 1, exportedAt: new Date().toISOString(), items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `leonards-hq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Your workspace backup is ready.");
  }

  async function importItems(file) {
    try {
      const content = JSON.parse(await file.text());
      const imported = Array.isArray(content) ? content : content.items;
      if (!Array.isArray(imported) || !imported.every(isValidItem)) {
        throw new Error("This file doesn’t look like a Forma workspace backup.");
      }
      const existingIds = new Set(items.map(item => item.id));
      const additions = imported.map(item => {
        if (existingIds.has(item.id)) return { ...item, id: createId() };
        existingIds.add(item.id);
        return item;
      });
      const previous = items;
      items = [...items, ...additions];
      if (!saveItems()) {
        items = previous;
        return;
      }
      render();
      showToast(`${additions.length} ${additions.length === 1 ? "item" : "items"} imported successfully.`);
    } catch (error) {
      console.error("Could not import workspace backup.", error);
      showToast(error instanceof SyntaxError ? "This file isn’t valid JSON." : error.message || "Could not import this backup.", true);
    } finally {
      elements.file.value = "";
    }
  }

  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      favoritesOnly = false;
      elements.favorites.setAttribute("aria-pressed", "false");
      render();
      elements.sidebar.classList.remove("is-open");
      elements.mobileMenu.setAttribute("aria-expanded", "false");
      elements.mobileMenu.setAttribute("aria-label", "Open navigation");
    });
  });
  document.querySelectorAll(".nav-anchor").forEach(link => {
    link.addEventListener("click", () => {
      elements.sidebar.classList.remove("is-open");
      elements.mobileMenu.setAttribute("aria-expanded", "false");
      elements.mobileMenu.setAttribute("aria-label", "Open navigation");
    });
  });
  elements.search.addEventListener("input", render);
  elements.sort.addEventListener("change", render);
  elements.favorites.addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    elements.favorites.setAttribute("aria-pressed", String(favoritesOnly));
    render();
  });
  document.querySelector("#top-add-button").addEventListener("click", () => openModal(activeFilter === "all" ? "repository" : activeFilter));
  document.querySelector("#empty-add-button").addEventListener("click", () => openModal(activeFilter === "all" ? "repository" : activeFilter));
  document.querySelector("#modal-close").addEventListener("click", closeModal);
  document.querySelector("#cancel-button").addEventListener("click", closeModal);
  elements.modal.addEventListener("click", event => { if (event.target === elements.modal) closeModal(); });
  document.querySelector("#export-button").addEventListener("click", exportItems);
  document.querySelector("#import-button").addEventListener("click", () => elements.file.click());
  elements.file.addEventListener("change", () => { if (elements.file.files[0]) importItems(elements.file.files[0]); });
  elements.mobileMenu.addEventListener("click", () => {
    const isOpen = elements.sidebar.classList.toggle("is-open");
    elements.mobileMenu.setAttribute("aria-expanded", String(isOpen));
    elements.mobileMenu.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.search.focus();
    }
    if (event.key === "Escape") {
      if (!elements.modal.hidden) closeModal();
      else {
        elements.sidebar.classList.remove("is-open");
        elements.mobileMenu.setAttribute("aria-expanded", "false");
        elements.mobileMenu.setAttribute("aria-label", "Open navigation");
      }
    }
  });

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    const wasEditing = Boolean(editingId);
    const formData = new FormData(elements.form);
    const title = String(formData.get("title") || "").trim();
    const rawUrl = String(formData.get("url") || "").trim();
    const url = safeLink(rawUrl);
    if (!title) {
      elements.formError.textContent = "Please give your item a name.";
      elements.formError.hidden = false;
      document.querySelector("#item-title").focus();
      return;
    }
    if (rawUrl && !url) {
      elements.formError.textContent = "Enter a valid link starting with http:// or https://.";
      elements.formError.hidden = false;
      document.querySelector("#item-url").focus();
      return;
    }
    const item = {
      id: editingId || createId(),
      title,
      type: String(formData.get("type")),
      tag: String(formData.get("tag") || "").trim(),
      url,
      description: String(formData.get("description") || "").trim(),
      favorite: editingId ? Boolean(items.find(entry => entry.id === editingId)?.favorite) : false,
      createdAt: editingId ? items.find(entry => entry.id === editingId)?.createdAt || new Date().toISOString() : new Date().toISOString()
    };
    const previous = items;
    items = editingId
      ? items.map(entry => entry.id === editingId ? item : entry)
      : [item, ...items];
    if (!saveItems()) {
      items = previous;
      return;
    }
    activeFilter = "all";
    favoritesOnly = false;
    elements.favorites.setAttribute("aria-pressed", "false");
    closeModal();
    render();
    showToast(wasEditing ? "Your changes have been saved." : "Added to your collection.");
  });

  render();
})();