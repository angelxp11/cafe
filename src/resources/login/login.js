import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { FaEye, FaEyeSlash, FaCoffee } from 'react-icons/fa';
import { auth } from '../../server/api';
import toast from '../toast/toast';
import LoadingScreen from '../loading/LoadingScreen';

function Login({ onRegister }) {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event) {
		event.preventDefault();
		if (!email.trim() || !password) {
			toast.warning('Completa tu correo y contraseña.');
			return;
		}

		setLoading(true);
		try {
			await signInWithEmailAndPassword(auth, email.trim(), password);
			toast.success('Sesión iniciada correctamente.');
		} catch (error) {
			setLoading(false);
			toast.error(getAuthMessage(error));
		}
	}

	if (loading) return <LoadingScreen text="Iniciando sesión" />;

	return (
		<main className="auth-page">
			<section className="auth-card" aria-labelledby="login-title">
				<div className="auth-brand"><FaCoffee aria-hidden="true" /><span>Café</span></div>
				<p className="auth-eyebrow">Bienvenido de nuevo</p>
				<h1 id="login-title">Inicia sesión</h1>
				<p className="auth-description">Accede a la gestión de tu cafetería.</p>
				<form className="auth-form" onSubmit={handleSubmit}>
					<label htmlFor="login-email">Correo electrónico</label>
					<input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
					<label htmlFor="login-password">Contraseña</label>
					<div className="auth-password-field">
						<input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
						<button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword((visible) => !visible)}>
							{showPassword ? <FaEyeSlash /> : <FaEye />}
						</button>
					</div>
					<button className="auth-submit" type="submit">Iniciar sesión</button>
				</form>
				<p className="auth-switch">¿Aún no tienes cuenta? <button type="button" onClick={onRegister}>Regístrate</button></p>
			</section>
		</main>
	);
}

function getAuthMessage(error) {
	if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') return 'El correo o la contraseña no son correctos.';
	if (error.code === 'auth/invalid-email') return 'Escribe un correo electrónico válido.';
	return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

export default Login;