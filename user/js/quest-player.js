import { getQuestById, QUEST_STATUS, isPublished } from "../../shared/js/data/questsData.js";
import { getCurrentUser, canAccessAdminPanel } from "../../shared/js/data/usersData.js";
import { markPartCompleted } from "../../shared/js/data/progressData.js";
import { getCurrentPosition, distanceMeters, recordQuestDistance } from "../../shared/js/data/distanceData.js";
import { getGameLabel } from "../../shared/js/data/gamesCatalog.js";

const params = new URLSearchParams(window.location.search);
const questId = params.get("id");

const titleEl = document.getElementById("questTitle");
const stepEl = document.getElementById("questStepLabel");
const panelEl = document.getElementById("questModePanel");
const tabs = document.querySelectorAll(".quest-mode-tab");

let quest = null;
let currentMode = "story";
let storyIndex = 0;
let comicIndex = 0;

// Точка А — позиція користувача на момент відкриття квесту.
// Якщо дозволу нема чи геолокація недоступна — просто лишається null,
// і відстань за цей квест ніколи не запишеться (без помилок і алертів).
let startPosition = null;

/** Точка Б: фіксується лише в момент реального завершення квесту (justCompleted). */
async function recordDistanceIfCompleted(result) {
  if (!result?.justCompleted || !startPosition || !quest?.id) return;
  const user = getCurrentUser();
  if (!user?.id) return;

  try {
    const endPosition = await getCurrentPosition();
    const meters = distanceMeters(startPosition, endPosition);
    await recordQuestDistance(user.id, quest.id, meters);
  } catch (err) {
    console.error("Не вдалося зафіксувати пройдену відстань:", err);
  }
}

const PROGRESS_KEY = "questProgressByUser";

