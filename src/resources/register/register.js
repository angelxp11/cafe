import { useState } from 'react';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { FaEye, FaEyeSlash, FaCoffee } from 'react-icons/fa';
import { auth, db } from '../../server/api';
import toast from '../toast/toast';
import LoadingScreen from '../loading/LoadingScreen';

function Register({ onLogin }) {
	const [email, setEmail] = useState('');
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const strength = getPasswordStrength(password);

	async function handleSubmit(event) {
		event.preventDefault();
		if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
			toast.warning('Completa nombre, apellido, correo y contraseña.');
			return;
		}
		if (password !== confirmPassword) {
			toast.warning('Las contraseñas no coinciden.');
			return;
		}
		if (!isValidPassword(password)) {
			toast.warning('La contraseña debe tener más de 6 caracteres, letras y números.');
			return;
		}

		setLoading(true);
		try {
			const normalizedEmail = email.trim().toLowerCase();
			const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
			try {
				await setDoc(doc(db, 'usuarios', normalizedEmail), {
					nombre: firstName.trim().toLocaleUpperCase('es-ES'),
					apellido: lastName.trim().toLocaleUpperCase('es-ES'),
					correo: normalizedEmail,
					rol: 'empleado',
					activo: false,
				});
			} catch (error) {
				try {
					await deleteUser(credential.user);
				} catch (deleteError) {
					toast.error('No se pudo guardar el perfil ni eliminar la cuenta incompleta. Contacta al administrador.');
				}
				throw error;
			}
			toast.success('Cuenta creada correctamente.');
		} catch (error) {
			setLoading(false);
			toast.error(getRegisterMessage(error));
		}
	}

	if (loading) return <LoadingScreen text="Creando tu cuenta" />;

	return (
		<main className="auth-page">
			<section className="auth-card" aria-labelledby="register-title">
				<div className="auth-brand"><FaCoffee aria-hidden="true" /><span>Café</span></div>
				<p className="auth-eyebrow">Comienza tu jornada</p>
				<h1 id="register-title">Crea tu cuenta</h1>
				<p className="auth-description">Regístrate para administrar tu cafetería.</p>
				<form className="auth-form" onSubmit={handleSubmit}>
					<label htmlFor="register-first-name">Nombre</label>
					<input id="register-first-name" type="text" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
					<label htmlFor="register-last-name">Apellido</label>
					<input id="register-last-name" type="text" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
					<label htmlFor="register-email">Correo electrónico</label>
					<input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value.toLowerCase())} />
					<label htmlFor="register-password">Contraseña</label>
					<div className="auth-password-field">
						<input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
						<button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword((visible) => !visible)}>
							{showPassword ? <FaEyeSlash /> : <FaEye />}
						</button>
					</div>
					<label htmlFor="register-confirm-password">Confirmar contraseña</label>
					<div className="auth-password-field">
						<input id="register-confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
						<button type="button" aria-label={showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'} onClick={() => setShowConfirmPassword((visible) => !visible)}>
							{showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
						</button>
					</div>
					<div className="password-meter" aria-live="polite">
						<div className="password-meter-track"><span className={`password-meter-fill password-${strength.level}`} /></div>
						<span>{strength.label}</span>
					</div>
					<button className="auth-submit" type="submit">Registrarme</button>
				</form>
				<p className="auth-switch">¿Ya tienes cuenta? <button type="button" onClick={onLogin}>Inicia sesión</button></p>
			</section>
		</main>
	);
}

function isValidPassword(password) {
	return password.length > 6 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function getPasswordStrength(password) {
	if (!password) return { level: 'empty', label: 'Escribe una contraseña' };
	if (!isValidPassword(password)) return { level: 'weak', label: 'Débil: usa letras y números' };
	if (password.length >= 10 && /[^A-Za-z0-9]/.test(password)) return { level: 'strong', label: 'Fuerte' };
	return { level: 'medium', label: 'Aceptable' };
}

function getRegisterMessage(error) {
	if (error.code === 'auth/email-already-in-use') return 'Ese correo ya tiene una cuenta.';
	if (error.code === 'auth/invalid-email') return 'Escribe un correo electrónico válido.';
	if (error.code === 'auth/operation-not-allowed') return 'El registro por correo y contraseña no está habilitado en Firebase.';
	if (error.code === 'auth/weak-password') return 'La contraseña no cumple con los requisitos de Firebase.';
	if (error.code === 'auth/network-request-failed') return 'No se pudo conectar con Firebase. Revisa tu conexión e inténtalo de nuevo.';
	if (error.code === 'permission-denied') return 'Firebase no permitió guardar el perfil del usuario. Revisa las reglas de Firestore.';
	return 'No se pudo crear la cuenta. Inténtalo de nuevo.';
}

export default Register;