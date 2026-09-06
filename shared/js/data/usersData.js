import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { auth, db } from "../firebase.js";

/** Ролі акаунта (права доступу) */
export const ROLES = Object.freeze({
  USER: "user",
  KAZKAR: "kazkar",
  ADMIN: "admin",
});

/** Статус акаунта */
export const USER_STATUS = Object.freeze({
  ACTIVE: "active",
  BLOCKED: "blocked",
});

/** Email, яким при реєстрації автоматично ставиться role: admin */
const ADMIN_EMAILS = [
  "kn1b24.kushnir@kpnu.edu.ua",
  "fkola821@gmail.com",
  "po1b24.fedorova@kpnu.edu.ua",
];

function mapAuthError(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "Користувач з таким email вже існує";
    case "auth/invalid-email":
      return "Невірний формат email";
    case "auth/weak-password":
      return "Пароль має містити щонайменше 6 символів";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Невірний email або пароль";
    case "auth/too-many-requests":
      return "Забагато спроб. Спробуйте пізніше";
    case "permission-denied":
      return "Немає доступу до бази даних. Перевірте Firestore Rules";
    default:
      return error?.message || "Сталася помилка. Спробуйте ще раз";
  }
}

function normalizeRole(data = {}) {
  if (data.role === ROLES.ADMIN || data.role === ROLES.KAZKAR || data.role === ROLES.USER) {
    return data.role;
  }
  if (data.isAdmin) return ROLES.ADMIN;
  return ROLES.USER;
}

function buildUser(uid, data = {}) {
  const role = normalizeRole(data);
  return {
    id: uid,
    name: data.name || "",
    email: data.email || "",
    birthDate: data.birthDate || "",
    role,
    status: data.status === USER_STATUS.BLOCKED ? USER_STATUS.BLOCKED : USER_STATUS.ACTIVE,
    isAdmin: role === ROLES.ADMIN,
    isKazkar: role === ROLES.KAZKAR || role === ROLES.ADMIN,
    coins: data.coins ?? 0,
    xp: data.xp ?? 0,
    createdAt: data.createdAt || null,
  };
}

async function fetchUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  const role = normalizeRole(data);
  const status =
    data.status === USER_STATUS.BLOCKED ? USER_STATUS.BLOCKED : USER_STATUS.ACTIVE;

  // Міграція старих документів (лише isAdmin → role/status)
  if (data.role !== role || data.status !== status || data.isAdmin !== (role === ROLES.ADMIN)) {
    await updateDoc(ref, {
      role,
      status,
      isAdmin: role === ROLES.ADMIN,
    }).catch(() => {});
  }

  return buildUser(uid, { ...data, role, status });
}

async function createMissingUserProfile(user) {
  const normalizedEmail = (user.email || "").trim().toLowerCase();
  const role = ADMIN_EMAILS.includes(normalizedEmail) ? ROLES.ADMIN : ROLES.USER;
  const profile = {
    name: user.displayName || "",
    email: normalizedEmail,
    birthDate: "",
    role,
    status: USER_STATUS.ACTIVE,
    isAdmin: role === ROLES.ADMIN,
    coins: 0,
    xp: 0,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, "users", user.uid), profile);
  return buildUser(user.uid, { ...profile, createdAt: new Date().toISOString() });
}

/**
 * Перевіряє і «витрачає» код запрошення казкаря.
 * Очікуваний документ: inviteCodes/{code}
 * { role: "kazkar", active: true, maxUses: number|null, usedCount: number }
 */
async function consumeKazkarInviteCode(code, uid) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    return { ok: false, error: "Введіть код запрошення казкаря" };
  }

  const codeRef = doc(db, "inviteCodes", normalized);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(codeRef);
      if (!snap.exists()) {
        throw new Error("INVALID_CODE");
      }

      const data = snap.data();
      if (data.active === false) {
        throw new Error("INACTIVE_CODE");
      }
      if (data.role && data.role !== ROLES.KAZKAR) {
        throw new Error("WRONG_ROLE");
      }

      const usedCount = Number(data.usedCount || 0);
      const maxUses = data.maxUses == null ? null : Number(data.maxUses);
      if (maxUses != null && usedCount >= maxUses) {
        throw new Error("EXHAUSTED_CODE");
      }

      tx.update(codeRef, {
        usedCount: usedCount + 1,
        lastUsedBy: uid,
        lastUsedAt: serverTimestamp(),
      });
    });

    return { ok: true, code: normalized };
  } catch (error) {
    const reason = error?.message;
    if (reason === "INVALID_CODE" || reason === "WRONG_ROLE") {
      return { ok: false, error: "Невірний код запрошення" };
    }
    if (reason === "INACTIVE_CODE") {
      return { ok: false, error: "Цей код запрошення вимкнено" };
    }
    if (reason === "EXHAUSTED_CODE") {
      return { ok: false, error: "Код запрошення вже використано максимальну кількість разів" };
    }
    return { ok: false, error: mapAuthError(error) };
  }
}

