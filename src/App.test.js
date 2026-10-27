import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { buildReport } from './components/reportes/reportes';
import ExpiredScreen, { isServiceExpired } from './resources/ads/expired';
import { amountBeforeCommission, amountCoveredByPayment, amountWithCommission, formatThousandsInput, paymentCommission } from './server/paymentMethods';

test('formats balance values with thousands separators while preserving digits', () => {
   expect(formatThousandsInput('1234567')).toBe('1.234.567');
   expect(formatThousandsInput('1.234.567')).toBe('1.234.567');
   expect(formatThousandsInput('00012')).toBe('12');
   expect(formatThousandsInput('')).toBe('');
});

test('calculates payment commissions and finds the covered base for cash received', () => {
  expect(paymentCommission(10000, 2.5)).toBe(250);
  expect(amountWithCommission(10000, 2.5)).toBe(10250);
  expect(amountWithCommission(amountBeforeCommission(10250, 2.5), 2.5)).toBeLessThanOrEqual(10250);
  expect(amountWithCommission(amountBeforeCommission(10250, 2.5) + 1, 2.5)).toBeGreaterThan(10250);
  expect(amountCoveredByPayment(10250, 10000, 2.5)).toBe(10000);
  expect(amountWithCommission(10000, 0)).toBe(10000);
});

test('rounds the final charge to the nearest ten pesos, with five rounded up', () => {
  expect(amountWithCommission(2000, 0.6)).toBe(2010);
  expect(amountWithCommission(2000, 0.75)).toBe(2020);
  expect(amountWithCommission(2000, 0.85)).toBe(2020);
  expect(paymentCommission(2000, 0.6)).toBe(10);
  expect(paymentCommission(2000, 0.75)).toBe(20);
  expect(amountCoveredByPayment(2010, 2000, 0.6)).toBe(2000);
});

test('groups monthly expenses by uppercase category and keeps legacy uncategorized expenses', () => {
  const report = buildReport('egresos', [
    { tipo: 'egreso', categoria: 'INSUMOS', monto: 12000, creadoEn: new Date('2026-03-10T12:00:00') },
    { tipo: 'egreso', categoria: 'INSUMOS', monto: 8000, creadoEn: new Date('2026-03-15T12:00:00') },
    { tipo: 'egreso', categoria: 'SERVICIOS', monto: 5000, creadoEn: new Date('2026-03-20T12:00:00') },
    { tipo: 'egreso', monto: 3000, creadoEn: new Date('2026-03-22T12:00:00') },
  ], '2026-03-01', '2026-03-31');

  expect(report.rows).toEqual([
    { month: '2026-03', category: 'INSUMOS', count: 2, amount: 20000 },
    { month: '2026-03', category: 'SERVICIOS', count: 1, amount: 5000 },
    { month: '2026-03', category: 'SIN CATEGORÍA', count: 1, amount: 3000 },
  ]);
  expect(report.totalCount).toBe(4);
  expect(report.totalAmount).toBe(28000);
});

test('expires the service at or after the Firestore timestamp', () => {
  const expirationDate = new Date('2026-09-27T14:30:00.000Z');
  const expirationTimestamp = { toDate: () => expirationDate };

  expect(isServiceExpired(expirationTimestamp, new Date('2026-09-27T14:29:59.999Z'))).toBe(false);
  expect(isServiceExpired(expirationTimestamp, new Date('2026-09-27T14:30:00.000Z'))).toBe(true);
  expect(isServiceExpired(expirationTimestamp, new Date('2026-09-27T14:30:00.001Z'))).toBe(true);
  expect(isServiceExpired(null, new Date('2026-09-27T14:30:00.001Z'))).toBe(false);
});

test('shows the QR and Bre-B payment options and confirms copying the key', async () => {
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  const expiredScreen = ExpiredScreen.init({ qrImage: '/qr.png', showBeans: false });

  try {
    const openButton = expiredScreen.querySelector('[data-action="open-payments"]');
    fireEvent.click(openButton);
    const paymentDialog = expiredScreen.querySelector('[data-payment-options]');
    expect(paymentDialog).toHaveAttribute('role', 'dialog');
    expect(paymentDialog).not.toHaveAttribute('hidden');
    expect(openButton).not.toHaveAttribute('hidden');
    expect(expiredScreen.querySelector('.expired-payment-qr')).toHaveAttribute('src', '/qr.png');
    expect(expiredScreen.querySelector('[data-payment-panel="qr"]')).not.toHaveAttribute('hidden');

    fireEvent.click(expiredScreen.querySelector('[data-method="breb"]'));
    expect(expiredScreen.querySelector('.expired-payment-key strong')).toHaveTextContent('@bbva3054715845');
    expect(expiredScreen.querySelector('[data-payment-panel="breb"]')).not.toHaveAttribute('hidden');

    fireEvent.click(expiredScreen.querySelector('[data-action="copy-key"]'));
    expect(await screen.findByText('¡Llave copiada con éxito!')).toBeInTheDocument();
    expect(clipboard.writeText).toHaveBeenCalledWith('@bbva3054715845');

    fireEvent.keyDown(paymentDialog, { key: 'Escape' });
    expect(paymentDialog).toHaveAttribute('hidden');
    expect(openButton).toHaveFocus();
  } finally {
    ExpiredScreen.destroy();
    if (previousClipboard) {
      Object.defineProperty(navigator, 'clipboard', previousClipboard);
    } else {
      delete navigator.clipboard;
    }
  }
});

test('shows the login screen when there is no session', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
  expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
  expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
});

test('toggles between login and register screens', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Inicia sesión' });
  fireEvent.click(screen.getByRole('button', { name: 'Regístrate' }));
  expect(await screen.findByRole('heading', { name: 'Crea tu cuenta' })).toBeInTheDocument();
  expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Inicia sesión' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument());
});

test('toggles password visibility on the register form', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Inicia sesión' });
  fireEvent.click(screen.getByRole('button', { name: 'Regístrate' }));
  await screen.findByRole('heading', { name: 'Crea tu cuenta' });
  expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  expect(screen.getByLabelText('Apellido')).toBeInTheDocument();
  const password = screen.getByLabelText('Contraseña');
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
  expect(password).toHaveAttribute('type', 'text');
});
