import {
  addQuest,
  getQuestById,
  updateQuest,
  createEmptyQuest,
  QUEST_STATUS,
  saveQuestAsDraft,
} from "../../shared/js/data/questsData.js";
import { getCurrentUser, getCurrentRole, ROLES } from "../../shared/js/data/usersData.js";
import { logActivity, ACTIVITY_TYPES } from "../../shared/js/data/activityData.js";
import {
  GAMES,
  formatGameLabel,
  getGameByBuildFolder,
} from "../../shared/js/data/gamesCatalog.js";

const params = new URLSearchParams(window.location.search);
const editId = params.get("id");

let draft = createEmptyQuest({
  story: { pages: [] },
  comic: { scenes: [] },
  game: { buildFolder: "", lockedUntil: "story", geo: null },
});

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.readAsDataURL(blob);
  });
}

function loadImageFromUrl(url, revoke = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (revoke) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (revoke) URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

async function normalizeImageBlob(file) {
  const name = (file.name || "").toLowerCase();
  let type = file.type || "";

  if (name.endsWith(".heic") || name.endsWith(".heif") || type.includes("heic") || type.includes("heif")) {
    throw new Error("Формат HEIC не підтримується в браузері. У галереї обери «JPG» або зроби скрін / експорт у JPG.");
  }

  if (!type || type === "application/octet-stream" || type === "image/*") {
    if (name.endsWith(".png")) type = "image/png";
    else if (name.endsWith(".webp")) type = "image/webp";
    else if (name.endsWith(".gif")) type = "image/gif";
    else type = "image/jpeg";
  }

  const buffer = await file.arrayBuffer();
  return new Blob([buffer], { type });
}

async function decodeImageBlob(blob) {
  // 1) createImageBitmap (швидко, якщо браузер вміє)
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bitmap, close: () => bitmap.close?.() };
    } catch {
      /* fallback */
    }
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, close: () => bitmap.close?.() };
    } catch {
      /* fallback */
    }
  }

  // 2) object URL
  try {
    const objectUrl = URL.createObjectURL(blob);
    const img = await loadImageFromUrl(objectUrl, true);
    return { source: img, close: () => {} };
  } catch {
    /* fallback */
  }

  // 3) data URL (часто рятує Android-галерею)
  const dataUrl = await readAsDataUrl(blob);
  const img = await loadImageFromUrl(dataUrl, false);
  return { source: img, close: () => {} };
}

async function compressImageFile(file, maxWidth = 1280, quality = 0.72) {
  if (!file) return "";
  if (file.size > 12_000_000) {
    throw new Error("Файл завеликий (макс. 12 МБ). Обери меншу картинку.");
  }

  try {
    const blob = await normalizeImageBlob(file);
    const { source, close } = await decodeImageBlob(blob);

    const srcW = source.width || source.videoWidth || 1;
    const srcH = source.height || source.videoHeight || 1;
    const scale = Math.min(1, maxWidth / srcW);
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, width, height);
    close();

    return canvas.toDataURL("image/jpeg", quality);
  } catch (err) {
    if (err?.message?.includes("HEIC")) throw err;
    throw new Error(
      "Не вдалося прочитати фото з галереї. Спробуй інше JPG/PNG або відкрий фото → «Поділитися / Зберегти як JPG» і завантаж знову.",
    );
  }
}

function showPreview(imgEl, src) {
  if (!imgEl) return;
  if (src) {
    imgEl.src = src;
    imgEl.hidden = false;
  } else {
    imgEl.removeAttribute("src");
    imgEl.hidden = true;
  }
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function escapeText(value) {
  return String(value).replaceAll("<", "&lt;");
}

// ===== Tabs =====
document.querySelectorAll(".quest-mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".quest-mode-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".editor-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`[data-panel="${tab.dataset.tab}"]`)?.classList.add("active");
  });
});

