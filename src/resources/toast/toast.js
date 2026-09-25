/**
 * toast.js — Sistema de notificaciones tipo toast
 * Tipos: success (verde), error (rojo), warning (ámbar / "precaución")
 *
 * Uso:
 *   import toast from './toast.js';
 *   toast.success('Guardado correctamente');
 *   toast.error('No se pudo conectar con el servidor');
 *   toast.warning('Revisa los campos antes de continuar');
 *   // o genérico:
 *   toast.show('Mensaje cualquiera', 'warning');
 */

const DEFAULT_DURATION = 4000; // ms

const ICONS = {
	success:
		'<svg viewBox="0 0 24 24" class="toast-icon" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
	error:
		'<svg viewBox="0 0 24 24" class="toast-icon" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2Zm0-4h-2V7h2Z"/></svg>',
	warning:
		'<svg viewBox="0 0 24 24" class="toast-icon" aria-hidden="true"><path d="M12 3 1 21h22Zm1 15h-2v-2h2Zm0-4h-2V9h2Z"/></svg>',
};

const ARIA_ROLE = {
	success: 'status',
	warning: 'status',
	error: 'alert',
};

let container = null;

function getContainer() {
	if (container && document.body.contains(container)) {
		return container;
	}
	container = document.createElement('div');
	container.className = 'toast-container';
	container.setAttribute('aria-live', 'polite');
	document.body.appendChild(container);
	return container;
}

function removeToast(toastEl) {
	if (!toastEl || toastEl.dataset.leaving === 'true') return;
	toastEl.dataset.leaving = 'true';
	toastEl.classList.remove('toast-enter');
	toastEl.classList.add('toast-leave');
	toastEl.addEventListener(
		'animationend',
		() => {
			toastEl.remove();
		},
		{ once: true }
	);
}

/**
 * Muestra un toast.
 * @param {string} message - Texto a mostrar.
 * @param {'success'|'error'|'warning'} [type='success'] - Tipo/color del toast.
 * @param {{ duration?: number }} [options]
 * @returns {() => void} función para cerrar el toast manualmente.
 */
function showToast(message, type = 'success', options = {}) {
	const duration = options.duration ?? DEFAULT_DURATION;
	const toastEl = document.createElement('div');
	toastEl.className = `toast toast-${type} toast-enter`;
	toastEl.setAttribute('role', ARIA_ROLE[type] ?? 'status');

	toastEl.innerHTML = `
		${ICONS[type] ?? ICONS.success}
		<p class="toast-message"></p>
		<button type="button" class="toast-close" aria-label="Cerrar notificación">&times;</button>
		<span class="toast-progress" style="animation-duration:${duration}ms"></span>
	`;
	toastEl.querySelector('.toast-message').textContent = message;

	let timeoutId;

	function startTimer() {
		timeoutId = window.setTimeout(() => removeToast(toastEl), duration);
	}

	function pauseTimer() {
		window.clearTimeout(timeoutId);
		toastEl.querySelector('.toast-progress').style.animationPlayState = 'paused';
	}

	function resumeTimer() {
		startTimer();
		toastEl.querySelector('.toast-progress').style.animationPlayState = 'running';
	}

	toastEl.addEventListener('mouseenter', pauseTimer);
	toastEl.addEventListener('mouseleave', resumeTimer);
	toastEl.querySelector('.toast-close').addEventListener('click', () => removeToast(toastEl));

	getContainer().appendChild(toastEl);
	startTimer();

	return () => removeToast(toastEl);
}

const toast = {
	show: showToast,
	success: (message, options) => showToast(message, 'success', options),
	error: (message, options) => showToast(message, 'error', options),
	warning: (message, options) => showToast(message, 'warning', options),
};

export default toast;