/**
 * @param {{ name: string, email: string, password: string, birthDate: string, accountType?: "user"|"kazkar", inviteCode?: string }} payload
 */
export async function registerUser({
  name,
  email,
  password,
  birthDate,
  accountType = ROLES.USER,
  inviteCode = "",
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  const wantsKazkar = accountType === ROLES.KAZKAR;

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      normalizedEmail,
      password,
    );
    const { user } = credential;

    await updateProfile(user, { displayName: trimmedName });

    let role = ROLES.USER;
    if (ADMIN_EMAILS.includes(normalizedEmail)) {
      role = ROLES.ADMIN;
    } else if (wantsKazkar) {
      const invite = await consumeKazkarInviteCode(inviteCode, user.uid);
      if (!invite.ok) {
        await user.delete().catch(() => {});
        return { success: false, error: invite.error };
      }
      role = ROLES.KAZKAR;
    }

    const profile = {
      name: trimmedName,
      email: normalizedEmail,
      birthDate,
      role,
      status: USER_STATUS.ACTIVE,
      // сумісність зі старими клієнтами / правилами
      isAdmin: role === ROLES.ADMIN,
      coins: 0,
      xp: 0,
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, "users", user.uid), profile);
    } catch (error) {
      await user.delete().catch(() => {});
      throw error;
    }

    return {
      success: true,
      user: buildUser(user.uid, {
        ...profile,
        createdAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    return { success: false, error: mapAuthError(error) };
  }
}

export async function loginUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      normalizedEmail,
      password,
    );
    let profile = await fetchUserProfile(credential.user.uid);

    if (!profile) {
      profile = await createMissingUserProfile(credential.user);
    }

    if (profile.status === USER_STATUS.BLOCKED) {
      await signOut(auth);
      return {
        success: false,
        error: "Акаунт заблоковано. Зверніться до адміністратора",
      };
    }

    return { success: true, user: profile };
  } catch (error) {
    return { success: false, error: mapAuthError(error) };
  }
}

export async function logoutUser() {
  await signOut(auth);
  localStorage.removeItem("currentUser");
  localStorage.removeItem("isAdmin");
  localStorage.removeItem("userRole");
}

export function setCurrentUser(user) {
  localStorage.setItem("currentUser", JSON.stringify(user));
  localStorage.setItem("isAdmin", user.role === ROLES.ADMIN ? "true" : "false");
  localStorage.setItem("userRole", user.role || ROLES.USER);
}

export function getCurrentUser() {
  const stored = localStorage.getItem("currentUser");
  if (!stored) return null;
  const parsed = JSON.parse(stored);
  return buildUser(parsed.id, parsed);
}

export function getCurrentRole() {
  const user = getCurrentUser();
  if (user?.role) return user.role;
  const stored = localStorage.getItem("userRole");
  if (stored === ROLES.ADMIN || stored === ROLES.KAZKAR || stored === ROLES.USER) {
    return stored;
  }
  if (localStorage.getItem("isAdmin") === "true") return ROLES.ADMIN;
  return ROLES.USER;
}

export function canAccessKazkarPanel(user = getCurrentUser()) {
  if (!user || user.status === USER_STATUS.BLOCKED) return false;
  return user.role === ROLES.KAZKAR || user.role === ROLES.ADMIN;
}

export function canAccessAdminPanel(user = getCurrentUser()) {
  if (!user || user.status === USER_STATUS.BLOCKED) return false;
  return user.role === ROLES.ADMIN;
}

/** Блокування користувача (викликає адмін з UI пізніше) */
export async function setUserBlocked(uid, blocked, reason = "") {
  await updateDoc(doc(db, "users", uid), {
    status: blocked ? USER_STATUS.BLOCKED : USER_STATUS.ACTIVE,
    blockReason: blocked ? reason : "",
    blockedAt: blocked ? serverTimestamp() : null,
  });
}
