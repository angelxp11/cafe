function LoadingScreen({ text = 'Preparando tu café' }) {
	return (
		<main className="loading-screen" role="status" aria-live="polite">
			<div className="cup-container" aria-hidden="true">
				<div className="steam steam-1" />
				<div className="steam steam-2" />
				<div className="steam steam-3" />
				<div className="cup-saucer" />
				<div className="cup"><div className="coffee-liquid" /></div>
				<div className="cup-handle" />
			</div>
			<div className="loading-text">{text}<span className="dots" aria-hidden="true" /></div>
			<div className="loading-subtext">Un momento, por favor</div>
		</main>
	);
}

export default LoadingScreen;