const metaTitle = document.getElementById("metaTitle");
const metaType = document.getElementById("metaType");
const metaDuration = document.getElementById("metaDuration");
const metaDescription = document.getElementById("metaDescription");
const metaCover = document.getElementById("metaCover");
const metaCoverPreview = document.getElementById("metaCoverPreview");
const metaXp = document.getElementById("metaXp");
const metaCoins = document.getElementById("metaCoins");
const gameBuild = document.getElementById("gameBuild");
const gameLock = document.getElementById("gameLock");
const storyPagesEl = document.getElementById("storyPages");
const comicScenesEl = document.getElementById("comicScenes");
const saveBtn = document.getElementById("saveQuestBtn");
const publishQuestBtn = document.getElementById("publishQuestBtn");
const saveStatus = document.getElementById("saveStatus");
const gameGeoCity = document.getElementById("gameGeoCity");
const gameGeoPlace = document.getElementById("gameGeoPlace");
const gameGeoLat = document.getElementById("gameGeoLat");
const gameGeoLng = document.getElementById("gameGeoLng");
const gameGeoRadius = document.getElementById("gameGeoRadius");
const useCurrentLocationBtn = document.getElementById("useCurrentLocationBtn");

function populateGameSelect(selectedFolder) {
  gameBuild.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "— не вибрано —";
  gameBuild.appendChild(empty);

  GAMES.forEach((game) => {
    const option = document.createElement("option");
    option.value = game.buildFolder;
    option.textContent = formatGameLabel(game);
    gameBuild.appendChild(option);
  });

  if (selectedFolder && !GAMES.some((game) => game.buildFolder === selectedFolder)) {
    const option = document.createElement("option");
    option.value = selectedFolder;
    option.textContent = selectedFolder;
    gameBuild.appendChild(option);
  }

  gameBuild.value = selectedFolder || "";
}

function applyGameGeoDefaults(game, { overwrite = false } = {}) {
  if (!game?.geo) return;
  const empty =
    !gameGeoLat.value.trim() &&
    !gameGeoLng.value.trim() &&
    !gameGeoPlace.value.trim();
  if (!overwrite && !empty) return;
  gameGeoCity.value = game.geo.city;
  gameGeoPlace.value = game.geo.placeName;
  gameGeoLat.value = game.geo.lat;
  gameGeoLng.value = game.geo.lng;
  gameGeoRadius.value = game.geo.radius;
}

function buildGeoPayload() {
  const lat = gameGeoLat.value.trim();
  const lng = gameGeoLng.value.trim();
  if (!lat || !lng) return null; // без координат геозони немає
  return {
    city: gameGeoCity.value.trim(),
    placeName: gameGeoPlace.value.trim(),
    lat: Number(lat),
    lng: Number(lng),
    radius: Number(gameGeoRadius.value) || 100,
  };
}

function buildPayload(currentUser, statusOverride) {
  return {
    title: metaTitle.value.trim(),
    type: metaType.value.trim(),
    duration: metaDuration.value.trim(),
    description: metaDescription.value.trim(),
    coverImage: draft.coverImage || "",
    authorId: draft.authorId || currentUser?.id || null,
    authorName: draft.authorName || currentUser?.name || "",
    status: statusOverride,
    reviewNote: draft.reviewNote || "",
    reviewedBy: draft.reviewedBy || null,
    reviewedAt: draft.reviewedAt || null,
    publishedAt: null,
    rewards: {
      xp: Number(metaXp.value) || 0,
      coins: Number(metaCoins.value) || 0,
    },
    story: { pages: draft.story.pages },
    comic: { scenes: draft.comic.scenes },
    game: {
      buildFolder: gameBuild.value,
      lockedUntil: gameLock.value,
      geo: buildGeoPayload(),
    },
  };
}

