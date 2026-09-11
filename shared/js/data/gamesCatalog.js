/**
 * Каталог Unity-ігор фортеці.
 * buildFolder — ім'я папки в builds/ (зберігається в квесті).
 * Мапінг гра ↔ башта з Kamianets_Deer/src/config/games.ts.
 */

export const GAMES = [
  {
    id: "game-1",
    title: "Знайти серед каміння",
    towerName: "Папська",
    buildFolder: "game-1",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Папська вежа",
      lat: 48.67288,
      lng: 26.56363,
      radius: 60,
    },
  },
  {
    id: "game-2",
    title: "Ім'я героя",
    towerName: "Папська",
    buildFolder: "game-2",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Папська вежа",
      lat: 48.67288,
      lng: 26.56363,
      radius: 60,
    },
  },
  {
    id: "game-4",
    title: "Лабіринт Тіней",
    towerName: "Рожанка",
    buildFolder: "game-4",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Вежа Рожанка",
      lat: 48.67372,
      lng: 26.56305,
      radius: 60,
    },
  },
  {
    id: "game-8",
    title: "Секретний Кодекс",
    towerName: "Лянцкоронська",
    buildFolder: "game-8",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Лянцкоронська вежа",
      lat: 48.67365,
      lng: 26.56415,
      radius: 60,
    },
  },
  {
    id: "game-7",
    title: "Вогняні Ілюзії",
    towerName: "Тенчинська",
    buildFolder: "game-7",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Тенчинська вежа",
      lat: 48.67292,
      lng: 26.56432,
      radius: 60,
    },
  },
  {
    id: "game-3",
    title: "Живий камінь",
    towerName: "Ковпак",
    buildFolder: "game-3",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Вежа Ковпак",
      lat: 48.6728,
      lng: 26.564,
      radius: 60,
    },
  },
  {
    id: "game-10",
    title: "Секретний Водопровід",
    towerName: "Водяна",
    buildFolder: "game-10",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Водяна вежа",
      lat: 48.6742,
      lng: 26.5637,
      radius: 70,
    },
  },
  {
    id: "game-9",
    title: "Драконяче Горнило",
    towerName: "Комендантська",
    buildFolder: "game-9",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Комендантська вежа",
      lat: 48.67368,
      lng: 26.56355,
      radius: 60,
    },
  },
  {
    id: "game-5",
    title: "Фінальний Іспит Драко",
    towerName: "Нова Східна (Чорна)",
    buildFolder: "game-5",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Нова Східна вежа",
      lat: 48.67345,
      lng: 26.56455,
      radius: 60,
    },
  },
  {
    id: "game-6",
    title: "Податок для Дракона",
    towerName: "Ласька (Біла)",
    buildFolder: "game-6",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Ласька вежа",
      lat: 48.67295,
      lng: 26.563,
      radius: 60,
    },
  },
  {
    id: "game-11",
    title: "Сонячний Кристал",
    towerName: "Денна",
    buildFolder: "game-11",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Денна вежа",
      lat: 48.67355,
      lng: 26.5617,
      radius: 70,
    },
  },
  {
    id: "game-12",
    title: "Непробивний Бастіон",
    towerName: "Нова Західна",
    buildFolder: "game-12",
    geo: {
      city: "Кам'янець-Подільський",
      placeName: "Нова Західна вежа",
      lat: 48.67345,
      lng: 26.56115,
      radius: 70,
    },
  },
];

export function getGameByBuildFolder(buildFolder) {
  if (!buildFolder) return undefined;
  return GAMES.find((game) => game.buildFolder === buildFolder || game.id === buildFolder);
}

/** Підпис для казкаря: «Податок для Дракона — башта Ласька (Біла)» */
export function formatGameLabel(game) {
  if (!game) return "";
  return `${game.title} — башта ${game.towerName}`;
}

export function getGameLabel(buildFolder) {
  const game = getGameByBuildFolder(buildFolder);
  return game ? formatGameLabel(game) : buildFolder || "";
}
