/**
 * ===========================================
 * Loading Screen - Temática Cafetería
 * ===========================================
 * Uso básico:
 *   1. Incluir loading.css en el <head>
 *   2. Incluir loading.js antes de </body>
 *   3. Llamar a CoffeeLoader.init() al cargar la página
 *
 * API:
 *   CoffeeLoader.init(opciones)   -> crea y muestra la pantalla
 *   CoffeeLoader.show()           -> muestra la pantalla
 *   CoffeeLoader.hide()           -> oculta la pantalla (con fade)
 *   CoffeeLoader.setProgress(n)   -> actualiza barra de progreso (0-100)
 *   CoffeeLoader.setText(msg)     -> cambia el texto principal
 */

const CoffeeLoader = (function () {
  let container = null;
  let progressFill = null;
  let textEl = null;

  const defaultOptions = {
    text: "Preparando tu café",
    subtext: "Un momento, por favor",
    showProgressBar: true,
    showBeans: true,
    beanCount: 8,
    autoHideAfter: null, // ms, opcional: ocultar automáticamente
  };

  function createBeans(count) {
    let html = "";
    for (let i = 0; i < count; i++) {
      const left = Math.random() * 100;
      const duration = 8 + Math.random() * 8;
      const delay = Math.random() * 10;
      const size = 0.7 + Math.random() * 0.6;
      html += `<div class="bean" style="left:${left}%; animation-duration:${duration}s; animation-delay:-${delay}s; transform: scale(${size});"></div>`;
    }
    return html;
  }

  function buildMarkup(options) {
    const beansHtml = options.showBeans ? createBeans(options.beanCount) : "";
    const progressHtml = options.showProgressBar
      ? `<div class="progress-bar-container">
           <div class="progress-bar-fill" id="coffee-progress-fill"></div>
         </div>`
      : "";

    return `
      ${beansHtml}
      <div class="cup-container">
        <div class="steam steam-1"></div>
        <div class="steam steam-2"></div>
        <div class="steam steam-3"></div>
        <div class="cup-saucer"></div>
        <div class="cup">
          <div class="coffee-liquid"></div>
        </div>
        <div class="cup-handle"></div>
      </div>
      <div class="loading-text" id="coffee-loading-text">${options.text}</div>
      <div class="loading-subtext">${options.subtext}</div>
      ${progressHtml}
    `;
  }

  function init(userOptions = {}) {
    const options = { ...defaultOptions, ...userOptions };

    // Evita duplicados si ya existe
    if (container) {
      container.remove();
    }

    container = document.createElement("div");
    container.className = "loading-screen";
    container.id = "coffee-loading-screen";
    container.innerHTML = buildMarkup(options);

    document.body.appendChild(container);

    progressFill = container.querySelector("#coffee-progress-fill");
    textEl = container.querySelector("#coffee-loading-text");

    if (options.autoHideAfter) {
      setTimeout(hide, options.autoHideAfter);
    }

    return container;
  }

  function show() {
    if (!container) {
      init();
      return;
    }
    container.classList.remove("hidden");
  }

  function hide() {
    if (!container) return;
    container.classList.add("hidden");
  }

  function setProgress(percent) {
    if (!progressFill) return;
    const clamped = Math.max(0, Math.min(100, percent));
    progressFill.style.width = `${clamped}%`;
  }

  function setText(message) {
    if (!textEl) return;
    textEl.textContent = message;
  }

  function destroy() {
    if (container) {
      container.remove();
      container = null;
      progressFill = null;
      textEl = null;
    }
  }

  return { init, show, hide, setProgress, setText, destroy };
})();

// Si se usa en un entorno con módulos (opcional)
if (typeof module !== "undefined" && module.exports) {
  module.exports = CoffeeLoader;
}