function saveQuestProgress(percent) {
  const user = getCurrentUser();
  if (!user?.id || !questId) return;
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    const mine = all[user.id] || {};
    const prev = Number(mine[questId]?.percent) || 0;
    mine[questId] = {
      percent: Math.max(prev, Math.min(100, Math.round(percent))),
      updatedAt: Date.now(),
    };
    all[user.id] = mine;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function calcProgress() {
  const pages = quest?.story?.pages?.length || 0;
  const scenes = quest?.comic?.scenes?.length || 0;
  const total = pages + scenes + 1;
  if (!total) return 5;
  let done = 0;
  if (currentMode === "story") done = storyIndex + 1;
  else if (currentMode === "comic") done = pages + comicIndex + 1;
  else done = total;
  return Math.max(5, Math.min(99, Math.round((done / total) * 100)));
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

function renderMode(mode) {
  currentMode = mode;

  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });

  if (!quest) {
    panelEl.innerHTML = `<p class="page-placeholder">Квест не знайдено. Поверніться до списку.</p>`;
    return;
  }

  saveQuestProgress(calcProgress());

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
        <h2>${page.chapterTitle || ""}</h2>
        <p class="story-page__text">${page.text || ""}</p>
        ${page.quote ? `<blockquote class="story-page__quote">${page.quote}</blockquote>` : ""}
        <div class="story-nav">
          <button type="button" class="btn-secondary-editor" id="storyPrev" ${storyIndex === 0 ? "disabled" : ""}>Попередня</button>
          <button type="button" class="btn-logout" id="storyNext" style="max-width:none;margin:0">
            ${storyIndex < pages.length - 1 ? "Наступна" : "До коміксу / гри"}
          </button>
        </div>
      </article>
    `;
    document.getElementById("storyPrev")?.addEventListener("click", () => {
      storyIndex -= 1;
      renderMode("story");
    });
    document.getElementById("storyNext")?.addEventListener("click", async () => {
      if (storyIndex < pages.length - 1) {
        storyIndex += 1;
        renderMode("story");
      } else {
        const result = await markPartCompleted(quest, "story").catch((err) => {
          console.error("Не вдалося зарахувати проходження історії:", err);
          return null;
        });
        await recordDistanceIfCompleted(result);
        renderMode((quest.comic?.scenes || []).length ? "comic" : "game");
      }
    });
    return;
  }

  if (mode === "comic") {
    const scenes = quest.comic?.scenes || [];
    if (!scenes.length) {
      panelEl.innerHTML = `<p class="page-placeholder">Комікс ще не доданий.</p>`;
      return;
    }
    comicIndex = Math.min(comicIndex, scenes.length - 1);
    const scene = scenes[comicIndex];
    const img = resolveImage(scene.image);
    const lines = (scene.dialogues || [])
      .filter((d) => d.speaker || d.text)
      .map((d) => `<p><strong>${d.speaker || "…"}:</strong> ${d.text || ""}</p>`)
      .join("");
    panelEl.innerHTML = `
      <article class="story-page">
        ${img ? `<img class="story-page__img" src="${img}" alt="">` : ""}
        <p class="quest-player-step">Сцена ${comicIndex + 1} з ${scenes.length}</p>
        <div class="comic-dialogues">${lines || "<p class='page-placeholder'>Немає реплік</p>"}</div>
        <div class="story-nav">
          <button type="button" class="btn-secondary-editor" id="comicPrev" ${comicIndex === 0 ? "disabled" : ""}>Назад</button>
          <button type="button" class="btn-logout" id="comicNext" style="max-width:none;margin:0">
            ${comicIndex < scenes.length - 1 ? "Далі" : "До гри"}
          </button>
        </div>
      </article>
    `;
    document.getElementById("comicPrev")?.addEventListener("click", () => {
      comicIndex -= 1;
      renderMode("comic");
    });
    document.getElementById("comicNext")?.addEventListener("click", async () => {
      if (comicIndex < scenes.length - 1) {
        comicIndex += 1;
        renderMode("comic");
      } else {
        const result = await markPartCompleted(quest, "comic").catch((err) => {
          console.error("Не вдалося зарахувати проходження коміксу:", err);
          return null;
        });
        await recordDistanceIfCompleted(result);
        renderMode("game");
      }
    });
    return;
  }

  // mode === "game"
  const build = quest?.game?.buildFolder;

  if (!build) {
    panelEl.innerHTML = `
      <div class="quest-game-cta">
        <p class="quest-game-cta__title">ГОТОВІ ДО ПРИГОД?</p>
        <button type="button" class="btn-logout" disabled>Гра ще не прив'язана</button>
      </div>
    `;
    return;
  }

  const gameLabel = getGameLabel(build)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  panelEl.innerHTML = `
    <div class="quest-game-cta">
      <p class="quest-game-cta__title">ГОТОВІ ДО ПРИГОД?</p>
      <p class="page-placeholder" style="margin-top:8px;">${gameLabel}</p>
      <button type="button" class="btn-logout" id="startGameBtn">ГРАТИ</button>
      <p id="gameResultLabel" class="page-placeholder" style="margin-top:12px;" hidden></p>
    </div>
  `;

  document.getElementById("startGameBtn")?.addEventListener("click", () => {
    openGameFullscreen(build);
  });
}

function bindGameResultListener(closeOverlay) {
  if (window.__questGameMessageHandler) {
    window.removeEventListener("message", window.__questGameMessageHandler);
  }

  window.__questGameMessageHandler = async (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== "kamianets-deer") return;

    const label = document.getElementById("gameResultLabel");

    if (data.status === "completed") {
      saveQuestProgress(100);
      // Показуємо результат ЛИШЕ після реальної спроби зарахувати нагороду —
      // раніше повідомлення про успіх з'являлось одразу, незалежно від того,
      // чи вдався запис у Firestore.
      try {
        const result = await markPartCompleted(quest, "game");
        await recordDistanceIfCompleted(result);
        if (label) {
          label.hidden = false;
          label.textContent = "Перемога! Нагороду нараховано.";
        }
        // Автозакриття — тільки коли нагорода реально зарахована,
        // щоб встиг побачити повідомлення про успіх перед закриттям.
        setTimeout(() => closeOverlay(), 2000);
      } catch (err) {
        console.error("Не вдалося зарахувати нагороду за гру:", err);
        if (label) {
          label.hidden = false;
          label.textContent =
            "Перемога зарахована, але нагороду нарахувати не вдалося. Онови сторінку й спробуй ще раз, або повідом адміна.";
        }
        // Оверлей навмисно НЕ закриваємо автоматично — щоб не пропустив помилку.
      }
      return;
    }

    if (label) {
      label.hidden = false;
      label.textContent = "Спробуй ще раз, щоб отримати нагороду.";
    }
  };

  window.addEventListener("message", window.__questGameMessageHandler);
}

function openGameFullscreen(build) {
  // Не даємо відкрити другий оверлей поверх першого
  if (document.getElementById("gameFullscreenOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "gameFullscreenOverlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: #000;
    z-index: 9999;
  `;
  overlay.innerHTML = `
    <button type="button" id="closeGameBtn" style="
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 10000;
      background: rgba(255,255,255,0.9);
      border: none;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      font-size: 18px;
      cursor: pointer;
    ">✕</button>
    <iframe
      id="gameFrame"
      src="../builds/${build}/index.html"
      style="width:100%; height:100%; border:none; display:block;"
      allow="fullscreen"
      allowfullscreen
      title="${getGameLabel(build) || "Гра квесту"}"
    ></iframe>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("quest-game-no-scroll");

  const closeOverlay = () => {
    overlay.remove();
    document.body.classList.remove("quest-game-no-scroll");
  };

  document.getElementById("closeGameBtn")?.addEventListener("click", closeOverlay);

  bindGameResultListener(closeOverlay);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => renderMode(tab.dataset.mode));
});

getQuestById(questId).then((loaded) => {
  quest = loaded;
  const user = getCurrentUser();
  const canPreview =
    canAccessAdminPanel() ||
    (user && quest && quest.authorId === user.id);

  if (quest && !isPublished(quest) && !canPreview) {
    quest = null;
    titleEl.textContent = "Квест недоступний";
    panelEl.innerHTML = `<p class="page-placeholder">Цей квест ще не опубліковано.</p>`;
    return;
  }

  if (quest) {
    titleEl.textContent = quest.title || "Без назви";
    const statusHint =
      quest.status && quest.status !== QUEST_STATUS.PUBLISHED
        ? ` · ${quest.status}`
        : "";
    stepEl.textContent = `${quest.type || "Квест"}${quest.duration ? ` · ${quest.duration}` : ""}${statusHint}`;
    document.title = quest.title || "Квест";
    saveQuestProgress(5);

    // Точка А — фіксуємо мовчки одразу при відкритті квесту.
    // Якщо юзер не дасть дозвіл на геолокацію — просто нічого не запишеться.
    getCurrentPosition()
      .then((pos) => {
        startPosition = pos;
      })
      .catch(() => {
        /* немає дозволу чи геолокація недоступна — км за цей квест не рахуються */
      });
  } else {
    titleEl.textContent = "Квест не знайдено";
  }
  renderMode(currentMode);
}).catch((err) => {
  console.error(err);
  titleEl.textContent = "Помилка завантаження";
  panelEl.innerHTML = `<p class="page-placeholder">Не вдалося відкрити квест.</p>`;
});