async function persistQuest({ asDraft, asPublish }) {
  const title = metaTitle.value.trim();
  if (!title) {
    alert("Вкажи назву квесту");
    return;
  }

  const currentUser = getCurrentUser();
  const isAdminUser = getCurrentRole() === ROLES.ADMIN;

  if (asPublish) {
    const ok = confirm(
      isAdminUser
        ? draft.status === QUEST_STATUS.PUBLISHED
          ? "Оновити опублікований квест?"
          : "Опублікувати квест одразу на сайт (без черги модерації)?"
        : draft.status === QUEST_STATUS.PUBLISHED
          ? "Квест зникне з каталогу гравців і знову піде на перевірку адміну. Продовжити?"
          : "Надіслати квест адміну на перевірку?",
    );
    if (!ok) return;
  } else if (draft.status === QUEST_STATUS.PUBLISHED) {
    const ok = confirm(
      "Збереження в чорнетку приховає квест з каталогу гравців. Продовжити?",
    );
    if (!ok) return;
  }

  const targetStatus = asPublish
    ? isAdminUser
      ? QUEST_STATUS.PUBLISHED
      : QUEST_STATUS.PENDING_REVIEW
    : QUEST_STATUS.DRAFT;
  const willBePublished = targetStatus === QUEST_STATUS.PUBLISHED;

  const payload = buildPayload(currentUser, targetStatus);
  if (willBePublished) {
    payload.publishedAt = new Date();
  }

  saveBtn.disabled = true;
  if (publishQuestBtn) publishQuestBtn.disabled = true;
  saveBtn.textContent = "Збереження…";
  if (publishQuestBtn && asPublish) {
    publishQuestBtn.textContent = isAdminUser ? "Публікація…" : "Надсилання…";
  }

  try {
    let saved;
    if (draft.id) {
      if (asDraft) {
        saved = await saveQuestAsDraft(draft.id, payload);
      } else {
        saved = await updateQuest(draft.id, {
          ...payload,
          status: targetStatus,
          publishedAt: willBePublished ? new Date() : null,
          reviewNote: willBePublished ? draft.reviewNote || "" : "",
          reviewedBy: willBePublished ? draft.reviewedBy || null : null,
          reviewedAt: willBePublished ? draft.reviewedAt || null : null,
        });
      }
    } else {
      saved = await addQuest({
        ...payload,
        status: targetStatus,
        publishedAt: willBePublished ? new Date() : null,
      });
      history.replaceState(null, "", `quest-editor.html?id=${saved.id}`);
      document.getElementById("editorTitle").textContent = "Редагування квесту";
      logActivity(
        ACTIVITY_TYPES.QUEST_CREATED,
        "Новий квест",
        `Додано квест «${payload.title}»`,
      ).catch((err) => console.error("Не вдалося записати активність:", err));
    }

    Object.assign(draft, saved);

    if (draft.status !== targetStatus) {
      saved = await updateQuest(draft.id, {
        status: targetStatus,
        publishedAt: willBePublished ? new Date() : null,
      });
      Object.assign(draft, saved);
    }

    saveStatus.hidden = false;
    saveStatus.classList.remove("error");
    if (asPublish) {
      if (isAdminUser) {
        saveStatus.textContent = "Опубліковано на сайті.";
        logActivity(
          ACTIVITY_TYPES.QUEST_PUBLISHED,
          "Квест опубліковано",
          `Опубліковано квест «${payload.title}»`,
        ).catch((err) => console.error("Не вдалося записати активність:", err));
      } else {
        saveStatus.textContent =
          "Надіслано на перевірку (статус: На розгляді). Квест знято з каталогу.";
      }
    } else {
      saveStatus.textContent = "Збережено в чорнетці (статус: У чорнетці).";
    }
  } catch (err) {
    console.error(err);
    saveStatus.hidden = false;
    saveStatus.classList.add("error");
    saveStatus.textContent = err?.message || "Помилка збереження";
    alert(err?.message || "Помилка збереження квесту");
  } finally {
    saveBtn.disabled = false;
    if (publishQuestBtn) publishQuestBtn.disabled = false;
    saveBtn.textContent = "Зберегти в чорнетку";
    if (publishQuestBtn) publishQuestBtn.textContent = "Опублікувати";
  }
}

function fillMetaFields() {
  metaTitle.value = draft.title || "";
  metaType.value = draft.type || "";
  metaDuration.value = draft.duration || "";
  metaDescription.value = draft.description || "";
  metaXp.value = draft.rewards?.xp ?? 20;
  metaCoins.value = draft.rewards?.coins ?? 10;
  populateGameSelect(draft.game?.buildFolder || "");
  gameLock.value = draft.game?.lockedUntil || "story";
  showPreview(metaCoverPreview, draft.coverImage);

  const geo = draft.game?.geo;
  gameGeoCity.value = geo?.city || "";
  gameGeoPlace.value = geo?.placeName || "";
  gameGeoLat.value = geo?.lat ?? "";
  gameGeoLng.value = geo?.lng ?? "";
  gameGeoRadius.value = geo?.radius ?? 100;

  const selectedGame = getGameByBuildFolder(gameBuild.value);
  if (selectedGame) applyGameGeoDefaults(selectedGame, { overwrite: false });
}

