import {
  getQuestById,
  approveQuest,
  rejectQuest,
  QUEST_STATUS,
  QUEST_STATUS_LABELS,
} from "../../shared/js/data/questsData.js";
import {
  canAccessAdminPanel,
  getCurrentUser,
} from "../../shared/js/data/usersData.js";
import { getGameLabel } from "../../shared/js/data/gamesCatalog.js";

const params = new URLSearchParams(window.location.search);
const questId = params.get("id");

const titleEl = document.getElementById("reviewTitle");
const metaEl = document.getElementById("reviewMeta");
const panelEl = document.getElementById("reviewPanel");
const actionsEl = document.getElementById("reviewActions");
const statusEl = document.getElementById("reviewStatus");
const approveBtn = document.getElementById("approveBtn");
const rejectBtn = document.getElementById("rejectBtn");
const tabs = document.querySelectorAll(".quest-mode-tab");

let quest = null;
let storyIndex = 0;
let comicIndex = 0;

if (!canAccessAdminPanel()) {
  window.location.href = "../user/home.html";
}

function resolveImage(src) {
  if (!src) return "";
  if (
    src.startsWith("data:") ||
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("/") ||
    src.startsWith("../")
  ) {
    return src;
  }
  if (src.includes("/")) return `../${src}`;
  return `../img/${src}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderMode(mode) {
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });

  if (!quest) {
    panelEl.innerHTML = `<p class="page-placeholder">Квест не знайдено.</p>`;
    return;
  }

  if (mode === "story") {
    const pages = quest.story?.pages || [];
    if (!pages.length) {
      panelEl.innerHTML = `<p class="page-placeholder">Історія ще не додана.</p>`;
      return;
    }
    storyIndex = Math.min(storyIndex, pages.length - 1);
    const page = pages[storyIndex];
    const img = resolveImage(page.image);
    panelEl.innerHTML = `
      <article class="story-page">
        ${img ? `<img class="story-page__img" src="${img}" alt="">` : ""}
        <p class="quest-player-step">Сторінка ${storyIndex + 1} з ${pages.length}</p>
        <h2>${escapeHtml(page.chapterTitle || "")}</h2>
        <p class="story-page__text">${escapeHtml(page.text || "")}</p>
        ${page.quote ? `<blockquote class="story-page__quote">${escapeHtml(page.quote)}</blockquote>` : ""}
        <div class="story-nav">
          <button type="button" class="btn-secondary-editor" id="storyPrev" ${storyIndex === 0 ? "disabled" : ""}>Попередня</button>
          <button type="button" class="btn-logout" id="storyNext" style="max-width:none;margin:0">
            ${storyIndex < pages.length - 1 ? "Наступна" : "Далі"}
          </button>
        </div>
      </article>
    `;
    document.getElementById("storyPrev")?.addEventListener("click", () => {
      storyIndex -= 1;
      renderMode("story");
    });
    document.getElementById("storyNext")?.addEventListener("click", () => {
      if (storyIndex < pages.length - 1) {
        storyIndex += 1;
        renderMode("story");
      } else {
        renderMode((quest.comic?.scenes || []).length ? "comic" : "game");
      }
    });
    return;
  }

  if (mode === "comic") {
    const scenes = quest.comic?.scenes || [];
    if (!scenes.length) {
      panelEl.innerHTML = `<p class="page-placeholder">Комікс ще не додано.</p>`;
      return;
    }
    comicIndex = Math.min(comicIndex, scenes.length - 1);
    const scene = scenes[comicIndex];
    const img = resolveImage(scene.image);
    const lines = (scene.dialogues || [])
      .map(
        (d) =>
          `<p><strong>${escapeHtml(d.speaker || "")}:</strong> ${escapeHtml(d.text || "")}</p>`,
      )
      .join("");
    panelEl.innerHTML = `
      <article class="story-page">
        ${img ? `<img class="story-page__img" src="${img}" alt="">` : ""}
        <p class="quest-player-step">Сцена ${comicIndex + 1} з ${scenes.length}</p>
        <div class="comic-dialogues">${lines || "<p class='page-placeholder'>Немає реплік</p>"}</div>
        <div class="story-nav">
          <button type="button" class="btn-secondary-editor" id="comicPrev" ${comicIndex === 0 ? "disabled" : ""}>Попередня</button>
          <button type="button" class="btn-logout" id="comicNext" style="max-width:none;margin:0">
            ${comicIndex < scenes.length - 1 ? "Наступна" : "До гри"}
          </button>
        </div>
      </article>
    `;
    document.getElementById("comicPrev")?.addEventListener("click", () => {
      comicIndex -= 1;
      renderMode("comic");
    });
    document.getElementById("comicNext")?.addEventListener("click", () => {
      if (comicIndex < scenes.length - 1) {
        comicIndex += 1;
        renderMode("comic");
      } else {
        renderMode("game");
      }
    });
    return;
  }

  const build = quest.game?.buildFolder || "";
  const gameLabel = getGameLabel(build) || "—";
  panelEl.innerHTML = `
    <article class="story-page">
      <h2>Гра</h2>
      <p class="story-page__text">${escapeHtml(gameLabel)}</p>
      <p class="page-placeholder" style="margin-top:12px;">Перегляд гри в модерації — інформаційний. Повна гра доступна гравцям після публікації.</p>
    </article>
  `;
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => renderMode(tab.dataset.mode));
});

function showStatus(text, isError = false) {
  statusEl.hidden = false;
  statusEl.classList.toggle("error", isError);
  statusEl.textContent = text;
}

async function handleApprove() {
  if (!quest) return;
  if (!confirm(`Погодити квест «${quest.title}» і опублікувати в каталозі?`)) return;

  approveBtn.disabled = true;
  rejectBtn.disabled = true;
  try {
    const user = getCurrentUser();
    quest = await approveQuest(quest.id, user?.id || null);
    metaEl.textContent = `${quest.authorName || "Казкар"} · ${QUEST_STATUS_LABELS[QUEST_STATUS.PUBLISHED]}`;
    actionsEl.hidden = true;
    showStatus("Квест опубліковано. Він з’явиться у вкладці «Квести».");
  } catch (err) {
    console.error(err);
    showStatus(err?.message || "Не вдалося погодити", true);
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
}

async function handleReject() {
  if (!quest) return;
  const note = prompt("Причина відхилення (побачать казкар):", "Потребує правок");
  if (note === null) return;

  approveBtn.disabled = true;
  rejectBtn.disabled = true;
  try {
    const user = getCurrentUser();
    quest = await rejectQuest(quest.id, user?.id || null, note.trim());
    metaEl.textContent = `${quest.authorName || "Казкар"} · ${QUEST_STATUS_LABELS[QUEST_STATUS.REJECTED]}`;
    actionsEl.hidden = true;
    showStatus("Квест відхилено.");
  } catch (err) {
    console.error(err);
    showStatus(err?.message || "Не вдалося відхилити", true);
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
}

approveBtn?.addEventListener("click", handleApprove);
rejectBtn?.addEventListener("click", handleReject);

async function init() {
  if (!questId) {
    titleEl.textContent = "Квест не вказано";
    panelEl.innerHTML = `<p class="page-placeholder">Поверніться до черги модерації.</p>`;
    return;
  }

  quest = await getQuestById(questId);
  if (!quest) {
    titleEl.textContent = "Не знайдено";
    panelEl.innerHTML = `<p class="page-placeholder">Квест не знайдено.</p>`;
    return;
  }

  titleEl.textContent = quest.title || "Без назви";
  metaEl.textContent = `${quest.authorName || "Казкар"} · ${QUEST_STATUS_LABELS[quest.status] || quest.status}`;

  if (quest.status === QUEST_STATUS.PENDING_REVIEW) {
    actionsEl.hidden = false;
  }

  renderMode("story");
}

init().catch((err) => {
  console.error(err);
  panelEl.innerHTML = `<p class="page-placeholder">Помилка завантаження</p>`;
});
