function SpilledCoffeeIllustration() {
	return (
		<svg
			className="csp-illustration"
			viewBox="0 0 260 180"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			{/* Charco: una sola forma orgánica, no varias elipses sueltas */}
			<path
				className="csp-puddle"
				d="M96 148
				   C 80 140, 62 142, 55 152
				   C 48 160, 58 168, 78 170
				   C 110 176, 160 176, 195 170
				   C 218 166, 232 158, 228 150
				   C 224 142, 205 140, 188 144
				   C 178 132, 150 128, 130 134
				   C 112 128, 100 134, 96 148 Z"
			/>

			{/* Gotitas de salpicadura, pegadas al borde del charco */}
			<ellipse className="csp-drop csp-drop-1" cx="46" cy="156" rx="5" ry="3" />
			<ellipse className="csp-drop csp-drop-2" cx="236" cy="152" rx="4" ry="2.6" />

			{/* Chorrito que sale de la boca de la taza hacia el charco */}
			<path
				className="csp-stream"
				d="M118 118 C 112 126, 108 132, 108 138 C 108 142, 114 143, 116 139 C 119 133, 122 124, 122 118 Z"
			/>

			{/* Taza volcada */}
			<g className="csp-cup">
				<path
					className="csp-cup-handle"
					d="M148 96 C 160 92, 170 98, 168 108 C 166 116, 155 118, 146 114"
					fill="none"
				/>
				{/* Cuerpo: extremo cerrado redondeado a la derecha, boca abierta a la izquierda */}
				<path
					className="csp-cup-body"
					d="M170 92
					   H 128
					   A 15 15 0 0 0 128 122
					   H 170
					   A 15 16 0 0 0 170 92 Z"
				/>
				{/* Boca (elipse vista de canto), pegada exactamente al borde izquierdo del cuerpo */}
				<ellipse className="csp-cup-rim" cx="128" cy="107" rx="6" ry="15" />
			</g>
		</svg>
	);
}

function Desactivado() {
	return (
		<main className="deactivated-page" role="alert">
			<div className="deactivated-card">
				<SpilledCoffeeIllustration />
				<h1>Usuario no activado</h1>
				<p>
					Este usuario no se encuentra activado. Por favor, comunícate con el
					administrador.
				</p>
			</div>
		</main>
	);
}

export default Desactivado;