gameBuild.addEventListener("change", () => {
  const selectedGame = getGameByBuildFolder(gameBuild.value);
  applyGameGeoDefaults(selectedGame, { overwrite: true });
});

metaCover.addEventListener("change", async () => {
  try {
    draft.coverImage = await compressImageFile(metaCover.files?.[0]);
    showPreview(metaCoverPreview, draft.coverImage);
  } catch (err) {
    alert(err.message);
    metaCover.value = "";
  }
});

function renderStoryPages() {
  storyPagesEl.innerHTML = "";
  draft.story.pages.forEach((page, index) => {
    const block = document.createElement("div");
    block.className = "editor-block";
    block.innerHTML = `
      <div class="editor-block__head">
        <span>Сторінка ${index + 1}</span>
        <button type="button" class="editor-block__remove" data-remove-story="${index}">Видалити</button>
      </div>
      <label class="editor-field">
        <span>Картинка</span>
        <input type="file" accept="image/*" data-story-image="${index}">
        <img class="editor-preview" data-story-preview="${index}" alt="" ${page.image ? `src="${page.image}"` : "hidden"}>
      </label>
      <label class="editor-field">
        <span>Заголовок розділу</span>
        <input type="text" data-story-title="${index}" value="${escapeAttr(page.chapterTitle || "")}" placeholder="Розділ 1. …">
      </label>
      <label class="editor-field">
        <span>Текст</span>
        <textarea rows="4" data-story-text="${index}" placeholder="Текст історії…">${escapeText(page.text || "")}</textarea>
      </label>
      <label class="editor-field">
        <span>Цитата (опційно)</span>
        <input type="text" data-story-quote="${index}" value="${escapeAttr(page.quote || "")}" placeholder="Виділений рядок">
      </label>
    `;
    storyPagesEl.appendChild(block);
  });
}

document.getElementById("addStoryPage").addEventListener("click", () => {
  draft.story.pages.push({ image: "", chapterTitle: "", text: "", quote: "" });
  renderStoryPages();
});

storyPagesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove-story]");
  if (!btn) return;
  draft.story.pages.splice(Number(btn.dataset.removeStory), 1);
  renderStoryPages();
});

storyPagesEl.addEventListener("change", async (e) => {
  const imageInput = e.target.closest("[data-story-image]");
  if (!imageInput) return;
  const i = Number(imageInput.dataset.storyImage);
  try {
    draft.story.pages[i].image = await compressImageFile(imageInput.files?.[0]);
    showPreview(storyPagesEl.querySelector(`[data-story-preview="${i}"]`), draft.story.pages[i].image);
  } catch (err) {
    alert(err.message);
    imageInput.value = "";
  }
});

storyPagesEl.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.storyTitle != null) {
    draft.story.pages[Number(t.dataset.storyTitle)].chapterTitle = t.value;
  }
  if (t.dataset.storyText != null) {
    draft.story.pages[Number(t.dataset.storyText)].text = t.value;
  }
  if (t.dataset.storyQuote != null) {
    draft.story.pages[Number(t.dataset.storyQuote)].quote = t.value;
  }
});

function renderComicScenes() {
  comicScenesEl.innerHTML = "";
  draft.comic.scenes.forEach((scene, index) => {
    scene.dialogues ??= [];
    const dialoguesHtml = scene.dialogues.map((d, di) => `
      <div class="dialogue-row">
        <input type="text" data-speaker="${index}:${di}" value="${escapeAttr(d.speaker || "")}" placeholder="Хто">
        <input type="text" data-line="${index}:${di}" value="${escapeAttr(d.text || "")}" placeholder="Репліка">
        <button type="button" data-remove-line="${index}:${di}">✕</button>
      </div>
    `).join("");

    const block = document.createElement("div");
    block.className = "editor-block";
    block.innerHTML = `
      <div class="editor-block__head">
        <span>Сцена ${index + 1}</span>
        <button type="button" class="editor-block__remove" data-remove-comic="${index}">Видалити</button>
      </div>
      <label class="editor-field">
        <span>Картинка сцени</span>
        <input type="file" accept="image/*" data-comic-image="${index}">
        <img class="editor-preview" data-comic-preview="${index}" alt="" ${scene.image ? `src="${scene.image}"` : "hidden"}>
      </label>
      <div data-dialogues="${index}">${dialoguesHtml}</div>
      <button type="button" class="btn-secondary-editor" data-add-line="${index}">+ Репліка</button>
    `;
    comicScenesEl.appendChild(block);
  });
}

