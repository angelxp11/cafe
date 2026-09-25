import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import Navbar from './resources/navbar/navbar';
import Login from './resources/login/login';
import Register from './resources/register/register';
import { auth, db } from './server/api';
import LoadingScreen from './resources/loading/LoadingScreen';
import Desactivado from './resources/desactivado';
import Homepage from './components/homepage/homepage';
import Inventario from './components/inventario/inventario';
import Empleados from './components/empleados/empleados';
import Turno from './components/turno/turno';
import Mesas from './components/mesas/mesas';
import MetodosPago from './components/metodosdepagos/metodospago';
import Facturas from './components/facturas/facturas';
import Clientes from './components/mesas/clientes/clientes';

function App() {
	const [user, setUser] = useState(null);
	const [userProfile, setUserProfile] = useState(null);
	const [authLoading, setAuthLoading] = useState(true);
	const [accountActive, setAccountActive] = useState(true);
	const [authMode, setAuthMode] = useState('login');
	const [activeSection, setActiveSection] = useState('Inicio');

	useEffect(() => {
		let unsubscribeProfile = () => {};
		const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
			unsubscribeProfile();
			setUser(currentUser);
			if (!currentUser) {
				setUserProfile(null);
				setAccountActive(true);
				setAuthLoading(false);
				return;
			}

			setAuthLoading(true);
			const email = currentUser.email?.trim().toLowerCase();
			if (!email) {
				setAccountActive(false);
				setAuthLoading(false);
				return;
			}

			unsubscribeProfile = onSnapshot(doc(db, 'usuarios', email), (profile) => {
				const profileData = profile.exists() ? profile.data() : null;
				setUserProfile(profileData);
				setAccountActive(profileData ? profileData.activo !== false : true);
				setAuthLoading(false);
			}, () => {
				setUserProfile(null);
				setAccountActive(false);
				setAuthLoading(false);
			});
		});
		return () => {
			unsubscribeProfile();
			unsubscribeAuth();
		};
	}, []);

	function renderSection() {
		if (activeSection === 'Inventario') return <Inventario profile={userProfile} />;
		if (activeSection === 'Empleados') return <Empleados profile={userProfile} />;
		if (activeSection === 'Turno') return <Turno profile={userProfile} />;
		if (activeSection === 'Mesas') return <Mesas profile={userProfile} />;
		if (activeSection === 'Clientes') return <Clientes profile={userProfile} />;
		if (activeSection === 'Facturas') return <Facturas profile={userProfile} />;
		if (activeSection === 'Métodos de pago' && userProfile?.rol === 'admin') return <MetodosPago profile={userProfile} />;
		return <Homepage profile={userProfile} />;
	}

	if (authLoading) return <LoadingScreen text="Comprobando tu sesión" />;

	if (!user) {
		return authMode === 'login' ? (
			<Login onRegister={() => setAuthMode('register')} />
		) : (
			<Register onLogin={() => setAuthMode('login')} />
		);
	}

	if (!accountActive) return <Desactivado />;

	return (
    <div className="app-shell">
	<Navbar profile={userProfile} activeSection={activeSection} onSelect={setActiveSection} />
      <main className="app-content">{renderSection()}</main>
    </div>
  );
}

export default App;
