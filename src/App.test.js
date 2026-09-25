import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

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