document.getElementById("addComicScene").addEventListener("click", () => {
  draft.comic.scenes.push({
    image: "",
    dialogues: [{ speaker: "", text: "" }],
  });
  renderComicScenes();
});

comicScenesEl.addEventListener("click", (e) => {
  const removeScene = e.target.closest("[data-remove-comic]");
  if (removeScene) {
    draft.comic.scenes.splice(Number(removeScene.dataset.removeComic), 1);
    renderComicScenes();
    return;
  }

  const addLine = e.target.closest("[data-add-line]");
  if (addLine) {
    const i = Number(addLine.dataset.addLine);
    draft.comic.scenes[i].dialogues.push({ speaker: "", text: "" });
    renderComicScenes();
    return;
  }

  const removeLine = e.target.closest("[data-remove-line]");
  if (removeLine) {
    const [si, di] = removeLine.dataset.removeLine.split(":").map(Number);
    draft.comic.scenes[si].dialogues.splice(di, 1);
    renderComicScenes();
  }
});

comicScenesEl.addEventListener("change", async (e) => {
  const imageInput = e.target.closest("[data-comic-image]");
  if (!imageInput) return;
  const i = Number(imageInput.dataset.comicImage);
  try {
    draft.comic.scenes[i].image = await compressImageFile(imageInput.files?.[0]);
    showPreview(comicScenesEl.querySelector(`[data-comic-preview="${i}"]`), draft.comic.scenes[i].image);
  } catch (err) {
    alert(err.message);
    imageInput.value = "";
  }
});

comicScenesEl.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.speaker != null) {
    const [si, di] = t.dataset.speaker.split(":").map(Number);
    draft.comic.scenes[si].dialogues[di].speaker = t.value;
  }
  if (t.dataset.line != null) {
    const [si, di] = t.dataset.line.split(":").map(Number);
    draft.comic.scenes[si].dialogues[di].text = t.value;
  }
});

useCurrentLocationBtn?.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Геолокація не підтримується цим браузером");
    return;
  }
  useCurrentLocationBtn.disabled = true;
  useCurrentLocationBtn.textContent = "Визначаємо…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gameGeoLat.value = pos.coords.latitude.toFixed(6);
      gameGeoLng.value = pos.coords.longitude.toFixed(6);
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.textContent = "📍 Взяти поточні координати";
    },
    (err) => {
      alert("Не вдалося отримати координати: " + err.message);
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.textContent = "📍 Взяти поточні координати";
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

if (saveBtn) {
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    persistQuest({ asDraft: true, asPublish: false });
  });
}

if (publishQuestBtn) {
  publishQuestBtn.addEventListener("click", (e) => {
    e.preventDefault();
    persistQuest({ asDraft: false, asPublish: true });
  });
} else {
  console.error("Кнопку «Опублікувати» не знайдено в DOM");
}

async function init() {
  if (editId) {
    const existing = await getQuestById(editId);
    if (existing) {
      draft = existing;
      draft.story ??= { pages: [] };
      draft.comic ??= { scenes: [] };
      draft.game ??= { buildFolder: "", lockedUntil: "story", geo: null };
      draft.rewards ??= { xp: 0, coins: 0 };
      document.getElementById("editorTitle").textContent = "Редагування квесту";
    }
  }

  if (!draft.story.pages.length) {
    draft.story.pages.push({ image: "", chapterTitle: "", text: "", quote: "" });
  }

  fillMetaFields();
  renderStoryPages();
  renderComicScenes();
}

init().catch((err) => {
  console.error(err);
  alert("Не вдалося відкрити конструктор");
});