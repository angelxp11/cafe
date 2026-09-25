import "./homepage.css";

function Homepage({ profile }) {
	const fullName = [profile?.nombre, profile?.apellido].filter(Boolean).join(' ');

	return (
		<>
			<header className="app-content-header">
				<p className="app-eyebrow">Panel principal</p>
				<h1>Inicio</h1>
				<p className="app-intro">Gestiona tu cafetería desde un solo lugar.</p>
			</header>
			<section className="app-welcome" aria-labelledby="welcome-title">
				<span className="app-welcome-mark" aria-hidden="true" />
				<div>
					<p className="app-eyebrow">Bienvenido</p>
					<h2 id="welcome-title">Bienvenido, {fullName || 'a tu café'}</h2>
				</div>
			</section>
		</>
	);
}

export default Homepage;
