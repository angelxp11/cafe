import React from 'react';
import ReactDOM from 'react-dom/client';
import { doc, getDoc } from 'firebase/firestore';
import './index.css';
import './resources/colors.css';
import './resources/typography.css';
import './resources/loading/loading.css';
import './resources/navbar/navbar.css';
import './resources/auth/auth.css';
import './resources/toast/toast.css';
import './resources/deactivated.css';
import './resources/ads/expired.css';
import ExpiredScreen, { isServiceExpired } from './resources/ads/expired';
import paymentQr from './resources/images/qr.png';
import { db } from './server/api';
import App from './App';
import LoadingScreen from './resources/loading/LoadingScreen';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

function renderApp() {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

root.render(
  <React.StrictMode>
    <LoadingScreen text="Comprobando la fecha del servicio" />
  </React.StrictMode>
);

async function checkServiceExpiration() {
  try {
    const expirationDocument = await getDoc(doc(db, 'date-expired', 'date-expired'));
    if (!expirationDocument.exists()) {
      throw new Error('No existe el documento de fecha de vencimiento.');
    }

    if (isServiceExpired(expirationDocument.get('date-expired'))) {
      root.render(null);
      ExpiredScreen.init({ qrImage: paymentQr });
      return;
    }

    renderApp();
  } catch (error) {
    console.error('No se pudo comprobar la fecha del servicio.', error);
    root.render(
      <main className="expired-screen" role="alert">
        <section className="expired-card">
          <h1 className="expired-title">No se pudo comprobar el servicio</h1>
          <p className="expired-message">Revisa tu conexión y vuelve a intentarlo.</p>
          <button className="expired-btn" type="button" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </section>
      </main>
    );
  }
}

checkServiceExpiration();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
