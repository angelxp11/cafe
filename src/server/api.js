// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAUtXMHxKINB9zLFAaxIRkhwgPcIL4Rleo",
  authDomain: "cafe-40f70.firebaseapp.com",
  projectId: "cafe-40f70",
  storageBucket: "cafe-40f70.firebasestorage.app",
  messagingSenderId: "896864586889",
  appId: "1:896864586889:web:842cbc596af669a2848a58",
  measurementId: "G-Q69NZEQM1F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };