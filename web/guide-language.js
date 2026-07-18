const LANGUAGE_STORAGE_KEY = "taskbridge.web.v1.language";
const LEGACY_LANGUAGE_STORAGE_KEY = "taskbridge-language";
const languageSelect = document.querySelector("[data-guide-language-select]");
const languagePage = document.querySelector("[data-guide-language-page]");

function normalizeLanguage(language) {
  return language === "en-US" ? "en-US" : "zh-CN";
}

function setGuideLanguage(language) {
  const normalized = normalizeLanguage(language);
  document.body.dataset.language = normalized;
  languagePage.dataset.language = normalized;
  document.documentElement.lang = normalized;
  languageSelect.value = normalized;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  localStorage.removeItem(LEGACY_LANGUAGE_STORAGE_KEY);
}

if (languageSelect && languagePage) {
  languageSelect.addEventListener("change", (event) => {
    setGuideLanguage(event.target.value);
  });
  setGuideLanguage(
    localStorage.getItem(LANGUAGE_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY) ||
      (navigator.language?.startsWith("en") ? "en-US" : "zh-CN"),
  );
}
