/**
 * ===========================================
 * Pantalla de servicio vencido - Temática Cafetería
 * ===========================================
 * Uso básico:
 *   1. Incluir expired.css en el <head>
 *   2. Incluir expired.js antes de </body>
 *   3. Llamar a ExpiredScreen.init({ ... })
 *
 * API:
 *   ExpiredScreen.init(opciones)  -> crea y muestra la pantalla
 *   ExpiredScreen.show()          -> la muestra
 *   ExpiredScreen.hide()          -> la oculta (con fade)
 *   ExpiredScreen.destroy()       -> la elimina del DOM
 *
 * Opciones:
 *   title, message, contactLabel, showBeans, beanCount,
 *   qrImage, monthlyAmount, breBKey
 *
 * Ejemplos de contactUrl:
 *   "https://wa.me/573001234567?text=Hola,%20adjunto%20mi%20comprobante"
 *   "mailto:dev@correo.com?subject=Comprobante%20de%20pago"
 */

export function isServiceExpired(expirationTimestamp, currentDate = new Date()) {
  const expirationDate = expirationTimestamp instanceof Date
    ? expirationTimestamp
    : expirationTimestamp?.toDate?.();

  return expirationDate instanceof Date
    && Number.isFinite(expirationDate.getTime())
    && expirationDate.getTime() <= currentDate.getTime();
}

const ExpiredScreen = (function () {
  let container = null;

  const defaultOptions = {
    title: "Tu mes de servicio ha vencido",
    message:
      "Para seguir usando el sitio, por favor <strong>comunícate con el desarrollador</strong> " +
      "y envíale el <strong>comprobante de pago</strong> para reactivar el servicio.",
    contactLabel: "Ver opciones de pago",
    showBeans: true,
    beanCount: 8,
    qrImage: "",
    monthlyAmount: "$60.000 COP",
    breBKey: "@bbva3054715845",
  };

  function createBeans(count) {
    let html = "";
    for (let i = 0; i < count; i++) {
      const left = Math.random() * 100;
      const duration = 8 + Math.random() * 8;
      const delay = Math.random() * 10;
      const size = 0.7 + Math.random() * 0.6;
      html += `<div class="expired-bean" style="left:${left}%; animation-duration:${duration}s; animation-delay:-${delay}s; scale:${size};"></div>`;
    }
    return html;
  }

  function buildMarkup(o) {
    const beans = o.showBeans ? createBeans(o.beanCount) : "";
    const qrImage = o.qrImage
      ? `<img class="expired-payment-qr" src="${o.qrImage}" alt="Código QR para realizar el pago">`
      : "";
    return `
      ${beans}
      <div class="expired-cup-container" aria-hidden="true">
        <div class="expired-steam expired-steam-1"></div>
        <div class="expired-steam expired-steam-2"></div>
        <div class="expired-steam expired-steam-3"></div>
        <span class="expired-zzz">z</span>
        <span class="expired-zzz">z</span>
        <span class="expired-zzz">Z</span>
        <div class="expired-saucer"></div>
        <div class="expired-cup"><div class="expired-liquid"></div></div>
        <div class="expired-handle"></div>
        <div class="expired-badge">!</div>
      </div>
      <div class="expired-card">
        <h1 class="expired-title">${o.title}</h1>
        <p class="expired-message">${o.message}</p>
        <button class="expired-btn expired-contact-trigger" type="button" data-action="open-payments" aria-expanded="false">${o.contactLabel}</button>
      </div>
      <section class="expired-payment-options" data-payment-options hidden role="dialog" aria-modal="true" aria-labelledby="expired-payment-title">
        <div class="expired-payment-dialog">
          <div class="expired-payment-heading">
            <h2 id="expired-payment-title">Elige cómo pagar</h2>
            <button class="expired-payment-close" type="button" data-action="close-payments">Cerrar</button>
          </div>
          <div class="expired-payment-switch" role="group" aria-label="Método de pago">
            <button type="button" data-method="qr" aria-pressed="true">QR</button>
            <button type="button" data-method="breb" aria-pressed="false">Llave Bre-B</button>
          </div>
          <div class="expired-payment-panel" data-payment-panel="qr">
            <p>Escanea este código con la app de tu banco para realizar el pago.</p>
            <strong class="expired-payment-amount">${o.monthlyAmount}</strong>
            ${qrImage}
          </div>
          <div class="expired-payment-panel" data-payment-panel="breb" hidden>
            <p>En la app de tu banco, selecciona Bre-B y envía el pago a esta llave.</p>
            <strong class="expired-payment-amount">${o.monthlyAmount}</strong>
            <div class="expired-payment-key">
              <span>Llave Bre-B</span>
              <strong>${o.breBKey}</strong>
            </div>
            <button class="expired-copy-button" type="button" data-action="copy-key">Copiar llave</button>
            <p class="expired-copy-status" data-copy-status aria-live="polite"></p>
          </div>
        </div>
      </section>
    `;
  }

  function copyTextFallback(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("No se pudo copiar la llave.");
  }

  function bindPaymentControls() {
    const openButton = container.querySelector('[data-action="open-payments"]');
    const closeButton = container.querySelector('[data-action="close-payments"]');
    const paymentOptions = container.querySelector("[data-payment-options]");
    const methodButtons = container.querySelectorAll("[data-method]");
    const panels = container.querySelectorAll("[data-payment-panel]");
    const copyButton = container.querySelector('[data-action="copy-key"]');
    const copyStatus = container.querySelector("[data-copy-status]");
    const card = container.querySelector(".expired-card");
    const cup = container.querySelector(".expired-cup-container");
    const key = container.querySelector(".expired-payment-key strong").textContent;

    function closePaymentModal() {
      paymentOptions.hidden = true;
      card.inert = false;
      cup.inert = false;
      openButton.setAttribute("aria-expanded", "false");
      openButton.focus();
    }

    openButton.addEventListener("click", () => {
      paymentOptions.hidden = false;
      card.inert = true;
      cup.inert = true;
      openButton.setAttribute("aria-expanded", "true");
      closeButton.focus();
    });

    closeButton.addEventListener("click", closePaymentModal);

    paymentOptions.addEventListener("click", (event) => {
      if (event.target === paymentOptions) closePaymentModal();
    });

    paymentOptions.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePaymentModal();
        return;
      }

      if (event.key !== "Tab") return;
      const focusableButtons = Array.from(paymentOptions.querySelectorAll("button:not([disabled])"))
        .filter((button) => !button.closest("[hidden]"));
      const firstButton = focusableButtons[0];
      const lastButton = focusableButtons[focusableButtons.length - 1];

      if (event.shiftKey && document.activeElement === firstButton) {
        event.preventDefault();
        lastButton.focus();
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault();
        firstButton.focus();
      }
    });

    methodButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const selectedMethod = button.dataset.method;
        methodButtons.forEach((methodButton) => {
          methodButton.setAttribute("aria-pressed", String(methodButton === button));
        });
        panels.forEach((panel) => {
          panel.hidden = panel.dataset.paymentPanel !== selectedMethod;
        });
      });
    });

    copyButton.addEventListener("click", async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(key);
        } else {
          copyTextFallback(key);
        }
        copyStatus.textContent = "¡Llave copiada con éxito!";
      } catch {
        try {
          copyTextFallback(key);
          copyStatus.textContent = "¡Llave copiada con éxito!";
        } catch {
          copyStatus.textContent = "No se pudo copiar. Selecciona la llave manualmente.";
        }
      }
    });
  }

  function init(userOptions = {}) {
    const options = { ...defaultOptions, ...userOptions };

    if (container) container.remove();

    container = document.createElement("div");
    container.className = "expired-screen";
    container.id = "expired-screen";
    container.setAttribute("role", "alert");
    container.innerHTML = buildMarkup(options);
    bindPaymentControls();

    document.body.appendChild(container);
    return container;
  }

  function show() {
    if (!container) return init();
    container.classList.remove("hidden");
  }

  function hide() {
    if (container) container.classList.add("hidden");
  }

  function destroy() {
    if (container) {
      container.remove();
      container = null;
    }
  }

  return { init, show, hide, destroy };
})();

export default ExpiredScreen;